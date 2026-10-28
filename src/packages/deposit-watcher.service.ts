import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Subscription } from 'rxjs';
import { Package } from './schemas';
import { PackageStatus } from './enums';
import { Locker } from '../lockers/schemas/locker.schema';
import { Box } from '../lockers/schemas/box.schema';
import { Building } from '../buildings/schemas/building.schema';
import { BoxStatus, DoorStatus, LockerAction } from '../lockers/enums';
import { Role } from '../auth/enums/role.enum';
import { MqttService, SensorEvent } from '../mqtt/mqtt.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  DepositState,
  SensorSnapshot,
  decideOnExpiry,
  decideOnSensor,
} from './utils/deposit-decision.util';
import { computeExpiredAt, resolveStorageLimitHours } from './utils/package-status.util';
import { normalizeCode, getErrorMessage } from '../common/utils/text.util';

// Theo dõi cảm biến của các ngăn đang chờ đặt hàng và tự xác nhận hoặc hủy lượt gửi theo trạng thái cảm biến
@Injectable()
export class DepositWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositWatcherService.name);
  private subscription?: Subscription;

  // Hàng đợi xử lý tuần tự theo từng ngăn để các bản tin đến dồn dập không chạy chồng lên nhau
  private readonly queues = new Map<string, Promise<void>>();

  // Các lượt gửi đã được cảnh báo cửa còn mở quá hạn, tránh ghi cảnh báo lặp mỗi phút
  private readonly warnedPackages = new Set<string>();

  constructor(
    @InjectModel(Package.name) private readonly packageModel: Model<Package>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Building.name) private readonly buildingModel: Model<Building>,
    private readonly mqttService: MqttService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  // Đăng ký lắng nghe luồng sự kiện cảm biến khi module khởi động
  onModuleInit(): void {
    this.subscription = this.mqttService.sensorEvents$.subscribe((event) => {
      this.enqueue(this.queueKey(event.lockerCode, event.boxNumber), () =>
        this.handleSensorEvent(event),
      );
    });
  }

  // Hủy đăng ký khi ứng dụng dừng
  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  // Khóa hàng đợi theo trạm và ngăn
  private queueKey(lockerCode: string, boxNumber: number): string {
    return `${normalizeCode(lockerCode)}:${boxNumber}`;
  }

  // Xếp một tác vụ vào hàng đợi của ngăn, lỗi trong tác vụ chỉ được ghi log để không làm đứt hàng đợi
  private enqueue(key: string, task: () => Promise<void>): void {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(task).catch((error: unknown) => {
      this.logger.error(`Lỗi khi xử lý lượt gửi hàng của ngăn ${key}: ${getErrorMessage(error)}`);
    });
    this.queues.set(key, next);
    void next.then(() => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    });
  }

  // Dựng trạng thái theo dõi từ bản ghi kiện đang chờ đặt hàng
  private toDepositState(pkg: Package): DepositState | null {
    if (!pkg.depositUnlockedAt) return null;
    return {
      unlockedAt: pkg.depositUnlockedAt.getTime(),
      doorOpenedAt: pkg.depositDoorOpenedAt?.getTime(),
    };
  }

  // Lưu ảnh chụp cảm biến của ngăn rồi đánh giá lượt gửi đang chờ đặt hàng (nếu có)
  private async handleSensorEvent(event: SensorEvent): Promise<void> {
    const locker = await this.lockerModel.findOne({ code: event.lockerCode }).select('_id').lean();
    if (!locker) return;

    const at = new Date(event.at);
    await this.boxModel.updateOne(
      {
        lockerId: locker._id,
        boxNumber: event.boxNumber,
        $or: [{ 'lastSensor.at': { $exists: false } }, { 'lastSensor.at': { $lte: at } }],
      },
      {
        $set: {
          lastSensor: {
            doorStatus: event.doorStatus as DoorStatus,
            hasItem: event.hasItem,
            at,
          },
        },
      },
    );

    const box = await this.boxModel
      .findOne({ lockerId: locker._id, boxNumber: event.boxNumber })
      .select('currentPackageId')
      .lean();
    if (!box?.currentPackageId) return;

    const pkg = await this.packageModel.findOne({
      _id: box.currentPackageId,
      status: PackageStatus.PENDING_DEPOSIT,
    });
    if (!pkg) return;

    const state = this.toDepositState(pkg);
    if (!state) return;

    const snapshot: SensorSnapshot = {
      doorStatus: event.doorStatus,
      hasItem: event.hasItem,
      at: event.at,
    };
    const decision = decideOnSensor(state, snapshot);

    if (decision === 'MARK_DOOR_OPENED') {
      await this.packageModel.updateOne(
        {
          _id: pkg._id,
          status: PackageStatus.PENDING_DEPOSIT,
          depositDoorOpenedAt: { $exists: false },
        },
        { $set: { depositDoorOpenedAt: at } },
      );
    } else if (decision === 'CONFIRM') {
      await this.confirmDeposit(pkg._id as Types.ObjectId);
    }
  }

  // Chốt lượt gửi: chuyển sang chờ lấy, tính lại hạn lưu kho, ghi nhật ký và báo cư dân; chỉ chạy một lần nhờ cập nhật có điều kiện
  async confirmDeposit(packageId: Types.ObjectId): Promise<void> {
    const pending = await this.packageModel
      .findOne({ _id: packageId, status: PackageStatus.PENDING_DEPOSIT })
      .select('buildingId')
      .lean();
    if (!pending) return;

    const building = await this.buildingModel
      .findById(pending.buildingId)
      .select('pricingPolicy')
      .lean();

    const now = new Date();
    const confirmed = await this.packageModel.findOneAndUpdate(
      { _id: packageId, status: PackageStatus.PENDING_DEPOSIT },
      {
        $set: {
          status: PackageStatus.WAITING_FOR_PICKUP,
          droppedOffAt: now,
          expiredAt: computeExpiredAt(now, resolveStorageLimitHours(building?.pricingPolicy)),
          depositConfirmedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
    if (!confirmed) return;
    this.warnedPackages.delete(String(packageId));

    await this.boxModel.updateOne(
      { _id: confirmed.boxId, currentPackageId: confirmed._id },
      { $set: { hasItem: true, doorStatus: DoorStatus.CLOSED } },
    );

    const locker = await this.lockerModel.findById(confirmed.lockerId).lean();
    if (!locker) return;

    await this.activityLogsService.recordLockerAction({
      locker,
      boxNumber: confirmed.boxNumber,
      packageId: confirmed._id as Types.ObjectId,
      action: LockerAction.DROP_OFF,
      performedBy: confirmed.shipperPhone,
      status: 'SUCCESS',
      actor: {
        name: confirmed.shipperName || confirmed.shipperPhone,
        phone: confirmed.shipperPhone,
        role: Role.SHIPPER,
      },
      metadata: {
        carrierName: confirmed.carrierName,
        trackingNumber: confirmed.trackingNumber,
        isShipperVerified: confirmed.isShipperVerified,
        confirmedBy: 'SENSOR',
      },
    });

    await this.notificationsService.notifyPackageDropOff(
      String(confirmed.residentId),
      String(confirmed.buildingId),
      {
        id: String(confirmed._id),
        trackingNumber: confirmed.trackingNumber,
        boxNumber: confirmed.boxNumber,
        lockerName: locker.name,
        lockerCode: locker.code,
        pinCode: confirmed.pinCode,
        carrierName: confirmed.carrierName,
        droppedOffAt: confirmed.droppedOffAt,
      },
    );

    this.notificationsService.notifyDepositResult(locker.code, {
      packageId: String(confirmed._id),
      boxNumber: confirmed.boxNumber,
      status: 'CONFIRMED',
    });
  }

  // Hủy lượt gửi: trả ngăn về trống, ghi nhật ký cảnh báo và báo cho các client đang theo dõi trạm
  async cancelDeposit(packageId: Types.ObjectId, reason: string): Promise<void> {
    const cancelled = await this.packageModel.findOneAndUpdate(
      { _id: packageId, status: PackageStatus.PENDING_DEPOSIT },
      {
        $set: {
          status: PackageStatus.DEPOSIT_CANCELLED,
          depositCancelReason: reason,
        },
      },
      { returnDocument: 'after' },
    );
    if (!cancelled) return;
    this.warnedPackages.delete(String(packageId));

    await this.boxModel.updateOne(
      { _id: cancelled.boxId, currentPackageId: cancelled._id },
      {
        $set: { status: BoxStatus.AVAILABLE, hasItem: false },
        $unset: { currentPackageId: 1 },
      },
    );

    const locker = await this.lockerModel.findById(cancelled.lockerId).lean();
    if (!locker) return;

    await this.activityLogsService.recordLockerAction({
      locker,
      boxNumber: cancelled.boxNumber,
      packageId: cancelled._id as Types.ObjectId,
      action: LockerAction.DROP_OFF,
      performedBy: cancelled.shipperPhone,
      status: 'FAILED',
      actor: {
        name: cancelled.shipperName || cancelled.shipperPhone,
        phone: cancelled.shipperPhone,
        role: Role.SHIPPER,
      },
      metadata: {
        carrierName: cancelled.carrierName,
        trackingNumber: cancelled.trackingNumber,
        reason,
      },
    });

    this.notificationsService.notifyDepositResult(locker.code, {
      packageId: String(cancelled._id),
      boxNumber: cancelled.boxNumber,
      status: 'CANCELLED',
      reason,
    });
  }

  // Mỗi phút xử lý các lượt gửi đã quá hạn chờ đặt hàng theo ảnh chụp cảm biến mới nhất
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredDeposits(): Promise<void> {
    const expired = await this.packageModel
      .find({
        status: PackageStatus.PENDING_DEPOSIT,
        depositExpiresAt: { $lt: new Date() },
      })
      .select('_id lockerId boxNumber')
      .lean();

    for (const item of expired) {
      const locker = await this.lockerModel.findById(item.lockerId).select('code').lean();
      if (!locker) continue;

      this.enqueue(this.queueKey(locker.code, item.boxNumber), () =>
        this.handleExpiry(item._id as Types.ObjectId),
      );
    }
  }

  // Quyết định số phận của một lượt gửi quá hạn dựa trên ảnh chụp cảm biến lưu trên ngăn
  private async handleExpiry(packageId: Types.ObjectId): Promise<void> {
    const pkg = await this.packageModel.findOne({
      _id: packageId,
      status: PackageStatus.PENDING_DEPOSIT,
    });
    if (!pkg) return;

    const state = this.toDepositState(pkg);
    if (!state) {
      await this.cancelDeposit(packageId, 'MISSING_UNLOCK_TIME');
      return;
    }

    const box = await this.boxModel.findById(pkg.boxId).select('lastSensor').lean();
    const lastSnapshot: SensorSnapshot | null = box?.lastSensor
      ? {
          doorStatus: box.lastSensor.doorStatus,
          hasItem: box.lastSensor.hasItem,
          at: new Date(box.lastSensor.at).getTime(),
        }
      : null;

    const decision = decideOnExpiry(state, lastSnapshot);
    if (decision === 'CONFIRM') {
      await this.confirmDeposit(packageId);
    } else if (decision === 'CANCEL') {
      await this.cancelDeposit(
        packageId,
        lastSnapshot ? 'EXPIRED_EMPTY' : 'EXPIRED_NO_SENSOR_DATA',
      );
    } else if (!this.warnedPackages.has(String(packageId))) {
      this.warnedPackages.add(String(packageId));
      this.logger.warn(
        `Lượt gửi ${String(packageId)} đã quá hạn nhưng cửa ngăn #${pkg.boxNumber} vẫn mở, giữ chỗ chờ xử lý`,
      );
    }
  }
}
