// Bỏ qua bộ lập lịch thật để Jest không phải nạp gói ESM của @nestjs/schedule
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));

import { Types } from 'mongoose';
import { DepositWatcherService } from './deposit-watcher.service';
import { PackageStatus } from './enums';
import { BoxStatus } from '../lockers/enums';
import { DEPOSIT_GRACE_MS } from './utils/deposit-decision.util';

// Dựng đối tượng truy vấn giả hỗ trợ chuỗi select/lean/populate và có thể await trực tiếp
const query = <T>(value: T) => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.lean = () => q;
  q.populate = () => q;
  q.then = (resolve: (v: T) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return q;
};

describe('DepositWatcherService', () => {
  const lockerId = new Types.ObjectId();
  const boxId = new Types.ObjectId();
  const buildingId = new Types.ObjectId();
  const packageId = new Types.ObjectId();
  const unlockedAt = new Date('2026-10-16T08:00:00.000Z');

  const pendingPackage = (over: Record<string, unknown> = {}) => ({
    _id: packageId,
    status: PackageStatus.PENDING_DEPOSIT,
    lockerId,
    boxId,
    buildingId,
    boxNumber: 1,
    depositUnlockedAt: unlockedAt,
    shipperPhone: '0988888888',
    shipperName: 'Tài xế',
    residentId: new Types.ObjectId(),
    carrierName: 'J&T Express',
    trackingNumber: '855506934026',
    pinCode: '123456',
    isShipperVerified: true,
    droppedOffAt: unlockedAt,
    ...over,
  });

  const make = (pkg: ReturnType<typeof pendingPackage> | null) => {
    const packageModel = {
      findOne: jest.fn().mockImplementation(() => query(pkg)),
      findOneAndUpdate: jest.fn().mockResolvedValue(pkg),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      find: jest.fn().mockImplementation(() => query([])),
    };
    const boxModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findOne: jest
        .fn()
        .mockImplementation(() =>
          query(pkg ? { currentPackageId: packageId } : null),
        ),
      findById: jest.fn().mockImplementation(() => query(null)),
    };
    const lockerModel = {
      findOne: jest.fn().mockImplementation(() => query({ _id: lockerId })),
      findById: jest
        .fn()
        .mockImplementation(() =>
          query({ _id: lockerId, code: 'LK-TECCO-01', name: 'Trạm Tecco' }),
        ),
    };
    const buildingModel = {
      findById: jest.fn().mockImplementation(() => query({ pricingPolicy: { t3Hours: 72 } })),
    };
    const mqttService = { sensorEvents$: { subscribe: jest.fn() } };
    const notifications = {
      notifyPackageDropOff: jest.fn().mockResolvedValue(undefined),
      notifyDepositResult: jest.fn(),
    };
    const activityLogs = { recordLockerAction: jest.fn().mockResolvedValue(undefined) };

    const service = new DepositWatcherService(
      packageModel as never,
      boxModel as never,
      lockerModel as never,
      buildingModel as never,
      mqttService as never,
      notifications as never,
      activityLogs as never,
    );
    return { service, packageModel, boxModel, notifications, activityLogs };
  };

  const event = (
    doorStatus: 'OPEN' | 'CLOSED',
    hasItem: boolean,
    offsetMs: number,
  ) => ({
    lockerCode: 'LK-TECCO-01',
    boxNumber: 1,
    event: 'HEARTBEAT',
    doorStatus,
    hasItem,
    at: unlockedAt.getTime() + offsetMs,
  });

  const handle = (service: DepositWatcherService, e: ReturnType<typeof event>) =>
    (service as unknown as Record<string, (x: unknown) => Promise<void>>)[
      'handleSensorEvent'
    ](e);

  it('luôn lưu ảnh chụp cảm biến của ngăn, kể cả khi không có lượt gửi nào đang chờ', async () => {
    const { service, boxModel } = make(null);

    await handle(service, event('CLOSED', false, 1000));

    const [, update] = boxModel.updateOne.mock.calls[0] as [
      unknown,
      { $set: { lastSensor: { doorStatus: string; hasItem: boolean } } },
    ];
    expect(update.$set.lastSensor).toMatchObject({
      doorStatus: 'CLOSED',
      hasItem: false,
    });
  });

  it('thấy cửa mở thì ghi nhận thời điểm cửa mở của lượt gửi', async () => {
    const { service, packageModel } = make(pendingPackage());

    await handle(service, event('OPEN', false, 1000));

    const [filter, update] = packageModel.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: { depositDoorOpenedAt: Date } },
    ];
    expect(filter).toMatchObject({
      status: PackageStatus.PENDING_DEPOSIT,
      depositDoorOpenedAt: { $exists: false },
    });
    expect(update.$set.depositDoorOpenedAt).toBeInstanceOf(Date);
  });

  it('cửa đóng, có hàng và đã thấy cửa mở thì xác nhận, ghi nhật ký và báo cư dân', async () => {
    const pkg = pendingPackage({
      depositDoorOpenedAt: new Date(unlockedAt.getTime() + 2000),
    });
    const { service, packageModel, boxModel, notifications, activityLogs } =
      make(pkg);
    packageModel.findOneAndUpdate.mockResolvedValue({
      ...pkg,
      status: PackageStatus.WAITING_FOR_PICKUP,
    });

    await handle(service, event('CLOSED', true, 8000));

    const [filter, update] = packageModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: { status: PackageStatus; expiredAt: Date; depositConfirmedAt: Date } },
    ];
    expect(filter).toMatchObject({ status: PackageStatus.PENDING_DEPOSIT });
    expect(update.$set.status).toBe(PackageStatus.WAITING_FOR_PICKUP);
    // Hạn lưu kho tính theo mốc T3 của tòa (72 giờ), không phải 48 giờ cứng
    expect(
      update.$set.expiredAt.getTime() - update.$set.depositConfirmedAt.getTime(),
    ).toBe(72 * 3600 * 1000);

    expect(boxModel.updateOne).toHaveBeenCalledWith(
      { _id: boxId, currentPackageId: packageId },
      { $set: { hasItem: true, doorStatus: 'CLOSED' } },
    );
    expect(activityLogs.recordLockerAction).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS' }),
    );
    expect(notifications.notifyPackageDropOff).toHaveBeenCalledTimes(1);
    expect(notifications.notifyDepositResult).toHaveBeenCalledWith(
      'LK-TECCO-01',
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
  });

  it('cảm biến báo có hàng nhưng chưa thấy cửa mở và chưa hết thời gian chờ thì không xác nhận', async () => {
    const { service, packageModel, notifications } = make(pendingPackage());

    await handle(service, event('CLOSED', true, 1000));

    expect(packageModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifications.notifyPackageDropOff).not.toHaveBeenCalled();
  });

  it('bản tin báo cửa đóng có hàng sau thời gian chờ thì xác nhận dù không thấy bản tin cửa mở', async () => {
    const pkg = pendingPackage();
    const { service, packageModel } = make(pkg);
    packageModel.findOneAndUpdate.mockResolvedValue({
      ...pkg,
      status: PackageStatus.WAITING_FOR_PICKUP,
    });

    await handle(service, event('CLOSED', true, DEPOSIT_GRACE_MS + 1000));

    expect(packageModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('hủy lượt gửi sẽ trả ngăn về trống và báo kết quả hủy', async () => {
    const pkg = pendingPackage();
    const { service, packageModel, boxModel, notifications, activityLogs } =
      make(pkg);
    packageModel.findOneAndUpdate.mockResolvedValue({
      ...pkg,
      status: PackageStatus.DEPOSIT_CANCELLED,
    });

    await service.cancelDeposit(packageId, 'EXPIRED_EMPTY');

    expect(boxModel.updateOne).toHaveBeenCalledWith(
      { _id: boxId, currentPackageId: packageId },
      {
        $set: { status: BoxStatus.AVAILABLE, hasItem: false },
        $unset: { currentPackageId: 1 },
      },
    );
    expect(activityLogs.recordLockerAction).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(notifications.notifyDepositResult).toHaveBeenCalledWith(
      'LK-TECCO-01',
      expect.objectContaining({ status: 'CANCELLED', reason: 'EXPIRED_EMPTY' }),
    );
  });

  it('hủy một lượt gửi đã được xử lý trước đó thì không làm gì thêm', async () => {
    const { service, packageModel, boxModel, notifications } = make(pendingPackage());
    packageModel.findOneAndUpdate.mockResolvedValue(null);

    await service.cancelDeposit(packageId, 'EXPIRED_EMPTY');

    expect(boxModel.updateOne).not.toHaveBeenCalled();
    expect(notifications.notifyDepositResult).not.toHaveBeenCalled();
  });

  it('xác nhận hai lần thì lần hai không báo cư dân thêm', async () => {
    const pkg = pendingPackage();
    const { service, packageModel, notifications } = make(pkg);
    packageModel.findOneAndUpdate
      .mockResolvedValueOnce({ ...pkg, status: PackageStatus.WAITING_FOR_PICKUP })
      .mockResolvedValueOnce(null);

    await service.confirmDeposit(packageId);
    await service.confirmDeposit(packageId);

    expect(notifications.notifyPackageDropOff).toHaveBeenCalledTimes(1);
  });
});
