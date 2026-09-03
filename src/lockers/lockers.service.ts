import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Locker } from './schemas/locker.schema';
import { Box } from './schemas/box.schema';
import { User } from '../users/schemas/user.schema';
import { Building } from '../buildings/schemas/building.schema';
import { CreateLockerDto } from './dto';
import { LockerStatus, BoxStatus, BoxSize, DoorStatus } from './enums';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';

@Injectable()
export class LockersService {
  constructor(
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Building.name) private readonly buildingModel: Model<Building>,
  ) {}

  // Khởi tạo trạm tủ mới kèm việc tự động sinh toàn bộ các ngăn tủ vật lý con
  async create(dto: CreateLockerDto): Promise<Locker> {
    const formattedCode = dto.code.trim().toUpperCase();
    const formattedMac = dto.macAddress.trim().toUpperCase();

    const existingCode = await this.lockerModel.findOne({
      code: formattedCode,
    });
    if (existingCode) {
      throw new ConflictException(
        `Mã trạm tủ ${formattedCode} đã tồn tại trong hệ thống`,
      );
    }

    const existingMac = await this.lockerModel.findOne({
      macAddress: formattedMac,
    });
    if (existingMac) {
      throw new ConflictException(
        `Địa chỉ MAC ${formattedMac} đã được gán cho một trạm tủ khác`,
      );
    }

    if (!Types.ObjectId.isValid(dto.buildingId)) {
      throw new BadRequestException('Mã ID tòa nhà không hợp lệ');
    }

    const building = await this.buildingModel.findById(dto.buildingId);
    if (!building) {
      throw new NotFoundException(
        'Tòa nhà đặt trạm tủ không tồn tại trong hệ thống',
      );
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
      .findOne({ code: code.trim().toUpperCase() })
      .populate('buildingId', 'name code address');

    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${code} không tồn tại`);
    }

    return locker;
  }

  // Lấy sơ đồ trạng thái toàn bộ các ngăn tủ thời gian thực phục vụ tài xế chọn ngăn
  async getBoxesByLockerCode(code: string) {
    const locker = await this.findByCode(code);
    const boxes = await this.boxModel
      .find({ lockerId: locker._id })
      .sort({ boxNumber: 1 });

    const availableCount = boxes.filter(
      (b) => b.status === BoxStatus.AVAILABLE,
    ).length;

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

  // Lấy danh sách toàn bộ các trạm tủ trong hệ sinh thái
  async findAll(): Promise<Locker[]> {
    return this.lockerModel
      .find()
      .populate('buildingId', 'name code address')
      .sort({ createdAt: -1 });
  }

  // Tìm kiếm trạm tủ theo mã định danh id
  async findById(id: string): Promise<Locker> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã ID trạm tủ không hợp lệ');
    }

    const locker = await this.lockerModel
      .findById(id)
      .populate('buildingId', 'name code address');

    if (!locker) {
      throw new NotFoundException('Trạm tủ không tồn tại trong hệ thống');
    }

    return locker;
  }
}
