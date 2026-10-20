import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Package } from '../packages/schemas/package.schema';
import { Building } from '../buildings/schemas/building.schema';
import { Locker } from '../lockers/schemas/locker.schema';
import { Box } from '../lockers/schemas/box.schema';
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
  SepayWebhookDto,
} from './dto';
import {
  generateSepayCheckoutUrl,
  initSepayOneTimePaymentFields,
  generateSepayQrUrl,
  generateSepayTransferContent,
  parseOrderCodeFromContent,
  parseSepayPgCodeFromContent,
  lookupOrderInvoiceByPayCode,
  generateOrderCode,
} from './utils/sepay.util';
import { generateVietQrPayload } from './utils/vietqr.util';
import { isPaymentConfigured } from '../buildings/utils/payment-config.util';
import {
  PaymentReceipt,
  calculateRemaining,
  emptyCredit,
  isFullyPaid,
  resolveTransactionId,
  sumCredit,
} from './utils/payment-receipt.util';
import {
  buildPricingTiers,
  mergePricingPolicy,
} from './utils/pricing-policy.util';
import { calculateStorageFee } from './utils/storage-fee.util';
import {
  InvoicePackageInput,
  InvoicePaymentInput,
  buildInvoices,
} from './utils/invoice.util';
import { MqttService } from '../mqtt/mqtt.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../notifications/enums/notification.enums';
import {
  ActivityCategory,
  ActivityStatus,
} from '../activity-logs/enums/activity-log.enums';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

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
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly mqttService: MqttService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Tính phí lưu kho theo biểu phí của tòa nhà, người có gói tháng được miễn phí lâu hơn và phụ thu nhẹ hơn
  calculateFee(
    pkg: Package,
    building: Building,
    hasActiveSubscription: boolean,
  ) {
    const policy = mergePricingPolicy(building?.pricingPolicy);

    const result = calculateStorageFee({
      droppedOffAt: pkg.droppedOffAt,
      paidUntil: pkg.paidUntil,
      totalFeePaid: pkg.totalFeePaid,
      now: Date.now(),
      policy,
      hasActiveSubscription,
    });

    return { ...result, buildingName: building?.name, policy };
  }

  // Lấy biểu phí lưu kho của tòa nhà để cư dân xem, không kèm thông tin tài khoản ngân hàng
  async getResidentPricing(buildingId?: string) {
    if (!buildingId || !Types.ObjectId.isValid(buildingId)) {
      throw new BadRequestException(
        'Tài khoản chưa được liên kết với Tòa nhà nào',
      );
    }

    const building = await this.buildingModel
      .findById(buildingId)
      .select('name pricingPolicy')
      .lean()
      .exec();

    if (!building) {
      throw new NotFoundException('Không tìm thấy thông tin tòa nhà');
    }

    const policy = mergePricingPolicy(building.pricingPolicy);

    return {
      buildingId: String(building._id),
      buildingName: building.name,
      policy,
      tiers: buildPricingTiers(policy),
    };
  }

  // Chuyển giá trị ObjectId hoặc document đã populate về chuỗi mã định danh để so sánh quyền sở hữu
  private toIdString(value: unknown): string {
    if (value && typeof value === 'object' && '_id' in value) {
      return String((value as { _id: unknown })._id);
    }
    return String(value);
  }

  // Chỉ cho phép chủ sở hữu, Ban Quản Lý cùng tòa nhà hoặc System Admin truy cập dữ liệu thanh toán
  private assertResourceAccess(
    user: AuthenticatedUser,
    ownerId: unknown,
    buildingId: unknown,
  ) {
    if (user.role === Role.SYSTEM_ADMIN) return;

    if (
      user.role === Role.BUILDING_ADMIN &&
      user.buildingId &&
      buildingId &&
      this.toIdString(buildingId) === String(user.buildingId)
    ) {
      return;
    }

    if (
      user.role === Role.RESIDENT &&
      ownerId &&
      this.toIdString(ownerId) === String(user.userId)
    ) {
      return;
    }

    throw new ForbiddenException(
      'Bạn không có quyền truy cập dữ liệu thanh toán này',
    );
  }

  // Kiểm tra phí của bưu kiện sau khi xác nhận người gọi là chủ đơn, Ban Quản Lý tòa nhà hoặc System Admin
  async checkFeeForUser(packageId: string, user: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(packageId)) {
      throw new BadRequestException('Mã bưu kiện không hợp lệ');
    }

    const pkg = await this.packageModel
      .findById(packageId)
      .select('residentId buildingId')
      .lean();

    if (!pkg) {
      throw new NotFoundException('Không tìm thấy bưu kiện');
    }

    this.assertResourceAccess(user, pkg.residentId, pkg.buildingId);
    return this.checkFee(packageId);
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
  async createPaymentIntent(
    dto: CreatePaymentIntentDto,
    userId?: string,
    options: { isKiosk?: boolean } = {},
  ) {
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
    if (!isPaymentConfigured(building)) {
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
        `Bưu kiện đã vượt quá ${feeInfo.policy.t3Hours} giờ và đang chờ Ban Quản Lý thu hồi về kho`,
      );
    }

    // Tìm giao dịch chờ thanh toán gần nhất của kiện hàng này
    const activePendingPayment = await this.paymentModel
      .findOne({
        packageId: pkg._id,
        status: PaymentStatus.PENDING,
      })
      .sort({ createdAt: -1 });

    if (
      activePendingPayment &&
      activePendingPayment.amount === feeInfo.feeDue
    ) {
      // Gia hạn thời gian chờ thanh toán thêm 15 phút tính từ thời điểm hiện tại
      const renewedExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const isKioskMode =
        options.isKiosk ?? activePendingPayment.isKiosk ?? false;

      activePendingPayment.expiresAt = renewedExpiresAt;
      activePendingPayment.isKiosk = isKioskMode;
      if (userId && !activePendingPayment.userId) {
        activePendingPayment.userId = new Types.ObjectId(userId);
      }
      await activePendingPayment.save();

      const checkoutFormFields = initSepayOneTimePaymentFields({
        orderCode: activePendingPayment.orderCode,
        amount: activePendingPayment.amount,
        description:
          activePendingPayment.description ||
          generateSepayTransferContent(
            'LOCKER',
            activePendingPayment.orderCode,
          ),
      });

      this.logger.log(
        `[PAYMENT_INTENT_REUSE] Tái sử dụng và gia hạn đơn hàng PENDING #${activePendingPayment.orderCode} - Hạn mới: ${renewedExpiresAt.toISOString()}`,
      );

      return {
        orderCode: activePendingPayment.orderCode,
        amount: activePendingPayment.amount,
        description: activePendingPayment.description,
        paymentUrl: activePendingPayment.paymentUrl,
        checkoutFormFields,
        qrCodeUrl: activePendingPayment.qrCodeUrl,
        qrPayload: activePendingPayment.qrPayload,
        recipientAccount: activePendingPayment.recipientAccount,
        expiresAt: renewedExpiresAt,
        isKiosk: isKioskMode,
        receivedAmount: activePendingPayment.receivedAmount ?? 0,
        remainingAmount: calculateRemaining(
          activePendingPayment.amount,
          activePendingPayment.receivedAmount,
        ),
      };
    }

    // Hủy các đơn chờ cũ khi số tiền phí đã đổi do chuyển khung giờ và chuyển phần tiền đã nhận sang đơn mới
    const credit = activePendingPayment
      ? await this.cancelPendingAndCollectCredit({ packageId: pkg._id })
      : emptyCredit();

    let orderCode = generateOrderCode();
    let collisionCheck = await this.paymentModel.findOne({ orderCode });
    let attempts = 0;
    while (collisionCheck && attempts < 5) {
      orderCode = generateOrderCode();
      collisionCheck = await this.paymentModel.findOne({ orderCode });
      attempts++;
    }

    const description = generateSepayTransferContent('LOCKER', orderCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const bankName = building.bankAccount.bankName || 'MBBank';
    const accountNumber = building.bankAccount.accountNumber;

    const qrCodeUrl = generateSepayQrUrl({
      bankName,
      accountNumber,
      amount: feeInfo.feeDue,
      description,
    });

    const paymentUrl = await generateSepayCheckoutUrl({
      orderCode,
      amount: feeInfo.feeDue,
      description,
    });

    const qrPayload = generateVietQrPayload({
      bankBin: building.bankAccount.bankBin,
      accountNumber,
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
      isKiosk: options.isKiosk ?? false,
      paymentType: dto.paymentType || PaymentType.OVERDUE_PICKUP,
      paymentMethod: PaymentMethod.SEPAY,
      amount: feeInfo.feeDue,
      extensionHours: 24,
      recipientAccount: {
        bankBin: building.bankAccount.bankBin,
        bankName,
        accountNumber,
        accountName: building.bankAccount.accountName,
      },
      status: PaymentStatus.PENDING,
      paymentUrl,
      qrCodeUrl,
      qrPayload,
      description,
      expiresAt,
      receivedAmount: credit.receivedAmount,
      receipts: credit.receipts,
    });
    const alreadyPaid = await this.settleIfFullyPaid(payment);

    const checkoutFormFields = initSepayOneTimePaymentFields({
      orderCode,
      amount: feeInfo.feeDue,
      description,
    });

    this.logger.log(
      `[PAYMENT_INTENT] Đã tạo phiên thanh toán Order #${orderCode} - Số tiền: ${feeInfo.feeDue} VNĐ`,
    );

    return {
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      paymentUrl: payment.paymentUrl,
      checkoutFormFields,
      qrCodeUrl: payment.qrCodeUrl,
      qrPayload: payment.qrPayload,
      recipientAccount: payment.recipientAccount,
      expiresAt: payment.expiresAt,
      isKiosk: payment.isKiosk ?? false,
      receivedAmount: payment.receivedAmount ?? 0,
      remainingAmount: calculateRemaining(payment.amount, payment.receivedAmount),
      alreadyPaid,
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

    if (!isPaymentConfigured(building)) {
      throw new BadRequestException(
        'Ban Quản Lý tòa nhà chưa cấu hình thông tin tài khoản ngân hàng thụ hưởng',
      );
    }

    const subscriptionFee =
      building.pricingPolicy?.monthlySubscriptionFee ?? 30000;

    // Tìm giao dịch đăng ký gói tháng chờ thanh toán gần nhất của cư dân
    const activePending = await this.paymentModel
      .findOne({
        userId: user._id,
        paymentType: PaymentType.MONTHLY_SUBSCRIPTION,
        status: PaymentStatus.PENDING,
      })
      .sort({ createdAt: -1 });

    if (activePending && activePending.amount === subscriptionFee) {
      // Gia hạn thời gian chờ thanh toán thêm 15 phút tính từ thời điểm hiện tại
      const renewedExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      activePending.expiresAt = renewedExpiresAt;
      if (
        buildingId &&
        String(activePending.buildingId) !== String(buildingId)
      ) {
        activePending.buildingId = building._id as unknown as Types.ObjectId;
      }
      await activePending.save();

      const checkoutFormFields = initSepayOneTimePaymentFields({
        orderCode: activePending.orderCode,
        amount: activePending.amount,
        description:
          activePending.description ||
          generateSepayTransferContent('SUB', activePending.orderCode),
      });

      this.logger.log(
        `[SUBSCRIPTION_INTENT_REUSE] Tái sử dụng và gia hạn đơn hàng gói tháng PENDING #${activePending.orderCode} - Hạn mới: ${renewedExpiresAt.toISOString()}`,
      );

      return {
        orderCode: activePending.orderCode,
        amount: activePending.amount,
        description: activePending.description,
        paymentUrl: activePending.paymentUrl,
        checkoutFormFields,
        qrCodeUrl: activePending.qrCodeUrl,
        qrPayload: activePending.qrPayload,
        recipientAccount: activePending.recipientAccount,
        expiresAt: renewedExpiresAt,
      };
    }

    // Hủy các đơn chờ cũ nếu biểu phí gói tháng đổi và chuyển phần tiền đã nhận sang đơn mới
    const credit = activePending
      ? await this.cancelPendingAndCollectCredit({
          userId: user._id,
          paymentType: PaymentType.MONTHLY_SUBSCRIPTION,
        })
      : emptyCredit();

    let orderCode = generateOrderCode();
    let collisionCheck = await this.paymentModel.findOne({ orderCode });
    let attempts = 0;
    while (collisionCheck && attempts < 5) {
      orderCode = generateOrderCode();
      collisionCheck = await this.paymentModel.findOne({ orderCode });
      attempts++;
    }

    const description = generateSepayTransferContent('SUB', orderCode);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const bankName = building.bankAccount.bankName || 'MBBank';
    const accountNumber = building.bankAccount.accountNumber;

    const qrCodeUrl = generateSepayQrUrl({
      bankName,
      accountNumber,
      amount: subscriptionFee,
      description,
    });

    const paymentUrl = await generateSepayCheckoutUrl({
      orderCode,
      amount: subscriptionFee,
      description,
    });

    const qrPayload = generateVietQrPayload({
      bankBin: building.bankAccount.bankBin,
      accountNumber,
      amount: subscriptionFee,
      description,
    });

    const payment = await this.paymentModel.create({
      orderCode,
      userId: user._id,
      buildingId: building._id,
      paymentType: PaymentType.MONTHLY_SUBSCRIPTION,
      paymentMethod: PaymentMethod.SEPAY,
      amount: subscriptionFee,
      extensionHours: 0,
      recipientAccount: {
        bankBin: building.bankAccount.bankBin,
        bankName,
        accountNumber,
        accountName: building.bankAccount.accountName,
      },
      status: PaymentStatus.PENDING,
      paymentUrl,
      qrCodeUrl,
      qrPayload,
      description,
      expiresAt,
      receivedAmount: credit.receivedAmount,
      receipts: credit.receipts,
    });
    const alreadyPaid = await this.settleIfFullyPaid(payment);

    const checkoutFormFields = initSepayOneTimePaymentFields({
      orderCode,
      amount: subscriptionFee,
      description,
    });

    this.logger.log(
      `[SUBSCRIPTION_INTENT] Đã tạo phiên đăng ký gói tháng Order #${orderCode} - Cư dân: ${user.phone} - Số tiền: ${subscriptionFee} VNĐ`,
    );

    return {
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      paymentUrl: payment.paymentUrl,
      checkoutFormFields,
      qrCodeUrl: payment.qrCodeUrl,
      qrPayload: payment.qrPayload,
      recipientAccount: payment.recipientAccount,
      expiresAt: payment.expiresAt,
      receivedAmount: payment.receivedAmount ?? 0,
      remainingAmount: calculateRemaining(payment.amount, payment.receivedAmount),
      alreadyPaid,
    };
  }

  // Xác nhận thanh toán thành công và cập nhật hạn lưu kho hoặc kích hoạt gói tháng
  async confirmPayment(orderCode: number, isSandbox = false) {
    const payment = await this.paymentModel.findOneAndUpdate(
      {
        orderCode,
        status: PaymentStatus.PENDING,
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

    // Chỉ khôi phục sang WAITING_FOR_PICKUP nếu đơn hàng đang ở trạng thái OVERDUE
    const updateSet: Record<string, any> = {
      paidUntil: newPaidUntil,
    };
    if (pkg.status === PackageStatus.OVERDUE) {
      updateSet.status = PackageStatus.WAITING_FOR_PICKUP;
    }

    const updateResult = await this.packageModel.updateOne(
      {
        _id: payment.packageId,
        status: { $ne: PackageStatus.PICKED_UP },
      },
      {
        $set: updateSet,
        $inc: { totalFeePaid: payment.amount },
      },
    );

    // Nếu đơn hàng đã hoàn tất nhận hàng trước đó chỉ ghi nhận phí và gia hạn bảo chứng
    if (updateResult.matchedCount === 0) {
      await this.packageModel.updateOne(
        { _id: payment.packageId },
        {
          $set: { paidUntil: newPaidUntil },
          $inc: { totalFeePaid: payment.amount },
        },
      );
    }

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

  // Xác thực thiết bị Kiosk bằng x-api-key và chỉ cho mở khi giao dịch là phiên Kiosk thuộc đúng trạm tủ của thiết bị
  async completeKioskPickupForDevice(
    orderCode: number,
    apiKey?: string,
    lockerCode?: string,
  ) {
    if (!apiKey || !lockerCode) {
      throw new UnauthorizedException(
        'Yêu cầu từ thiết bị cần có x-api-key và mã trạm tủ x-locker-code',
      );
    }

    const locker = await this.lockerModel
      .findOne({ code: String(lockerCode).trim().toUpperCase() })
      .select('+apiKey');

    if (!locker || locker.apiKey !== apiKey) {
      throw new UnauthorizedException(
        'Mã API Key của thiết bị không chính xác hoặc trạm tủ không tồn tại',
      );
    }

    const payment = await this.paymentModel.findOne({ orderCode });
    if (
      !payment ||
      !payment.isKiosk ||
      this.toIdString(payment.lockerId) !== String(locker._id)
    ) {
      throw new ForbiddenException(
        'Giao dịch này không thuộc phiên thanh toán tại trạm tủ của thiết bị',
      );
    }

    return this.completeKioskPickup(orderCode);
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

    if (pkg.status === PackageStatus.PICKED_UP) {
      return {
        success: true,
        message: 'Bưu kiện đã được hoàn tất mở tủ lấy hàng trước đó',
        boxNumber,
        alreadyProcessed: true,
      };
    }

    const lockerId = payment.lockerId || pkg.lockerId;
    const locker = await this.lockerModel.findById(lockerId);
    if (locker) {
      await this.mqttService.publishDoorUnlock(locker.code, boxNumber);
    }

    const boxId = payment.boxId || pkg.boxId;
    const box = await this.boxModel.findById(boxId);
    if (box) {
      box.status = BoxStatus.AVAILABLE;
      box.currentPackageId = undefined;
      box.doorStatus = DoorStatus.OPEN;
      box.hasItem = false;
      await box.save();
    }

    pkg.status = PackageStatus.PICKED_UP;
    pkg.pickedUpAt = new Date();
    pkg.totalFeePaid = (pkg.totalFeePaid || 0) + payment.amount;
    await pkg.save();

    await this.activityLogsService.recordLockerAction({
      locker: locker ?? {
        _id: lockerId,
        code: String(lockerId),
        buildingId: payment.buildingId,
      },
      boxNumber,
      packageId: payment.packageId,
      action: LockerAction.PICKUP_OTP,
      performedBy: pkg.receiverPhone || 'RESIDENT',
      status: 'SUCCESS',
      actor: {
        userId: pkg.residentId,
        name: pkg.receiverName,
        phone: pkg.receiverPhone,
        role: Role.RESIDENT,
      },
      metadata: {
        note: `Cư dân nộp phí quá hạn tại Kiosk #${orderCode} và mở tủ thành công`,
        orderCode,
        amount: payment.amount,
      },
    });

    this.logger.log(
      `[KIOSK_PICKUP] Giao dịch #${orderCode} - Cửa tủ số ${boxNumber} trạm ${locker?.code} đã được kích hoạt mở`,
    );

    return {
      success: true,
      message: 'Cửa ngăn tủ đã được kích hoạt mở. Hãy lấy đồ của bạn!',
      boxNumber,
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

  // Lấy hóa đơn theo kiện hàng của cư dân, gồm phí đang nợ, khoản đã trả, khoản đã nhận chờ đủ và biên nhận gói tháng
  async getMyInvoices(userId: string, query: PaginationQueryDto) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Mã người dùng không hợp lệ');
    }
    const residentId = new Types.ObjectId(userId);

    const [resident, payments] = await Promise.all([
      this.userModel
        .findById(residentId)
        .select('subscriptionStatus subscriptionExpiresAt')
        .lean(),
      this.paymentModel
        .find({
          userId: residentId,
          status: { $in: [PaymentStatus.PAID, PaymentStatus.PENDING] },
        })
        .lean(),
    ]);

    const hasActiveSubscription =
      resident?.subscriptionStatus === 'ACTIVE' &&
      resident?.subscriptionExpiresAt != null &&
      new Date() <= new Date(resident.subscriptionExpiresAt);

    const paidPackageIds = payments
      .map((p) => p.packageId)
      .filter((id): id is Types.ObjectId => !!id);

    const activeStatuses = [
      PackageStatus.WAITING_FOR_PICKUP,
      PackageStatus.OVERDUE,
    ];

    const packages = await this.packageModel
      .find({
        $or: [
          { residentId, status: { $in: activeStatuses } },
          { _id: { $in: paidPackageIds } },
        ],
      })
      .populate('buildingId', 'name pricingPolicy')
      .populate('lockerId', 'name');

    const packageInputs = packages.map((pkg) => {
      const isActive = activeStatuses.includes(pkg.status);
      const locker = pkg.lockerId as unknown as Locker;
      let liveTotalFee = 0;
      let currentTier: InvoicePackageInput['currentTier'] = null;

      if (isActive) {
        const fee = this.calculateFee(
          pkg,
          pkg.buildingId as unknown as Building,
          hasActiveSubscription,
        );
        liveTotalFee = Math.min(
          fee.baseFee + fee.overdueFee,
          fee.baseFee + fee.policy.maxOverdueFeeCap,
        );
        currentTier = fee.currentTier;
      }

      return {
        packageId: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        lockerName: locker?.name,
        boxNumber: pkg.boxNumber,
        packageStatus: pkg.status,
        droppedOffAt: pkg.droppedOffAt,
        isActive,
        liveTotalFee,
        currentTier,
      };
    });

    const paymentInputs: InvoicePaymentInput[] = payments.map((p) => ({
      orderCode: p.orderCode,
      packageId: p.packageId ? String(p.packageId) : undefined,
      paymentType: p.paymentType,
      status: p.status,
      amount: p.amount,
      receivedAmount: p.receivedAmount || 0,
      paidAt: p.paidAt,
      receiptAt: p.receipts?.length
        ? p.receipts[p.receipts.length - 1].receivedAt
        : undefined,
      description: p.description,
      expiresAt: p.expiresAt,
      sepayTransactionId: p.sepayTransactionId,
    }));

    const { invoices, subscriptionReceipts } = buildInvoices(
      packageInputs,
      paymentInputs,
    );

    // Phân trang trên danh sách đã sắp xếp (hóa đơn còn nợ luôn ở trang đầu), biên nhận gói tháng chỉ trả ở trang đầu
    const { page, limit } = query;
    const total = invoices.length;
    const totalPages = Math.ceil(total / limit);

    return {
      asOf: new Date(),
      invoices: invoices.slice((page - 1) * limit, page * limit),
      subscriptionReceipts: page === 1 ? subscriptionReceipts : [],
      pagination: { total, page, limit, totalPages, hasNext: page < totalPages },
    };
  }

  // Tra cứu chi tiết một giao dịch theo mã orderCode duy nhất
  async getPaymentByOrderCode(orderCode: number, user: AuthenticatedUser) {
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

    this.assertResourceAccess(user, payment.userId, payment.buildingId);
    return payment;
  }

  // Ghi nhật ký khoản tiền vừa nhận; chưa đủ hoặc chuyển dư đều được đánh dấu cảnh báo để Ban Quản Lý đối soát
  private async logPaymentReceived(
    payment: PaymentDocument,
    receivedNow: number,
    outcome: 'PARTIAL' | 'PAID',
  ): Promise<void> {
    const resident = payment.userId
      ? await this.userModel
          .findById(payment.userId)
          .select('name phone')
          .lean()
      : null;
    const received = payment.receivedAmount ?? 0;
    const overpaid = outcome === 'PAID' && received > payment.amount;
    const title =
      payment.paymentType === PaymentType.MONTHLY_SUBSCRIPTION
        ? 'Thanh toán gói tháng'
        : payment.isKiosk
          ? 'Thanh toán phí lưu kho tại Kiosk'
          : 'Thanh toán phí lưu kho từ xa';

    let description = `Đơn #${payment.orderCode} - ${payment.amount} VNĐ`;
    if (outcome === 'PARTIAL') {
      description = `Đơn #${payment.orderCode} - vừa nhận ${receivedNow} VNĐ, đã nhận ${received}/${payment.amount} VNĐ, còn thiếu ${calculateRemaining(payment.amount, received)} VNĐ`;
    } else if (overpaid) {
      description = `Đơn #${payment.orderCode} - nhận ${received} VNĐ, nhiều hơn ${payment.amount} VNĐ cần nộp (chuyển dư ${received - payment.amount} VNĐ)`;
    }

    await this.activityLogsService.log({
      actor: {
        userId: payment.userId,
        name: resident?.name ?? 'Cư dân',
        phone: resident?.phone,
        role: Role.RESIDENT,
      },
      buildingId: payment.buildingId,
      category: ActivityCategory.PAYMENT,
      status:
        outcome === 'PARTIAL' || overpaid
          ? ActivityStatus.WARNING
          : ActivityStatus.SUCCESS,
      title: outcome === 'PARTIAL' ? `${title} (chưa đủ tiền)` : title,
      description,
      target: payment.packageId
        ? { type: 'PACKAGE', id: String(payment.packageId) }
        : { type: 'USER', id: String(payment.userId) },
      metadata: {
        orderCode: payment.orderCode,
        amount: payment.amount,
        receivedAmount: received,
        paymentType: payment.paymentType,
        isKiosk: payment.isKiosk ?? false,
      },
    });
  }

  // Báo cho cư dân biết đã nhận bao nhiêu, còn thiếu bao nhiêu và phải chuyển thêm với cùng nội dung chuyển khoản
  private async notifyPartialPayment(payment: PaymentDocument): Promise<void> {
    if (!payment.userId) return;
    const received = payment.receivedAmount ?? 0;
    const remaining = calculateRemaining(payment.amount, received);
    const format = (value: number) => value.toLocaleString('vi-VN');

    await this.notificationsService
      .createNotification({
        recipientId: payment.userId,
        buildingId: payment.buildingId,
        title: 'Chuyển khoản chưa đủ số tiền',
        message: `Đơn #${payment.orderCode} đã nhận ${format(received)} VNĐ, còn thiếu ${format(remaining)} VNĐ. Vui lòng chuyển thêm với cùng nội dung chuyển khoản${payment.description ? ` "${payment.description}"` : ''}.`,
        category: NotificationCategory.SYSTEM,
        type: NotificationType.PAYMENT_PARTIAL,
        priority: NotificationPriority.HIGH,
        metadata: {
          orderCode: payment.orderCode,
          receivedAmount: received,
          remainingAmount: remaining,
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Không gửi được thông báo chuyển thiếu cho đơn #${payment.orderCode}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // Hủy các đơn chờ thanh toán sắp bị thay thế và gom phần tiền đã nhận của chúng để chuyển sang đơn mới
  private async cancelPendingAndCollectCredit(
    filter: QueryFilter<PaymentDocument>,
  ): Promise<{ receivedAmount: number; receipts: PaymentReceipt[] }> {
    const pendingFilter: QueryFilter<PaymentDocument> = {
      ...filter,
      status: PaymentStatus.PENDING,
    };
    const pendings = await this.paymentModel
      .find(pendingFilter)
      .select('receivedAmount receipts')
      .lean();

    await this.paymentModel.updateMany(pendingFilter, {
      status: PaymentStatus.CANCELLED,
    });

    return sumCredit(pendings);
  }

  // Chốt đơn thành PAID ngay khi phần tiền chuyển sang đã đủ, vì sẽ không còn webhook nào để chốt
  private async settleIfFullyPaid(payment: PaymentDocument): Promise<boolean> {
    if (!isFullyPaid(payment.amount, payment.receivedAmount)) return false;

    const paid = await this.paymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        status: PaymentStatus.PENDING,
        receivedAmount: { $gte: payment.amount },
      },
      {
        $set: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          paymentMethod: PaymentMethod.SEPAY,
        },
      },
      { new: true },
    );
    if (!paid) return false;

    await this.logPaymentReceived(paid, 0, 'PAID');
    await this.completePaidPayment(paid, paid.orderCode);
    return true;
  }

  // Xử lý dữ liệu webhook từ SePay để tự động gạch nợ và phân nhánh nghiệp vụ an toàn
  async handleSepayWebhook(
    dto: SepayWebhookDto,
    authHeader?: string,
    xSecretKey?: string,
  ) {
    const expectedSecret =
      process.env.SEPAY_WEBHOOK_SECRET ||
      process.env.SEPAY_SECRET_KEY ||
      process.env.SECRET_KEY;

    if (expectedSecret) {
      const token =
        xSecretKey || authHeader?.replace(/^(Apikey|Bearer)\s+/i, '').trim();

      if (token !== expectedSecret) {
        this.logger.warn(
          `[SEPAY_WEBHOOK] Token xác thực webhook không hợp lệ: ${token}`,
        );
        throw new UnauthorizedException(
          'Chữ ký xác thực webhook SePay không hợp lệ',
        );
      }
    }

    const isPgIpn =
      dto.notification_type === 'ORDER_PAID' ||
      Boolean(dto.order?.order_invoice_number);

    let orderCode: number | null = null;
    let transferAmount = 0;
    let referenceCode: string | undefined;
    let sepayTransactionId: string | undefined;

    if (isPgIpn && dto.order) {
      orderCode = parseInt(String(dto.order.order_invoice_number), 10);
      transferAmount = parseFloat(String(dto.order.order_amount || 0));
      sepayTransactionId = String(dto.order.order_id || '');
      referenceCode = dto.order.transaction_id || dto.order.order_id;
      this.logger.log(
        `[SEPAY_WEBHOOK] Tiếp nhận IPN Cổng thanh toán SePay PG cho đơn hàng #${orderCode} - Trạng thái: ${dto.order.order_status}`,
      );
    } else {
      orderCode = parseOrderCodeFromContent(dto.content || '');

      // Tra cứu ngược mã đơn hàng nếu nội dung chuyển khoản chứa mã phiên PAY của cổng SePay
      if (!orderCode && dto.content) {
        const payCode = parseSepayPgCodeFromContent(dto.content);
        if (payCode) {
          this.logger.log(
            `[SEPAY_WEBHOOK] Phát hiện mã phiên SePay PG ${payCode} trong nội dung: ${dto.content}, đang tra cứu mã đơn hàng...`,
          );
          orderCode = await lookupOrderInvoiceByPayCode(payCode);
          if (orderCode) {
            this.logger.log(
              `[SEPAY_WEBHOOK] Đã tra cứu thành công mã phiên ${payCode} thành đơn hàng #${orderCode}`,
            );
          }
        }
      }

      transferAmount = Number(dto.transferAmount || 0);
      sepayTransactionId = dto.id ? String(dto.id) : undefined;
      referenceCode = dto.referenceCode;
    }

    if (!orderCode) {
      this.logger.warn(
        `[SEPAY_WEBHOOK] Không trích xuất được orderCode từ nội dung chuyển khoản: ${dto.content || JSON.stringify(dto)}`,
      );
      return {
        success: false,
        message:
          'Nội dung chuyển khoản không chứa mã đơn hàng orderCode hợp lệ',
      };
    }

    const { transactionId, isDedupable } = resolveTransactionId({
      sepayTransactionId,
      referenceCode,
    });
    if (!isDedupable) {
      this.logger.warn(
        `[SEPAY_WEBHOOK] Giao dịch cho đơn #${orderCode} không có mã giao dịch, không thể chống tính trùng nếu cổng gửi lại`,
      );
    }
    const receivedNow = Number.isFinite(transferAmount)
      ? Math.max(0, transferAmount)
      : 0;
    const isGatewayConfirmed = isPgIpn;

    // Bước 1: ghi nhận khoản tiền vào đơn, bỏ qua nếu mã giao dịch này đã được tính trước đó
    const recorded = await this.paymentModel.findOneAndUpdate(
      {
        orderCode,
        status: PaymentStatus.PENDING,
        'receipts.transactionId': { $ne: transactionId },
      },
      {
        $push: {
          receipts: { transactionId, amount: receivedNow, receivedAt: new Date() },
        },
        $inc: { receivedAmount: receivedNow },
        $set: { rawTransactionData: dto },
      },
      { new: true },
    );

    if (!recorded) {
      const alreadyHandled = await this.paymentModel.exists({
        orderCode,
        $or: [
          { status: PaymentStatus.PAID },
          { 'receipts.transactionId': transactionId },
        ],
      });

      if (alreadyHandled) {
        this.logger.log(
          `[SEPAY_WEBHOOK] Giao dịch #${orderCode} đã được ghi nhận trước đó (Idempotent)`,
        );
        return {
          success: true,
          message: 'Giao dịch đã được ghi nhận thành công trước đó',
          alreadyProcessed: true,
        };
      }

      this.logger.warn(
        `[SEPAY_WEBHOOK] Không tìm thấy phiên thanh toán PENDING cho mã đơn #${orderCode}`,
      );
      return {
        success: false,
        message: `Không tìm thấy phiên thanh toán PENDING cho mã đơn #${orderCode}`,
      };
    }

    // Bước 2: chỉ chốt PAID khi đã đủ tiền; cổng thanh toán PG đã tự đảm bảo số tiền nên luôn được chốt
    if (
      !isGatewayConfirmed &&
      !isFullyPaid(recorded.amount, recorded.receivedAmount)
    ) {
      this.logger.warn(
        `[SEPAY_WEBHOOK] Giao dịch #${orderCode} chưa đủ tiền: đã nhận ${recorded.receivedAmount}/${recorded.amount} VNĐ, giữ đơn ở trạng thái PENDING`,
      );
      await this.logPaymentReceived(recorded, receivedNow, 'PARTIAL');
      await this.notifyPartialPayment(recorded);

      return {
        success: true,
        partial: true,
        message: 'Đã nhận một phần số tiền, đơn chưa được chốt',
        orderCode,
        receivedAmount: recorded.receivedAmount,
        remainingAmount: calculateRemaining(
          recorded.amount,
          recorded.receivedAmount,
        ),
      };
    }

    const payment = await this.paymentModel.findOneAndUpdate(
      {
        _id: recorded._id,
        status: PaymentStatus.PENDING,
        ...(isGatewayConfirmed
          ? {}
          : { receivedAmount: { $gte: recorded.amount } }),
      },
      {
        $set: {
          status: PaymentStatus.PAID,
          sepayTransactionId: sepayTransactionId || String(orderCode),
          referenceCode: referenceCode,
          paidAt: new Date(),
          paymentMethod: PaymentMethod.SEPAY,
        },
        $max: { receivedAmount: recorded.amount },
      },
      { new: true },
    );

    if (!payment) {
      this.logger.log(
        `[SEPAY_WEBHOOK] Giao dịch #${orderCode} đã được xử lý bởi một webhook khác (Idempotent)`,
      );
      return {
        success: true,
        message: 'Giao dịch đã được ghi nhận thành công trước đó',
        alreadyProcessed: true,
      };
    }

    await this.logPaymentReceived(payment, receivedNow, 'PAID');

    return this.completePaidPayment(payment, orderCode);
  }

  // Xử lý nghiệp vụ sau khi đơn đã đủ tiền: kích hoạt gói tháng, mở tủ tại Kiosk hoặc gia hạn lưu kho từ xa
  private async completePaidPayment(
    payment: PaymentDocument,
    orderCode: number,
  ) {
    if (payment.paymentType === PaymentType.MONTHLY_SUBSCRIPTION) {
      const user = await this.userModel.findById(payment.userId);
      if (user) {
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
          `[SEPAY_SUBSCRIPTION] Giao dịch #${orderCode} - Cư dân ${user.phone} gia hạn gói VIP thành công đến ${newExpiry.toISOString()}`,
        );
      }

      return {
        success: true,
        message: 'Thanh toán gói tháng VIP SePay thành công',
        type: 'SUBSCRIPTION',
        orderCode,
      };
    }

    if (payment.isKiosk) {
      this.logger.log(
        `[SEPAY_KIOSK] Giao dịch #${orderCode} tại Kiosk thành công - Tự động kích hoạt mở ô tủ #${payment.boxNumber}`,
      );
      await this.completeKioskPickup(orderCode);

      return {
        success: true,
        message: 'Thanh toán tại Kiosk thành công, cửa tủ đã được bung mở',
        type: 'KIOSK_PICKUP',
        boxNumber: payment.boxNumber,
        orderCode,
      };
    }

    const pkg = await this.packageModel.findById(payment.packageId);
    if (pkg) {
      const now = Date.now();
      const baseTime = pkg.paidUntil
        ? Math.max(new Date(pkg.paidUntil).getTime(), now)
        : now;
      const newPaidUntil = new Date(
        baseTime + (payment.extensionHours || 24) * 3600 * 1000,
      );

      // Chỉ khôi phục sang WAITING_FOR_PICKUP nếu đơn hàng đang ở trạng thái OVERDUE
      const updateSet: Record<string, any> = {
        paidUntil: newPaidUntil,
      };
      if (pkg.status === PackageStatus.OVERDUE) {
        updateSet.status = PackageStatus.WAITING_FOR_PICKUP;
      }

      const updateResult = await this.packageModel.updateOne(
        {
          _id: payment.packageId,
          status: { $ne: PackageStatus.PICKED_UP },
        },
        {
          $set: updateSet,
          $inc: { totalFeePaid: payment.amount },
        },
      );

      // Nếu đơn hàng đã hoàn tất nhận hàng trước đó chỉ ghi nhận phí và gia hạn bảo chứng
      if (updateResult.matchedCount === 0) {
        await this.packageModel.updateOne(
          { _id: payment.packageId },
          {
            $set: { paidUntil: newPaidUntil },
            $inc: { totalFeePaid: payment.amount },
          },
        );
      }

      this.logger.log(
        `[SEPAY_MOBILE] Giao dịch #${orderCode} từ Mobile thành công - Gia hạn tới ${newPaidUntil.toISOString()} (Cửa tủ giữ đóng an toàn)`,
      );
    }

    return {
      success: true,
      message:
        'Thanh toán phí lưu kho từ xa thành công, hạn nhận hàng được gia hạn thêm 24 giờ',
      type: 'MOBILE_PICKUP',
      orderCode,
    };
  }

  // Tra cứu nhanh trạng thái giao dịch phục vụ cơ chế Auto-Polling tự động từ Client
  async getPaymentStatus(orderCode: number, user: AuthenticatedUser) {
    const payment = await this.paymentModel.findOne({ orderCode });
    if (!payment) {
      throw new NotFoundException(
        `Không tìm thấy phiên giao dịch #${orderCode}`,
      );
    }

    this.assertResourceAccess(user, payment.userId, payment.buildingId);

    let paidUntil: Date | undefined;
    if (payment.packageId) {
      const pkg = await this.packageModel
        .findById(payment.packageId)
        .select('paidUntil');
      paidUntil = pkg?.paidUntil;
    }

    return {
      orderCode: payment.orderCode,
      status: payment.status,
      paymentType: payment.paymentType,
      amount: payment.amount,
      paidAt: payment.paidAt,
      paidUntil,
      boxNumber: payment.boxNumber,
      isKiosk: payment.isKiosk ?? false,
      receivedAmount: payment.receivedAmount ?? 0,
      remainingAmount: calculateRemaining(payment.amount, payment.receivedAmount),
    };
  }
}
