import { Types } from 'mongoose';
import { PaymentsService } from './payments.service';
import { generateSepayTransferContent } from './utils/payment-gateway.util';
import { PaymentStatus, PaymentType } from './enums/payment.enums';

describe('PaymentsService.handleSepayWebhook (chuyển thiếu tiền)', () => {
  const orderCode = 8491823912;
  const userId = new Types.ObjectId();
  const buildingId = new Types.ObjectId();

  const makePayment = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    orderCode,
    amount: 15000,
    receivedAmount: 0,
    status: PaymentStatus.PENDING,
    paymentType: PaymentType.OVERDUE_PICKUP,
    isKiosk: false,
    userId,
    buildingId,
    description: generateSepayTransferContent('LOCKER', orderCode),
    ...over,
  });

  const make = (recorded: ReturnType<typeof makePayment> | null) => {
    const paymentModel = {
      findOneAndUpdate: jest.fn().mockResolvedValueOnce(recorded),
      exists: jest.fn().mockResolvedValue(null),
    };
    const packageModel = {
      findById: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ name: 'An', phone: '0912345678' }),
        }),
      }),
    };
    const activityLogs = { log: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    const service = new PaymentsService(
      paymentModel as never,
      packageModel as never,
      {} as never,
      {} as never,
      {} as never,
      userModel as never,
      {} as never,
      activityLogs as never,
      notifications as never,
      { issueForPayment: jest.fn().mockResolvedValue(undefined) } as never,
    );
    return { service, paymentModel, activityLogs, notifications };
  };

  const webhook = (transferAmount: number, id = 1) => ({
    id,
    transferAmount,
    content: generateSepayTransferContent('LOCKER', orderCode),
  });

  it('chuyển thiếu thì giữ PENDING, báo cư dân còn thiếu và không chốt PAID', async () => {
    const { service, paymentModel, notifications, activityLogs } = make(
      makePayment({ receivedAmount: 1000 }),
    );

    const result = await service.handleSepayWebhook(webhook(1000) as never);

    expect(result).toMatchObject({
      success: true,
      partial: true,
      receivedAmount: 1000,
      remainingAmount: 14000,
    });
    // Chỉ có đúng một lần cập nhật: ghi nhận khoản tiền, không có lần chốt PAID
    expect(paymentModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(activityLogs.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'WARNING' }));
  });

  it('ghi nhận khoản tiền kèm điều kiện chống tính trùng mã giao dịch', async () => {
    const { service, paymentModel } = make(makePayment({ receivedAmount: 1000 }));

    await service.handleSepayWebhook(webhook(1000, 777) as never);

    const [filter, update] = paymentModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $inc: { receivedAmount: number }; $push: { receipts: { transactionId: string } } },
    ];
    expect(filter).toMatchObject({
      orderCode,
      status: PaymentStatus.PENDING,
      'receipts.transactionId': { $ne: '777' },
    });
    expect(update.$inc.receivedAmount).toBe(1000);
    expect(update.$push.receipts.transactionId).toBe('777');
  });

  it('đủ tiền thì chốt PAID bằng lần cập nhật có điều kiện số tiền đã nhận', async () => {
    const recorded = makePayment({ receivedAmount: 15000 });
    const { service, paymentModel } = make(recorded);
    // Lần cập nhật thứ hai (chốt PAID) trả về đơn đã chốt
    paymentModel.findOneAndUpdate.mockResolvedValueOnce({
      ...recorded,
      status: PaymentStatus.PAID,
    });

    await service.handleSepayWebhook(webhook(15000) as never).catch(() => {
      // Nhánh mở tủ/gia hạn phía sau dùng nhiều phụ thuộc khác, không thuộc phạm vi kiểm tra này
    });

    expect(paymentModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const [closeFilter] = paymentModel.findOneAndUpdate.mock.calls[1] as [Record<string, unknown>];
    expect(closeFilter).toMatchObject({
      status: PaymentStatus.PENDING,
      receivedAmount: { $gte: 15000 },
    });
  });

  it('webhook gửi lại cùng mã giao dịch được trả lời là đã xử lý, không cộng thêm', async () => {
    const { service, paymentModel } = make(null);
    paymentModel.exists.mockResolvedValueOnce({ _id: new Types.ObjectId() });

    const result = await service.handleSepayWebhook(webhook(1000) as never);

    expect(result).toMatchObject({ success: true, alreadyProcessed: true });
    expect(paymentModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('không tìm thấy đơn PENDING thì báo không thành công', async () => {
    const { service } = make(null);

    const result = await service.handleSepayWebhook(webhook(1000) as never);

    expect(result).toMatchObject({ success: false });
  });
});
