import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model } from 'mongoose';
import { Locker } from './schemas/locker.schema';
import { Box } from './schemas/box.schema';
import { LockerLog } from './schemas/locker-log.schema';
import { Package } from '../packages/schemas/package.schema';
import { BoxStatus, LockerAction } from './enums';
import { QueryLockerLogDto, UnlockBoxDto, UpdateBoxStatusDto } from './dto/box-admin.dto';
import { isLockerOnline } from './utils/locker-health.util';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { canAccessBuilding } from '../common/utils/building-scope.util';
import { MqttService } from '../mqtt/mqtt.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityCategory, ActivityStatus } from '../activity-logs/enums/activity-log.enums';
import { normalizeCode } from '../common/utils/text.util';

// Khoảng chặn giữa hai lần mở khóa từ xa trên cùng một ngăn để tránh bấm lặp
const UNLOCK_COOLDOWN_MS = 10 * 1000;

// Bản ghi lịch sử thao tác trạm tủ trả cho trang quản trị
export interface LockerLogItem {
  _id: string;
  boxNumber: number;
  packageId?: string;
  action: LockerAction;
  performedBy: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

@Injectable()
export class LockersAdminService {
  private readonly logger = new Logger(LockersAdminService.name);

  constructor(
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    @InjectModel(Package.name) private readonly packageModel: Model<Package>,
    @InjectModel(LockerLog.name)
    private readonly lockerLogModel: Model<LockerLog>,
    private readonly mqttService: MqttService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  // Nạp trạm tủ theo mã và chỉ cho phép System Admin hoặc Building Admin của đúng tòa nhà thao tác
  private async loadManageableLocker(code: string, user: AuthenticatedUser) {
    const locker = await this.lockerModel.findOne({
      code: normalizeCode(code),
    });
    if (!locker) {
      throw new NotFoundException(`Trạm tủ với mã ${code} không tồn tại`);
    }
    if (!canAccessBuilding(user, locker.buildingId)) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên trạm tủ của tòa nhà khác');
    }
    return locker;
  }

  // Lấy các ngăn tủ kèm bưu kiện đang nằm trong ngăn; không bao giờ trả OTP hay mã QR
  async getBoxes(code: string, user: AuthenticatedUser) {
    const locker = await this.loadManageableLocker(code, user);
    const boxes = await this.boxModel.find({ lockerId: locker._id }).sort({ boxNumber: 1 }).lean();

    const packageIds = boxes
      .map((box) => box.currentPackageId)
      .filter((id): id is NonNullable<typeof id> => Boolean(id));

    const packages = packageIds.length
      ? await this.packageModel
          .find({ _id: { $in: packageIds } })
          .select(
            'trackingNumber receiverName receiverPhone apartment status droppedOffAt expiredAt',
          )
          .lean()
      : [];
    const packageById = new Map(packages.map((p) => [String(p._id), p]));

    return {
      lockerCode: locker.code,
      name: locker.name,
      status: locker.status,
      totalBoxes: locker.totalBoxes,
      availableCount: boxes.filter((b) => b.status === BoxStatus.AVAILABLE).length,
      boxes: boxes.map((box) => {
        const pkg = box.currentPackageId
          ? packageById.get(String(box.currentPackageId))
          : undefined;
        return {
          _id: String(box._id),
          boxNumber: box.boxNumber,
          size: box.size,
          status: box.status,
          doorStatus: box.doorStatus,
          hasItem: box.hasItem,
          currentPackage: pkg
            ? {
                _id: String(pkg._id),
                trackingNumber: pkg.trackingNumber,
                receiverName: pkg.receiverName,
                receiverPhone: pkg.receiverPhone,
                apartment: pkg.apartment,
                status: pkg.status,
                droppedOffAt: pkg.droppedOffAt,
                expiredAt: pkg.expiredAt,
              }
            : undefined,
        };
      }),
    };
  }

  // Chuyển ngăn tủ giữa sẵn sàng và bảo trì; từ chối khi ngăn đang chứa bưu kiện
  async updateBoxStatus(
    code: string,
    boxNumber: number,
    dto: UpdateBoxStatusDto,
    user: AuthenticatedUser,
  ) {
    const locker = await this.loadManageableLocker(code, user);
    const box = await this.boxModel.findOne({ lockerId: locker._id, boxNumber });
    if (!box) {
      throw new NotFoundException(`Ngăn tủ số ${boxNumber} không tồn tại`);
    }

    if (box.status === dto.status) {
      return {
        success: true,
        changed: false,
        boxNumber,
        status: box.status,
        message: 'Ngăn tủ đã ở trạng thái này',
      };
    }

    // Điều kiện nằm trong truy vấn để ngăn vừa nhận hàng không bị chuyển sang bảo trì
    const updated = await this.boxModel.findOneAndUpdate(
      {
        _id: box._id,
        status: { $in: [BoxStatus.AVAILABLE, BoxStatus.MAINTENANCE] },
        currentPackageId: null,
      },
      { $set: { status: dto.status } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ConflictException('Ngăn tủ đang chứa bưu kiện nên không thể đổi trạng thái');
    }

    const toMaintenance = dto.status === BoxStatus.MAINTENANCE;
    await this.activityLogsService.log({
      actor: await this.activityLogsService.buildActor(user),
      buildingId: locker.buildingId,
      category: ActivityCategory.LOCKER,
      status: toMaintenance ? ActivityStatus.WARNING : ActivityStatus.INFO,
      title: toMaintenance ? 'Chuyển ngăn tủ sang bảo trì' : 'Đưa ngăn tủ hoạt động trở lại',
      description: `Ngăn #${boxNumber} - trạm ${locker.code} - Lý do: ${dto.reason}`,
      target: {
        type: 'LOCKER',
        id: String(locker._id),
        label: `${locker.code} - Ngăn #${boxNumber}`,
      },
      metadata: { boxNumber, status: dto.status },
    });

    return {
      success: true,
      changed: true,
      boxNumber,
      status: updated.status,
      message: toMaintenance ? 'Đã chuyển ngăn tủ sang bảo trì' : 'Ngăn tủ đã sẵn sàng hoạt động',
    };
  }

  // Mở khóa ngăn tủ từ xa qua MQTT; chỉ là mở cửa vật lý, không đổi trạng thái bưu kiện hay ngăn
  async unlockBox(code: string, boxNumber: number, dto: UnlockBoxDto, user: AuthenticatedUser) {
    const locker = await this.loadManageableLocker(code, user);
    const box = await this.boxModel.findOne({ lockerId: locker._id, boxNumber });
    if (!box) {
      throw new NotFoundException(`Ngăn tủ số ${boxNumber} không tồn tại`);
    }

    // Lệnh gửi cho trạm ngoại tuyến có thể được thực thi muộn và làm cửa tự bật mở, nên từ chối ngay
    if (!isLockerOnline(locker)) {
      throw new ServiceUnavailableException('Trạm tủ đang ngoại tuyến, không thể mở khóa từ xa');
    }

    const recent = await this.lockerLogModel.exists({
      lockerId: locker._id,
      boxNumber,
      action: LockerAction.REMOTE_OPEN,
      createdAt: { $gte: new Date(Date.now() - UNLOCK_COOLDOWN_MS) },
    } as QueryFilter<LockerLog>);
    if (recent) {
      throw new HttpException(
        'Vừa có lệnh mở khóa cho ngăn này, vui lòng thử lại sau vài giây',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const published = await this.mqttService.publishDoorUnlock(locker.code, boxNumber);

    // Ghi nhật ký cả khi gửi lệnh thất bại để vẫn truy vết được lần thử; lỗi ghi không được che kết quả mở cửa
    try {
      await this.activityLogsService.recordLockerAction({
        locker,
        boxNumber,
        packageId: box.currentPackageId,
        action: LockerAction.REMOTE_OPEN,
        performedBy: user.email,
        status: published ? 'SUCCESS' : 'FAILED',
        actor: await this.activityLogsService.buildActor(user),
        metadata: { reason: dto.reason },
      });
    } catch (err) {
      this.logger.error(
        `Không ghi được nhật ký mở khóa từ xa ngăn #${boxNumber} trạm ${locker.code}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!published) {
      throw new BadGatewayException('Không gửi được lệnh mở khóa tới trạm tủ, vui lòng thử lại');
    }

    return {
      success: true,
      lockerCode: locker.code,
      boxNumber,
      message: `Đã gửi lệnh mở khóa ngăn #${boxNumber}`,
    };
  }

  // Lấy lịch sử thao tác của trạm tủ trực tiếp từ LockerLog, mới nhất trước
  async getLogs(
    code: string,
    query: QueryLockerLogDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedResult<LockerLogItem>> {
    const locker = await this.loadManageableLocker(code, user);

    const filter: Record<string, unknown> = { lockerId: locker._id };
    if (query.boxNumber) filter.boxNumber = query.boxNumber;
    if (query.action) filter.action = query.action;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }

    const { page, limit } = query;
    const [logs, total] = await Promise.all([
      this.lockerLogModel
        .find(filter as QueryFilter<LockerLog>)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<(LockerLog & { createdAt: Date })[]>()
        .exec(),
      this.lockerLogModel.countDocuments(filter as QueryFilter<LockerLog>).exec(),
    ]);

    return {
      data: logs.map((log) => ({
        _id: String(log._id),
        boxNumber: log.boxNumber,
        packageId: log.packageId ? String(log.packageId) : undefined,
        action: log.action,
        performedBy: log.performedBy,
        status: log.status,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
      total,
      page,
      limit,
    };
  }
}
