import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Package } from '../packages/schemas/package.schema';
import { Building } from '../buildings/schemas/building.schema';
import { Locker } from '../lockers/schemas/locker.schema';
import { Box } from '../lockers/schemas/box.schema';
import { LockerLog } from '../lockers/schemas/locker-log.schema';
import { User } from '../users/schemas/user.schema';
import { PackageStatus } from '../packages/enums/package.enums';
import {
  BoxStatus,
  DoorStatus,
  LockerAction,
} from '../lockers/enums/locker.enums';
import {
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from './enums/payment.enums';
import {
  CreatePaymentIntentDto,
  CreateSubscriptionIntentDto,
} from './dto/payment.dto';
import {
  generateOrderCode,
  generateVietQrPayload,
  generateVietQrUrl,
} from './utils/vietqr.util';
import { MqttService } from '../mqtt/mqtt.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Package.name)
    private readonly packageModel: Model<Package>,
    @InjectModel(Building.name)
    private readonly buildingModel: Model<Building>,
    @InjectModel(Locker.name)
    private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name)
    private readonly boxModel: Model<Box>,
    @InjectModel(LockerLog.name)
    private readonly lockerLogModel: Model<LockerLog>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly mqttService: MqttService,
  ) {}

  // Tính phí 4 chặng bậc thang theo thời lượng lưu kho kể từ droppedOffAt
  calculateFee(
    pkg: Package,
    building: Building,
    hasActiveSubscription: boolean,
  ) {
    const policy = building?.pricingPolicy ?? {
      monthlySubscriptionFee: 30000,
      perUseFee: 5000,
      t1Hours: 12,
      t2Hours: 24,
      t3Hours: 48,
      feeX1: 10000,
      feeX2: 15000,
      maxOverdueFeeCap: 25000,
    };

    const now = Date.now();
    const droppedOffAtMs = new Date(pkg.droppedOffAt).getTime();

    // Thời lượng lưu kho tính từ droppedOffAt
    const hoursElapsed = Math.ceil((now - droppedOffAtMs) / (3600 * 1000));

    // Phí cơ bản: 0đ nếu có gói tháng VIP, 5.000đ nếu dùng theo lượt
    const baseFee = hasActiveSubscription ? 0 : (policy.perUseFee ?? 5000);

    // Đã nộp phí gia hạn và vẫn trong hạn bảo chứng -> không thu thêm
    if (pkg.paidUntil && now <= new Date(pkg.paidUntil).getTime()) {
      return {
        isOverdue: false,
        feeDue: 0,
        hoursElapsed,
        currentTier: 'FREE' as const,
        isPendingRetrieval: false,
        canExtend: true,
        baseFee: 0,
        overdueFee: 0,
        paidUntil: pkg.paidUntil,
        totalFeePaid: pkg.totalFeePaid || 0,
        buildingName: building?.name,
      };
    }

    // Chặng 1: 0h -> T1 (12 giờ đầu)
    if (hoursElapsed <= policy.t1Hours) {
      return {
        isOverdue: false,
        feeDue: baseFee,
        hoursElapsed,
        currentTier: 'FREE' as const,
        isPendingRetrieval: false,
        canExtend: true,
        baseFee,
        overdueFee: 0,
        paidUntil: new Date(droppedOffAtMs + policy.t1Hours * 3600 * 1000),
        totalFeePaid: pkg.totalFeePaid || 0,
        buildingName: building?.name,
      };
    }

    // Chặng 2: T1 -> T2 (12h - 24h)
    if (hoursElapsed <= policy.t2Hours) {
      const rawFee = baseFee + policy.feeX1 - (pkg.totalFeePaid || 0);
      return {
        isOverdue: true,
        feeDue: Math.max(0, rawFee),
        hoursElapsed,
        currentTier: 'TIER_1' as const,
        isPendingRetrieval: false,
        canExtend: true,
        baseFee,
        overdueFee: policy.feeX1,
        paidUntil: pkg.paidUntil,
        totalFeePaid: pkg.totalFeePaid || 0,
        buildingName: building?.name,
      };
    }

    // Chặng 3 & 4: T2 -> T3 (24h - 48h) và > T3 (đã thu hồi kho)
    const isPendingRetrieval = hoursElapsed >= policy.t3Hours;
    const totalOverdueFee = policy.feeX1 + policy.feeX2;
    const rawFee = baseFee + totalOverdueFee - (pkg.totalFeePaid || 0);
    const maxCap = baseFee + (policy.maxOverdueFeeCap ?? 25000);

    return {
      isOverdue: true,
      feeDue: Math.max(0, Math.min(rawFee, maxCap)),
      hoursElapsed,
      currentTier: isPendingRetrieval ? 'RETRIEVAL' : 'TIER_2',
      isPendingRetrieval,
      canExtend: !isPendingRetrieval,
      baseFee,
      overdueFee: totalOverdueFee,
      paidUntil: pkg.paidUntil,
      totalFeePaid: pkg.totalFeePaid || 0,
      buildingName: building?.name,
    };
  }

  // Kiểm tra phí dịch vụ và hạn nhận hàng của bưu kiện theo biểu phí 4 chặng
  async checkFee(packageId: string) {
    if (!Types.ObjectId.isValid(packageId)) {
      throw new BadRequestException('Mã bưu kiện không hợp lệ');
    }

    const pkg = await this.packageModel
      .findById(packageId)
      .populate('buildingId', 'name code bankAccount pricingPolicy')
      .populate('residentId', 'subscriptionStatus subscriptionExpiresAt');

    if (!pkg) {
      throw new NotFoundException('Không tìm thấy bưu kiện');
    }

    const building = pkg.buildingId as unknown as Building;
    const resident = pkg.residentId as unknown as User;

    const hasActiveSubscription =
      resident?.subscriptionStatus === 'ACTIVE' &&
      resident?.subscriptionExpiresAt != null &&
      new Date() <= new Date(resident.subscriptionExpiresAt);

    return this.calculateFee(pkg, building, hasActiveSubscription);
  }

  // Khởi tạo phiên giao dịch thanh toán VietQR và sinh chuỗi dữ liệu phục vụ hiển thị
  async createPaymentIntent(dto: CreatePaymentIntentDto, userId?: string) {
    if (!Types.ObjectId.isValid(dto.packageId)) {
      throw new BadRequestException('Mã bưu kiện không hợp lệ');
    }

    const pkg = await this.packageModel
      .findById(dto.packageId)
      .populate('buildingId')
      .populate('lockerId');

    if (!pkg) {
      throw new NotFoundException('Không tìm thấy bưu kiện');
    }

    const building = pkg.buildingId as unknown as Building;
    if (
      !building?.bankAccount?.bankBin ||
      !building?.bankAccount?.accountNumber ||
      !building?.bankAccount?.accountName
    ) {
      throw new BadRequestException(
        'Ban Quản Lý tòa nhà chưa cấu hình thông tin tài khoản ngân hàng thụ hưởng',
      );
    }

    const feeInfo = await this.checkFee(dto.packageId);
    if (feeInfo.feeDue <= 0) {
      throw new BadRequestException(
        'Bưu kiện hiện không có khoản phí nào cần thanh toán',
      );
    }

    if (feeInfo.isPendingRetrieval) {
      throw new BadRequestException(
        'Bưu kiện đã vượt quá 48 giờ và đang chờ Ban Quản Lý thu hồi về kho',
      );
    }

    const activePendingPayment = await this.paymentModel.findOne({
      packageId: pkg._id,
      status: PaymentStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });

    if (
      activePendingPayment &&
      activePendingPayment.amount === feeInfo.feeDue
    ) {
      return {
        orderCode: activePendingPayment.orderCode,
        amount: activePendingPayment.amount,
        description: activePendingPayment.description,
        qrCodeUrl: activePendingPayment.qrCodeUrl,
        qrPayload: activePendingPayment.qrPayload,
        recipientAccount: activePendingPayment.recipientAccount,
        expiresAt: activePendingPayment.expiresAt,
      };
    }

    if (activePendingPayment) {
      await this.paymentModel.updateOne(
        { _id: activePendingPayment._id },
        { status: PaymentStatus.CANCELLED },
      );
    }

    let orderCode = generateOrderCode();
    let collisionCheck = await this.paymentModel.findOne({ orderCode });
    let attempts = 0;
    while (collisionCheck && attempts < 5) {
      orderCode = generateOrderCode();
      collisionCheck = await this.paymentModel.findOne({ orderCode });
      attempts++;
    }

    const description = `LOCKER ${orderCode.toString().slice(-6)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const qrCodeUrl = generateVietQrUrl({
      bankBin: building.bankAccount.bankBin,
      accountNumber: building.bankAccount.accountNumber,
      accountName: building.bankAccount.accountName,
      amount: feeInfo.feeDue,
      description,
    });

    const qrPayload = generateVietQrPayload({
      bankBin: building.bankAccount.bankBin,
      accountNumber: building.bankAccount.accountNumber,
      amount: feeInfo.feeDue,
      description,
    });

    const payment = await this.paymentModel.create({
      orderCode,
      packageId: pkg._id,
      userId: userId ? new Types.ObjectId(userId) : pkg.residentId,
      buildingId: pkg.buildingId._id || pkg.buildingId,
      lockerId: pkg.lockerId._id || pkg.lockerId,
      boxId: pkg.boxId,
      boxNumber: pkg.boxNumber,
      paymentType: dto.paymentType || PaymentType.OVERDUE_PICKUP,
      paymentMethod: PaymentMethod.VIETQR,
      amount: feeInfo.feeDue,
      extensionHours: 24,
      recipientAccount: {
        bankBin: building.bankAccount.bankBin,
        bankName: building.bankAccount.bankName || 'Napas 247',
        accountNumber: building.bankAccount.accountNumber,
        accountName: building.bankAccount.accountName,
      },
      status: PaymentStatus.PENDING,
      qrCodeUrl,
      qrPayload,
      description,
      expiresAt,
    });

    this.logger.log(
      `[PAYMENT_INTENT] Đã tạo phiên thanh toán Order #${orderCode} - Số tiền: ${feeInfo.feeDue} VNĐ`,
    );

    return {
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      qrCodeUrl: payment.qrCodeUrl,
      qrPayload: payment.qrPayload,
      recipientAccount: payment.recipientAccount,
      expiresAt: payment.expiresAt,
    };
  }

  // Khởi tạo phiên giao dịch thanh toán đăng ký hoặc gia hạn gói tháng VIP 30k
  async createSubscriptionIntent(
    dto: CreateSubscriptionIntentDto,
    userId: string,
  ) {
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Mã người dùng không hợp lệ');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    const buildingId = dto?.buildingId || user.buildingId;
    if (!buildingId || !Types.ObjectId.isValid(buildingId)) {
      throw new BadRequestException(
        'Vui lòng chọn tòa nhà để đăng ký gói dịch vụ tháng',
      );
    }

    const building = await this.buildingModel.findById(buildingId);
    if (!building) {
      throw new NotFoundException('Không tìm thấy thông tin tòa nhà');
    }

    if (
      !building?.bankAccount?.bankBin ||
      !building?.bankAccount?.accountNumber ||
      !building?.bankAccount?.accountName
    ) {
      throw new BadRequestException(
        'Ban Quản Lý tòa nhà chưa cấu hình thông tin tài khoản ngân hàng thụ hưởng',
      );
    }

    const subscriptionFee =
      building.pricingPolicy?.monthlySubscriptionFee ?? 30000;

    const activePending = await this.paymentModel.findOne({
      userId: user._id,
      paymentType: PaymentType.MONTHLY_SUBSCRIPTION,
      status: PaymentStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });

    if (activePending && activePending.amount === subscriptionFee) {
      return {
        orderCode: activePending.orderCode,
        amount: activePending.amount,
        description: activePending.description,
        qrCodeUrl: activePending.qrCodeUrl,
        qrPayload: activePending.qrPayload,
        recipientAccount: activePending.recipientAccount,
        expiresAt: activePending.expiresAt,
      };
    }

    if (activePending) {
      await this.paymentModel.updateOne(
        { _id: activePending._id },
        { status: PaymentStatus.CANCELLED },
      );
    }

    let orderCode = generateOrderCode();
    let collisionCheck = await this.paymentModel.findOne({ orderCode });
    let attempts = 0;
    while (collisionCheck && attempts < 5) {
      orderCode = generateOrderCode();
      collisionCheck = await this.paymentModel.findOne({ orderCode });
      attempts++;
    }

    const description = `SUB ${orderCode.toString().slice(-6)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const qrCodeUrl = generateVietQrUrl({
      bankBin: building.bankAccount.bankBin,
      accountNumber: building.bankAccount.accountNumber,
      accountName: building.bankAccount.accountName,
      amount: subscriptionFee,
      description,
    });

    const qrPayload = generateVietQrPayload({
      bankBin: building.bankAccount.bankBin,
      accountNumber: building.bankAccount.accountNumber,
      amount: subscriptionFee,
      description,
    });

    const payment = await this.paymentModel.create({
      orderCode,
      userId: user._id,
      buildingId: building._id,
      paymentType: PaymentType.MONTHLY_SUBSCRIPTION,
      paymentMethod: PaymentMethod.VIETQR,
      amount: subscriptionFee,
      extensionHours: 0,
      recipientAccount: {
        bankBin: building.bankAccount.bankBin,
        bankName: building.bankAccount.bankName || 'Napas 247',
        accountNumber: building.bankAccount.accountNumber,
        accountName: building.bankAccount.accountName,
      },
      status: PaymentStatus.PENDING,
      qrCodeUrl,
      qrPayload,
      description,
      expiresAt,
    });

    this.logger.log(
      `[SUBSCRIPTION_INTENT] Đã tạo phiên đăng ký gói tháng Order #${orderCode} - Cư dân: ${user.phone} - Số tiền: ${subscriptionFee} VNĐ`,
    );

    return {
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      qrCodeUrl: payment.qrCodeUrl,
      qrPayload: payment.qrPayload,
      recipientAccount: payment.recipientAccount,
      expiresAt: payment.expiresAt,
    };
  }

  // Xác nhận thanh toán thành công và cập nhật hạn lưu kho hoặc kích hoạt gói tháng
  async confirmPayment(orderCode: number, isSandbox = false) {
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        orderCode,
        status: PaymentStatus.PENDING,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          paymentMethod: isSandbox
            ? PaymentMethod.SANDBOX
            : PaymentMethod.VIETQR,
        },
      },
      { new: true },
    );

    if (!payment) {
      const alreadyPaid = await this.paymentModel.findOne({
        orderCode,
        status: PaymentStatus.PAID,
      });

      if (alreadyPaid) {
        return {
          success: true,
          message: 'Giao dịch này đã được thanh toán thành công trước đó',
          alreadyProcessed: true,
        };
      }

      throw new BadRequestException(
        'Giao dịch không tồn tại, đã hết hạn hoặc đã được xử lý trước đó',
      );
    }

    // Xử lý kích hoạt hoặc gia hạn gói dịch vụ tháng
    if (payment.paymentType === PaymentType.MONTHLY_SUBSCRIPTION) {
      const user = await this.userModel.findById(payment.userId);
      if (!user) {
        throw new NotFoundException(
          'Không tìm thấy tài khoản cư dân của giao dịch',
        );
      }

      const now = Date.now();
      const currentExpiry = user.subscriptionExpiresAt
        ? new Date(user.subscriptionExpiresAt).getTime()
        : 0;
      const baseTime = currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(baseTime + 30 * 24 * 3600 * 1000);

      user.subscriptionStatus = 'ACTIVE';
      user.subscriptionExpiresAt = newExpiry;
      await user.save();

      this.logger.log(
        `[SUBSCRIPTION_SUCCESS] Giao dịch #${orderCode} - Cư dân ${user.phone} kích hoạt gói VIP thành công đến ${newExpiry.toISOString()}`,
      );

      return {
        success: true,
        message:
          'Đăng ký gói tháng VIP thành công! Hạn sử dụng được cộng thêm 30 ngày.',
        subscriptionExpiresAt: newExpiry,
        subscriptionStatus: 'ACTIVE',
      };
    }

    const pkg = await this.packageModel.findById(payment.packageId);
    if (!pkg) {
      throw new NotFoundException(
        'Không tìm thấy kiện hàng liên kết với giao dịch',
      );
    }

    const now = Date.now();
    const baseTime = pkg.paidUntil
      ? Math.max(new Date(pkg.paidUntil).getTime(), now)
      : now;
    const newPaidUntil = new Date(
      baseTime + (payment.extensionHours || 24) * 3600 * 1000,
    );

    await this.packageModel.updateOne(
      { _id: payment.packageId },
      {
        $set: {
          paidUntil: newPaidUntil,
          status: PackageStatus.WAITING_FOR_PICKUP,
        },
        $inc: { totalFeePaid: payment.amount },
      },
    );

    this.logger.log(
      `[PAYMENT_SUCCESS] Giao dịch #${orderCode} xác nhận thành công - Gia hạn tới ${newPaidUntil.toISOString()}`,
    );

    return {
      success: true,
      message:
        'Thanh toán phí lưu kho thành công! Hạn nhận hàng được gia hạn thêm 24 giờ.',
      paidUntil: newPaidUntil,
    };
  }

  // Kích hoạt mở tủ sau khi cư dân đã quét và thanh toán thành công tại Kiosk - chỉ xử lý hành động cơ khí vật lý
  async completeKioskPickup(orderCode: number) {
    const payment = await this.paymentModel.findOne({
      orderCode,
      status: PaymentStatus.PAID,
    });

    if (!payment) {
      throw new BadRequestException(
        'Giao dịch chưa được thanh toán hoặc không tồn tại',
      );
    }

    const pkg = await this.packageModel.findById(payment.packageId);
    if (!pkg) {
      throw new NotFoundException(
        'Không tìm thấy kiện hàng liên kết với giao dịch',
      );
    }
    const boxNumber = payment.boxNumber ?? pkg.boxNumber;

    const locker = await this.lockerModel.findById(payment.lockerId);
    if (locker) {
      await this.mqttService.publishDoorUnlock(locker.code, boxNumber);
    }

    const box = await this.boxModel.findById(payment.boxId);
    if (box) {
      box.status = BoxStatus.AVAILABLE;
      box.currentPackageId = undefined;
      box.doorStatus = DoorStatus.OPEN;
      box.hasItem = false;
      await box.save();
    }

    pkg.status = PackageStatus.PICKED_UP;
    pkg.pickedUpAt = new Date();
    await pkg.save();

    await this.lockerLogModel.create({
      lockerId: payment.lockerId,
      boxNumber: payment.boxNumber,
      packageId: payment.packageId,
      action: LockerAction.PICKUP_OTP,
      performedBy: pkg.receiverPhone || 'RESIDENT',
      status: 'SUCCESS',
      metadata: {
        note: `Cư dân nộp phí quá hạn tại Kiosk #${orderCode} và mở tủ thành công`,
        orderCode,
        amount: payment.amount,
      },
    });

    this.logger.log(
      `[KIOSK_PICKUP] Giao dịch #${orderCode} - Cửa tủ số ${payment.boxNumber} đã được kích hoạt mở`,
    );

    return {
      success: true,
      message: 'Cửa ngăn tủ đã được kích hoạt mở. Hãy lấy đồ của bạn!',
      boxNumber: payment.boxNumber,
    };
  }

  // Lấy lịch sử các giao dịch thanh toán của cư dân
  async getMyPayments(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Mã người dùng không hợp lệ');
    }

    return this.paymentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .populate(
        'packageId',
        'trackingNumber receiverPhone receiverName apartment',
      )
      .populate('buildingId', 'name code')
      .populate('lockerId', 'name code');
  }

  // Tra cứu chi tiết một giao dịch theo mã orderCode duy nhất
  async getPaymentByOrderCode(orderCode: number) {
    const payment = await this.paymentModel
      .findOne({ orderCode })
      .populate(
        'packageId',
        'trackingNumber receiverPhone receiverName apartment',
      )
      .populate('buildingId', 'name code')
      .populate('lockerId', 'name code');

    if (!payment) {
      throw new NotFoundException(
        `Không tìm thấy giao dịch với mã #${orderCode}`,
      );
    }

    return payment;
  }
}
