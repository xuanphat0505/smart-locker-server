import { Types } from 'mongoose';
import { BuildingsService } from './buildings.service';
import { PackageStatus } from '../packages/enums/package.enums';

describe('BuildingsService.update (đồng bộ hạn lưu kho theo mốc T3)', () => {
  const buildingId = new Types.ObjectId();

  const policy = (t3Hours: number) => ({
    monthlySubscriptionFee: 30000,
    perUseFee: 0,
    subscriberFreeHours: 24,
    t1Hours: 12,
    t2Hours: 24,
    t3Hours,
    feeX1: 10000,
    feeX2: 15000,
    maxOverdueFeeCap: 25000,
  });

  const make = (currentT3: number, updatedT3: number) => {
    const current = { _id: buildingId, name: 'Tecco', pricingPolicy: policy(currentT3) };
    const updated = { _id: buildingId, name: 'Tecco', pricingPolicy: policy(updatedT3) };

    const buildingModel = {
      findById: jest.fn().mockReturnValue({ exec: () => Promise.resolve(current) }),
      findByIdAndUpdate: jest
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve(updated) }),
    };
    const packageModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
    };
    const activityLogs = {
      log: jest.fn().mockResolvedValue(undefined),
      buildActor: jest.fn().mockResolvedValue({ name: 'BQL', role: 'BUILDING_ADMIN' }),
    };

    const service = new BuildingsService(
      buildingModel as never,
      {} as never,
      packageModel as never,
      activityLogs as never,
    );
    return { service, packageModel, activityLogs };
  };

  const actor = { userId: 'u1', email: 'bql@x.vn', role: 'BUILDING_ADMIN' } as never;

  it('đổi T3 thì cập nhật lại hạn lưu kho bằng droppedOffAt cộng số giờ mới', async () => {
    const { service, packageModel } = make(48, 72);

    await service.update(String(buildingId), { pricingPolicy: { t3Hours: 72 } } as never, actor);

    const [filter, pipeline] = packageModel.updateMany.mock.calls[0] as [
      { buildingId: Types.ObjectId; status: { $in: PackageStatus[] } },
      { $set: { expiredAt: { $add: [string, number] } } }[],
    ];
    expect(filter.buildingId).toEqual(buildingId);
    expect(filter.status.$in).toEqual([
      PackageStatus.WAITING_FOR_PICKUP,
      PackageStatus.OVERDUE,
    ]);
    expect(pipeline[0].$set.expiredAt.$add).toEqual(['$droppedOffAt', 72 * 3600 * 1000]);
  });

  it('đổi T3 thì đưa kiện quá hạn về chờ lấy và chuyển kiện mới quá hạn sang OVERDUE', async () => {
    const { service, packageModel } = make(48, 72);

    await service.update(String(buildingId), { pricingPolicy: { t3Hours: 72 } } as never, actor);

    expect(packageModel.updateMany).toHaveBeenCalledTimes(3);
    const [restoreFilter, restoreUpdate] = packageModel.updateMany.mock.calls[1] as [
      Record<string, unknown>,
      { $set: { status: PackageStatus } },
    ];
    expect(restoreFilter).toMatchObject({ status: PackageStatus.OVERDUE });
    expect(restoreUpdate.$set.status).toBe(PackageStatus.WAITING_FOR_PICKUP);

    const [overdueFilter, overdueUpdate] = packageModel.updateMany.mock.calls[2] as [
      Record<string, unknown>,
      { $set: { status: PackageStatus } },
    ];
    expect(overdueFilter).toMatchObject({ status: PackageStatus.WAITING_FOR_PICKUP });
    expect(overdueUpdate.$set.status).toBe(PackageStatus.OVERDUE);
  });

  it('ghi nhật ký đồng bộ kèm số kiện bị ảnh hưởng', async () => {
    const { service, activityLogs } = make(48, 72);

    await service.update(String(buildingId), { pricingPolicy: { t3Hours: 72 } } as never, actor);

    expect(activityLogs.log).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Đồng bộ hạn lưu kho theo mốc T3 mới' }),
    );
  });

  it('không đổi T3 thì không đụng tới các kiện', async () => {
    const { service, packageModel } = make(48, 48);

    await service.update(String(buildingId), { pricingPolicy: { perUseFee: 6000 } } as never, actor);

    expect(packageModel.updateMany).not.toHaveBeenCalled();
  });

  it('từ chối thời gian miễn phí của gói tháng ngoài khoảng T1 đến T3', async () => {
    const { service } = make(48, 48);

    await expect(
      service.update(String(buildingId), { pricingPolicy: { subscriberFreeHours: 6 } } as never, actor),
    ).rejects.toThrow('khoảng từ T1 đến T3');
    await expect(
      service.update(String(buildingId), { pricingPolicy: { subscriberFreeHours: 60 } } as never, actor),
    ).rejects.toThrow('khoảng từ T1 đến T3');
  });

  it('chấp nhận thời gian miễn phí của gói tháng nằm trong khoảng T1 đến T3', async () => {
    const { service } = make(48, 48);

    await expect(
      service.update(String(buildingId), { pricingPolicy: { subscriberFreeHours: 48 } } as never, actor),
    ).resolves.toBeDefined();
  });

  it('không sửa biểu phí thì không đụng tới các kiện', async () => {
    const { service, packageModel } = make(48, 48);

    await service.update(String(buildingId), { name: 'Tên mới' } as never, actor);

    expect(packageModel.updateMany).not.toHaveBeenCalled();
  });
});
