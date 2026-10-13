import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';
import { Package } from './schemas';
import { PackageStatus } from './enums';
import { Locker } from '../lockers/schemas/locker.schema';
import { Box } from '../lockers/schemas/box.schema';
import { BoxStatus, DoorStatus, LockerAction } from '../lockers/enums';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { PaginatedResult } from '../common/dto/pagination.dto';
import {
  canAccessBuilding,
  resolveBuildingScope,
} from '../common/utils/building-scope.util';
import { escapeRegex } from '../common/utils/escape-regex.util';
import { MqttService } from '../mqtt/mqtt.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityCategory, ActivityStatus } from '../activity-logs/enums/activity-log.enums';
import {
  AdminPackageItemDto,
  QueryAdminPackagesDto,
  ReturnPackageDto,
} from './dto/admin-package.dto';
import {
  ADMIN_PACKAGE_EXCLUDED_FIELDS,
  toAdminPackageItem,
} from './utils/admin-package.mapper';
import { generateUniquePinCode } from './utils/pin-code.util';

// Thời gian tối thiểu giữa hai lần cấp lại OTP cho cùng một bưu kiện
const OTP_REISSUE_COOLDOWN_MS = 60 * 1000;

// Các trạng thái mà bưu kiện còn nằm trong ngăn tủ và có thể xử lý bởi Ban Quản Lý
const IN_LOCKER_STATUSES = [
  PackageStatus.WAITING_FOR_PICKUP,
  PackageStatus.OVERDUE,
];

@Injectable()
export class PackagesAdminService {
  private readonly logger = new Logger(PackagesAdminService.name);

  constructor(
    @InjectModel(Package.name) private readonly packageModel: Model<Package>,
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    private readonly mqttService: MqttService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  // Lấy danh sách bưu kiện theo phạm vi tòa nhà, không chứa OTP và mã QR
  async findAll(
    user: AuthenticatedUser,
    query: QueryAdminPackagesDto,
  ): Promise<PaginatedResult<AdminPackageItemDto>> {
    const filter: QueryFilter<Package> = {};

    const scope = resolveBuildingScope(user, query.buildingId);
    if (scope) filter.buildingId = scope;
    if (query.status) filter.status = query.status;
    if (query.lockerId) filter.lockerId = new Types.ObjectId(query.lockerId);

    const term = query.search?.trim();
    if (term) {
      const prefix = new RegExp(`^${escapeRegex(term)}`, 'i');
      filter.$or = [
        { trackingNumber: new RegExp(`^${escapeRegex(term.toUpperCase())}`) },
        { receiverPhone: prefix },
        { shipperPhone: prefix },
        { receiverName: new RegExp(escapeRegex(term), 'i') },
      ];
    }

    const { page, limit } = query;
    const [packages, total] = await Promise.all([
      this.packageModel
        .find(filter)
        .select(ADMIN_PACKAGE_EXCLUDED_FIELDS)
        .populate('lockerId', 'name code')
        .populate('buildingId', 'name')
        .sort({ droppedOffAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<Package[]>()
        .exec(),
      this.packageModel.countDocuments(filter).exec(),
    ]);

    return { data: packages.map(toAdminPackageItem), total, page, limit };
  }

  // Lấy chi tiết một bưu kiện cho admin sau khi kiểm tra đúng phạm vi tòa nhà
  async findOne(
    id: string,
    user: AuthenticatedUser,
  ): Promise<AdminPackageItemDto> {
    this.assertValidId(id);

    const pkg = await this.packageModel
      .findById(id)
      .select(ADMIN_PACKAGE_EXCLUDED_FIELDS)
      .populate('lockerId', 'name code')
      .populate('buildingId', 'name')
      .lean<Package>()
      .exec();

    if (!pkg) {
      throw new NotFoundException('Kiện hàng không tồn tại trong hệ thống');
    }
    this.assertCanManage(user, pkg.buildingId);

    return toAdminPackageItem(pkg);
  }

  // Thu hồi bưu kiện về kho Ban Quản Lý: đổi trạng thái, giải phóng ngăn và mở cửa để lấy hàng ra
  async returnToStorage(
    id: string,
    user: AuthenticatedUser,
    dto: ReturnPackageDto,
  ) {
    const pkg = await this.loadManageablePackage(id, user);

    // Cập nhật có điều kiện trạng thái để hai yêu cầu đồng thời chỉ thành công một lần
    const updated = await this.packageModel.findOneAndUpdate(
      { _id: pkg._id, status: { $in: IN_LOCKER_STATUSES } },
      { $set: { status: PackageStatus.RETURNED } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ConflictException(
        'Bưu kiện không còn ở trạng thái có thể thu hồi',
      );
    }

    await this.boxModel.updateOne(
      { _id: pkg.boxId, currentPackageId: pkg._id },
      {
        $set: {
          status: BoxStatus.AVAILABLE,
          doorStatus: DoorStatus.OPEN,
          hasItem: false,
        },
        $unset: { currentPackageId: 1 },
      },
    );

    const locker = await this.lockerModel.findById(pkg.lockerId);
    let doorUnlocked = false;
    if (locker) {
      doorUnlocked = await this.mqttService.publishDoorUnlock(
        locker.code,
        pkg.boxNumber,
      );

      await this.activityLogsService.recordLockerAction({
        locker,
        boxNumber: pkg.boxNumber,
        packageId: pkg._id,
        action: LockerAction.OVERDUE_RETRIEVAL,
        performedBy: user.email,
        status: 'SUCCESS',
        actor: await this.activityLogsService.buildActor(user),
        metadata: {
          trackingNumber: pkg.trackingNumber,
          previousStatus: pkg.status,
          reason: dto.reason,
          doorUnlocked,
        },
      });
    }

    return {
      success: true,
      message: doorUnlocked
        ? 'Đã thu hồi bưu kiện và mở cửa ngăn tủ để lấy hàng'
        : 'Đã thu hồi bưu kiện nhưng chưa gửi được lệnh mở cửa, vui lòng mở ngăn thủ công',
      packageId: String(pkg._id),
      status: PackageStatus.RETURNED,
      boxNumber: pkg.boxNumber,
      doorUnlocked,
    };
  }

  // Cấp lại mã OTP mới cho bưu kiện và gửi cho cư dân, mã không được trả về cho admin
  async resendOtp(id: string, user: AuthenticatedUser) {
    const pkg = await this.loadManageablePackage(id, user);

    if (!IN_LOCKER_STATUSES.includes(pkg.status)) {
      throw new ConflictException(
        'Chỉ cấp lại OTP cho bưu kiện đang nằm trong ngăn tủ',
      );
    }

    const now = new Date();
    if (
      pkg.otpReissuedAt &&
      now.getTime() - pkg.otpReissuedAt.getTime() < OTP_REISSUE_COOLDOWN_MS
    ) {
      throw new HttpException(
        'Vừa cấp lại OTP gần đây, vui lòng thử lại sau ít phút',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const pinCode = await generateUniquePinCode(
      this.packageModel,
      pkg.lockerId,
      pkg._id,
    );

    const updated = await this.packageModel.findOneAndUpdate(
      { _id: pkg._id, status: { $in: IN_LOCKER_STATUSES } },
      {
        $set: { pinCode, otpReissuedAt: now, failedAttempts: 0 },
        $unset: { lockedUntil: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ConflictException('Bưu kiện đã thay đổi trạng thái');
    }

    const locker = await this.lockerModel.findById(pkg.lockerId);
    await this.notificationsService.notifyPackageOtpReissued(
      String(pkg.residentId),
      String(pkg.buildingId),
      {
        id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        boxNumber: pkg.boxNumber,
        lockerCode: locker?.code ?? '',
        pinCode,
      },
    );

    await this.activityLogsService.log({
      actor: await this.activityLogsService.buildActor(user),
      buildingId: pkg.buildingId,
      category: ActivityCategory.PACKAGE,
      status: ActivityStatus.INFO,
      title: 'Cấp lại mã OTP cho bưu kiện',
      description: `Đơn ${pkg.trackingNumber} - Ngăn #${pkg.boxNumber}`,
      target: {
        type: 'PACKAGE',
        id: String(pkg._id),
        label: pkg.trackingNumber,
      },
    });

    return {
      success: true,
      message: 'Đã cấp lại OTP và gửi cho cư dân',
      otpReissuedAt: now,
    };
  }

  // Kiểm tra mã bưu kiện có đúng định dạng ObjectId hay không
  private assertValidId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã bưu kiện không hợp lệ');
    }
  }

  // Chỉ System Admin hoặc Building Admin của đúng tòa nhà mới được thao tác trên bưu kiện
  private assertCanManage(user: AuthenticatedUser, buildingId: unknown): void {
    if (!canAccessBuilding(user, buildingId)) {
      throw new ForbiddenException(
        'Bạn không có quyền thao tác trên bưu kiện của tòa nhà khác',
      );
    }
  }

  // Nạp bưu kiện đầy đủ (kể cả OTP, chỉ dùng nội bộ) rồi kiểm tra quyền thao tác của người gọi
  private async loadManageablePackage(id: string, user: AuthenticatedUser) {
    this.assertValidId(id);

    const pkg = await this.packageModel.findById(id);
    if (!pkg) {
      throw new NotFoundException('Kiện hàng không tồn tại trong hệ thống');
    }
    this.assertCanManage(user, pkg.buildingId);

    return pkg;
  }
}
