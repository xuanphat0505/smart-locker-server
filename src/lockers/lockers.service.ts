import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Locker } from './schemas/locker.schema';
import { Box } from './schemas/box.schema';
import { User } from '../users/schemas/user.schema';
import { Building } from '../buildings/schemas/building.schema';
import { CreateLockerDto, UpdateLockerDto } from './dto';
import { LockerStatus, BoxStatus, BoxSize, DoorStatus } from './enums';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { HEARTBEAT_TIMEOUT_MS } from './utils/locker-health.util';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityCategory, ActivityStatus } from '../activity-logs/enums/activity-log.enums';
import { normalizeCode } from '../common/utils/text.util';

// Trạm tủ trả về cho trang quản trị, kèm trạng thái hiệu lực và số ngăn trống/đang chứa hàng
export interface LockerListItem {
  _id: Types.ObjectId;
  name: string;
  code: string;
  status: LockerStatus;
  totalBoxes: number;
  availableBoxes: number;
  occupiedBoxes: number;
  lastHeartbeatAt?: Date;
  locationDescription?: string;
  coordinates?: { latitude: number; longitude: number };
  buildingId: unknown;
}

@Injectable()
export class LockersService {
  constructor(
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Building.name) private readonly buildingModel: Model<Building>,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  // Khởi tạo trạm tủ mới kèm việc tự động sinh toàn bộ các ngăn tủ vật lý con
  async create(dto: CreateLockerDto): Promise<Locker> {
    const formattedCode = normalizeCode(dto.code);
    const formattedMac = normalizeCode(dto.macAddress);

    const existingCode = await this.lockerModel.findOne({
      code: formattedCode,
    });
    if (existingCode) {
      throw new ConflictException(`Mã trạm tủ ${formattedCode} đã tồn tại trong hệ thống`);
    }

    const existingMac = await this.lockerModel.findOne({
      macAddress: formattedMac,
    });
    if (existingMac) {
      throw new ConflictException(`Địa chỉ MAC ${formattedMac} đã được gán cho một trạm tủ khác`);
    }

    if (!Types.ObjectId.isValid(dto.buildingId)) {
      throw new BadRequestException('Mã ID tòa nhà không hợp lệ');
    }

    const building = await this.buildingModel.findById(dto.buildingId);
    if (!building) {
      throw new NotFoundException('Tòa nhà đặt trạm tủ không tồn tại trong hệ thống');
    }

    const generatedApiKey = crypto.randomBytes(24).toString('hex');

    const createdLocker = await this.lockerModel.create({
      name: dto.name.trim(),
      code: formattedCode,
      buildingId: new Types.ObjectId(dto.buildingId),
      totalBoxes: dto.totalBoxes,
      macAddress: formattedMac,
      apiKey: generatedApiKey,
      status: LockerStatus.ONLINE,
      locationDescription: dto.locationDescription?.trim(),
      coordinates: dto.coordinates,
    });

    const boxesToInsert: Array<{
      lockerId: Types.ObjectId;
      boxNumber: number;
      size: BoxSize;
      status: BoxStatus;
      doorStatus: DoorStatus;
      hasItem: boolean;
    }> = [];
    if (dto.boxesConfig && dto.boxesConfig.length > 0) {
      for (const boxCfg of dto.boxesConfig) {
        boxesToInsert.push({
          lockerId: createdLocker._id,
          boxNumber: boxCfg.boxNumber,
          size: boxCfg.size,
          status: BoxStatus.AVAILABLE,
          doorStatus: DoorStatus.CLOSED,
          hasItem: false,
        });
      }
    } else {
      const total = dto.totalBoxes;
      const smallThreshold = Math.round(total * 0.35);
      const mediumThreshold = Math.round(total * 0.8);

      for (let i = 1; i <= total; i++) {
        let size = BoxSize.MEDIUM;
        if (i <= smallThreshold) {
          size = BoxSize.SMALL;
        } else if (i > mediumThreshold) {
          size = BoxSize.LARGE;
        }

        boxesToInsert.push({
          lockerId: createdLocker._id,
          boxNumber: i,
          size,
          status: BoxStatus.AVAILABLE,
          doorStatus: DoorStatus.CLOSED,
          hasItem: false,
        });
      }
    }

    await this.boxModel.insertMany(boxesToInsert);

    return createdLocker;
  }

  // Tra cứu thông tin chi tiết một trạm tủ theo mã định danh
  async findByCode(code: string): Promise<Locker> {
    const locker = await this.lockerModel
      .findOne({ code: normalizeCode(code) })
      .populate('buildingId', 'name code address');

    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${code} không tồn tại`);
    }

    return locker;
  }

  // Kiểm tra trạng thái trực tuyến và sức khỏe kết nối thời gian thực của trạm tủ
  async getLockerHealth(code: string) {
    const formattedCode = normalizeCode(code);
    const locker = await this.lockerModel.findOne({ code: formattedCode });

    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${code} không tồn tại`);
    }

    const now = Date.now();
    const lastHeartbeat = locker.lastHeartbeatAt ? new Date(locker.lastHeartbeatAt).getTime() : 0;
    const diffMs = now - lastHeartbeat;

    // Trạm tủ được coi là Online nếu trạng thái là ONLINE và có nhịp tim trong vòng 75 giây
    const isOnline =
      locker.status === LockerStatus.ONLINE && lastHeartbeat > 0 && diffMs <= HEARTBEAT_TIMEOUT_MS;

    return {
      code: locker.code,
      name: locker.name,
      status: isOnline ? LockerStatus.ONLINE : LockerStatus.OFFLINE,
      isOnline,
      lastHeartbeatAt: locker.lastHeartbeatAt || null,
      latencySeconds: lastHeartbeat > 0 ? Math.round(diffMs / 1000) : null,
    };
  }

  // Lấy sơ đồ trạng thái toàn bộ các ngăn tủ thời gian thực phục vụ tài xế chọn ngăn
  async getBoxesByLockerCode(code: string) {
    const locker = await this.findByCode(code);
    const boxes = await this.boxModel.find({ lockerId: locker._id }).sort({ boxNumber: 1 });

    const availableCount = boxes.filter((b) => b.status === BoxStatus.AVAILABLE).length;

    return {
      lockerCode: locker.code,
      name: locker.name,
      totalBoxes: locker.totalBoxes,
      availableCount,
      boxes: boxes.map((b) => ({
        _id: String(b._id),
        boxNumber: b.boxNumber,
        size: b.size,
        status: b.status,
        doorStatus: b.doorStatus,
        hasItem: b.hasItem,
      })),
    };
  }

  // Tra cứu xác minh cư dân hợp lệ của tòa nhà qua số điện thoại trước khi mở tủ gửi hàng
  async lookupReceiver(phone: string, lockerCode: string) {
    const normalizedPhone = phone.trim();
    const locker = await this.findByCode(lockerCode);

    const building = locker.buildingId as unknown as {
      _id: Types.ObjectId;
      name?: string;
    };
    const targetBuildingId = building?._id || locker.buildingId;

    const resident = await this.userModel.findOne({
      phone: normalizedPhone,
      buildingId: targetBuildingId,
      role: Role.RESIDENT,
      approvalStatus: ApprovalStatus.ACTIVE,
    });

    if (!resident) {
      throw new NotFoundException(
        'Số điện thoại này chưa được đăng ký làm cư dân của tòa nhà hoặc tài khoản chưa được duyệt',
      );
    }

    return {
      found: true,
      receiverId: String(resident._id),
      receiverName: resident.name,
      apartment: resident.apartment || '',
      buildingName: building?.name || '',
      buildingId: String(targetBuildingId),
    };
  }

  // Lấy danh sách trạm tủ: System Admin thấy toàn hệ thống, Building Admin chỉ thấy tủ thuộc tòa nhà của mình
  async findAll(user: AuthenticatedUser): Promise<LockerListItem[]> {
    const filter: Record<string, unknown> = {};
    if (user.role === Role.BUILDING_ADMIN) {
      if (!user.buildingId || !Types.ObjectId.isValid(user.buildingId)) {
        throw new ForbiddenException(
          'Tài khoản quản lý chưa được gán tòa nhà nên không thể xem trạm tủ',
        );
      }
      filter.buildingId = new Types.ObjectId(user.buildingId);
    }

    const lockers = await this.lockerModel
      .find(filter)
      .populate('buildingId', 'name code address')
      .sort({ createdAt: -1 })
      .lean();

    if (lockers.length === 0) {
      return [];
    }

    // Đếm số ngăn trống và số ngăn đang chứa hàng của từng trạm
    const boxCounts = await this.boxModel.aggregate<{
      _id: Types.ObjectId;
      available: number;
      occupied: number;
    }>([
      { $match: { lockerId: { $in: lockers.map((l) => l._id) } } },
      {
        $group: {
          _id: '$lockerId',
          available: {
            $sum: { $cond: [{ $eq: ['$status', BoxStatus.AVAILABLE] }, 1, 0] },
          },
          occupied: {
            $sum: { $cond: [{ $eq: ['$status', BoxStatus.OCCUPIED] }, 1, 0] },
          },
        },
      },
    ]);
    const countByLocker = new Map(boxCounts.map((c) => [String(c._id), c]));

    return lockers.map((locker) => {
      const counts = countByLocker.get(String(locker._id));
      return {
        ...locker,
        status: this.resolveEffectiveStatus(locker.status, locker.lastHeartbeatAt),
        availableBoxes: counts?.available ?? 0,
        occupiedBoxes: counts?.occupied ?? 0,
      };
    });
  }

  // Tính trạng thái thực tế: tủ báo ONLINE nhưng quá hạn nhịp tim thì coi là OFFLINE
  private resolveEffectiveStatus(status: LockerStatus, lastHeartbeatAt?: Date): LockerStatus {
    if (status !== LockerStatus.ONLINE) {
      return status;
    }
    const lastHeartbeat = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : 0;
    const isAlive = lastHeartbeat > 0 && Date.now() - lastHeartbeat <= HEARTBEAT_TIMEOUT_MS;
    return isAlive ? LockerStatus.ONLINE : LockerStatus.OFFLINE;
  }

  // Tìm kiếm trạm tủ theo mã định danh id
  async findById(id: string): Promise<Locker> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã ID trạm tủ không hợp lệ');
    }

    const locker = await this.lockerModel.findById(id).populate('buildingId', 'name code address');

    if (!locker) {
      throw new NotFoundException('Trạm tủ không tồn tại trong hệ thống');
    }

    return locker;
  }

  // Cập nhật thông tin cấu hình, vị trí hoặc tọa độ GPS trạm tủ (id có thể là ObjectId hoặc mã code)
  async update(id: string, dto: UpdateLockerDto, user: AuthenticatedUser): Promise<Locker> {
    let locker = Types.ObjectId.isValid(id) ? await this.lockerModel.findById(id) : null;

    if (!locker) {
      locker = await this.lockerModel.findOne({
        code: normalizeCode(id),
      });
    }

    if (!locker) {
      throw new NotFoundException('Trạm tủ không tồn tại trong hệ thống');
    }

    // Building Admin chỉ được chỉnh sửa trạm tủ thuộc tòa nhà do mình quản lý
    if (
      user.role === Role.BUILDING_ADMIN &&
      String(locker.buildingId) !== String(user.buildingId)
    ) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa trạm tủ của tòa nhà khác');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }
    if (dto.locationDescription !== undefined) {
      updateData.locationDescription = dto.locationDescription.trim();
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }
    if (dto.coordinates !== undefined) {
      updateData.coordinates = {
        latitude: dto.coordinates.latitude,
        longitude: dto.coordinates.longitude,
      };
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Không có thông tin nào để cập nhật');
    }

    const updated = await this.lockerModel
      .findByIdAndUpdate(locker._id, { $set: updateData }, { returnDocument: 'after' })
      .populate('buildingId', 'name code address');

    if (!updated) {
      throw new NotFoundException('Trạm tủ không tồn tại trong hệ thống');
    }

    await this.activityLogsService.log({
      actor: await this.activityLogsService.buildActor(user),
      buildingId: locker.buildingId,
      category: ActivityCategory.SETTINGS,
      status:
        dto.status === LockerStatus.MAINTENANCE ? ActivityStatus.WARNING : ActivityStatus.INFO,
      title: 'Cập nhật thông tin trạm tủ',
      description: `Trạm ${locker.code} - Trường thay đổi: ${Object.keys(updateData).join(', ')}`,
      target: { type: 'LOCKER', id: String(locker._id), label: locker.code },
    });

    return updated;
  }
}
