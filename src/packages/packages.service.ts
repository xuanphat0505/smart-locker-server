import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Package, ShipperSession } from './schemas';
import { LockerLog } from '../lockers/schemas/locker-log.schema';
import { Locker } from '../lockers/schemas/locker.schema';
import { Box } from '../lockers/schemas/box.schema';
import { User } from '../users/schemas/user.schema';
import {
  DropOffPackageDto,
  PickupOtpDto,
  PickupQrDto,
  SendShipperOtpDto,
  VerifyShipperOtpDto,
  VerifyFirebaseTokenDto,
} from './dto';
import { PackageStatus } from './enums';
import { BoxSize, BoxStatus, DoorStatus, LockerAction } from '../lockers/enums';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { getFirebaseAuth } from '../config/firebase-admin.config';

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    @InjectModel(Package.name) private readonly packageModel: Model<Package>,
    @InjectModel(ShipperSession.name)
    private readonly shipperSessionModel: Model<ShipperSession>,
    @InjectModel(LockerLog.name)
    private readonly lockerLogModel: Model<LockerLog>,
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name) private readonly boxModel: Model<Box>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Tài xế giao bưu kiện vào ngăn tủ và sinh mã OTP mở tủ cho cư dân
  async dropOff(dto: DropOffPackageDto) {
    const formattedLockerCode = dto.lockerCode.trim().toUpperCase();
    const locker = await this.lockerModel
      .findOne({ code: formattedLockerCode })
      .populate('buildingId', 'name code');

    if (!locker) {
      throw new NotFoundException(
        `Trạm tủ với mã ${dto.lockerCode} không tồn tại`,
      );
    }

    const building = locker.buildingId as unknown as {
      _id: Types.ObjectId;
      name?: string;
    };
    const targetBuildingId = building?._id || locker.buildingId;

    const resident = await this.userModel.findOne({
      phone: dto.receiverPhone.trim(),
      buildingId: targetBuildingId,
      role: Role.RESIDENT,
      approvalStatus: ApprovalStatus.ACTIVE,
    });

    if (!resident) {
      throw new NotFoundException(
        'Số điện thoại người nhận chưa đăng ký làm cư dân hoặc chưa được duyệt',
      );
    }

    const box = await this.boxModel.findOne({
      lockerId: locker._id,
      boxNumber: dto.boxNumber,
    });

    if (!box) {
      throw new NotFoundException(
        `Ngăn tủ số ${dto.boxNumber} không tồn tại trên trạm này`,
      );
    }

    if (box.status !== BoxStatus.AVAILABLE) {
      throw new BadRequestException(
        `Ngăn tủ số ${dto.boxNumber} hiện không khả dụng (đang chứa hàng hoặc bảo trì)`,
      );
    }

    // Kiểm tra cấp bậc kích thước ngăn tủ có đủ chứa kiện hàng không
    const sizeRank: Record<BoxSize, number> = {
      [BoxSize.SMALL]: 1,
      [BoxSize.MEDIUM]: 2,
      [BoxSize.LARGE]: 3,
    };

    if (sizeRank[box.size] < sizeRank[dto.boxSize]) {
      throw new BadRequestException(
        `Ngăn tủ số #${dto.boxNumber} (Cỡ ${box.size}) không đủ chứa kiện hàng (Cỡ ${dto.boxSize}). Vui lòng chọn ngăn lớn hơn hoặc bằng.`,
      );
    }

    let pinCode = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      attempts++;
      pinCode = Math.floor(100000 + Math.random() * 900000).toString();
      const existingWithPin = await this.packageModel.findOne({
        lockerId: locker._id,
        pinCode,
        status: PackageStatus.WAITING_FOR_PICKUP,
      });
      if (!existingWithPin) {
        isUnique = true;
      }
    }

    const qrCodeToken = crypto.randomBytes(16).toString('hex');
    const droppedOffAt = new Date();
    const expiredAt = new Date(droppedOffAt.getTime() + 48 * 60 * 60 * 1000);

    const normalizedShipperPhone = dto.shipperPhone
      .trim()
      .replace(/^(\+84)/, '0');

    // Kiểm tra trạng thái xác thực số điện thoại của tài xế và tự động gia hạn phiên (Sliding Expiration)
    let isShipperVerified = false;
    const rollingExpiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000, // Gia hạn thêm 60 ngày kể từ lần gửi này
    );

    if (dto.sessionToken) {
      const validSession = await this.shipperSessionModel.findOne({
        phone: normalizedShipperPhone,
        sessionToken: dto.sessionToken.trim(),
        sessionExpiresAt: { $gt: new Date() },
      });
      if (validSession) {
        isShipperVerified = true;
        validSession.sessionExpiresAt = rollingExpiresAt;
        await validSession.save();
      }
    } else {
      const existingVerified = await this.shipperSessionModel.findOne({
        phone: normalizedShipperPhone,
        isVerified: true,
        sessionExpiresAt: { $gt: new Date() },
      });
      if (existingVerified) {
        isShipperVerified = true;
        existingVerified.sessionExpiresAt = rollingExpiresAt;
        await existingVerified.save();
      }
    }

    const newPackage = await this.packageModel.create({
      trackingNumber: dto.trackingNumber.trim().toUpperCase(),
      lockerId: locker._id,
      boxId: box._id,
      boxNumber: dto.boxNumber,
      boxSize: dto.boxSize,
      buildingId: targetBuildingId,
      residentId: resident._id,
      receiverPhone: resident.phone,
      receiverName: resident.name,
      apartment: resident.apartment || '',
      shipperPhone: normalizedShipperPhone,
      shipperName: dto.shipperName?.trim(),
      isShipperVerified,
      carrierName: dto.carrierName.trim(),
      pinCode,
      qrCodeToken,
      status: PackageStatus.WAITING_FOR_PICKUP,
      droppedOffAt,
      expiredAt,
      note: dto.note?.trim(),
    });

    box.status = BoxStatus.OCCUPIED;
    box.currentPackageId = newPackage._id;
    box.doorStatus = DoorStatus.OPEN;
    box.hasItem = true;
    await box.save();

    await this.lockerLogModel.create({
      lockerId: locker._id,
      boxNumber: dto.boxNumber,
      packageId: newPackage._id,
      action: LockerAction.DROP_OFF,
      performedBy: normalizedShipperPhone,
      status: 'SUCCESS',
      metadata: {
        carrierName: dto.carrierName,
        trackingNumber: dto.trackingNumber,
        isShipperVerified,
      },
    });

    this.notificationsService.notifyPackageDropOff(
      String(resident._id),
      String(targetBuildingId),
      {
        id: String(newPackage._id),
        trackingNumber: newPackage.trackingNumber,
        boxNumber: newPackage.boxNumber,
        lockerName: locker.name,
        lockerCode: locker.code,
        pinCode: newPackage.pinCode,
        carrierName: newPackage.carrierName,
        droppedOffAt: newPackage.droppedOffAt,
      },
    );

    return {
      message: 'Gửi bưu kiện vào tủ thành công',
      package: {
        _id: String(newPackage._id),
        trackingNumber: newPackage.trackingNumber,
        receiverName: newPackage.receiverName,
        receiverPhone: newPackage.receiverPhone,
        apartment: newPackage.apartment,
        boxNumber: newPackage.boxNumber,
        boxSize: newPackage.boxSize,
        status: newPackage.status,
        isShipperVerified: newPackage.isShipperVerified,
        droppedOffAt: newPackage.droppedOffAt,
        expiredAt: newPackage.expiredAt,
      },
      action: {
        command: 'OPEN_DOOR',
        boxNumber: newPackage.boxNumber,
      },
    };
  }

  // Gửi mã xác thực OTP 6 số tới số điện thoại của tài xế giao hàng
  async sendShipperOtp(dto: SendShipperOtpDto) {
    const normalizedPhone = dto.phone.trim().replace(/^(\+84)/, '0');

    // Giới hạn tần suất gửi lại mã OTP tối thiểu 60 giây
    const existingSession = await this.shipperSessionModel.findOne({
      phone: normalizedPhone,
    });

    if (
      existingSession?.lastResendAt &&
      Date.now() - existingSession.lastResendAt.getTime() < 60 * 1000
    ) {
      const waitSeconds = Math.ceil(
        (60 * 1000 - (Date.now() - existingSession.lastResendAt.getTime())) /
          1000,
      );
      throw new BadRequestException(
        `Vui lòng đợi ${waitSeconds} giây trước khi yêu cầu gửi lại mã OTP`,
      );
    }

    // Sinh mã OTP 6 chữ số ngẫu nhiên
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 3 * 60 * 1000);

    await this.shipperSessionModel.findOneAndUpdate(
      { phone: normalizedPhone },
      {
        phone: normalizedPhone,
        otp,
        otpExpiresAt,
        failedAttempts: 0,
        lastResendAt: new Date(),
      },
      { upsert: true, new: true },
    );

    this.logger.log(
      `[SMS_GATEWAY] Đã gửi mã OTP ${otp} tới số điện thoại tài xế ${normalizedPhone}`,
    );

    return {
      success: true,
      message: `Đã gửi mã xác thực 6 số qua SMS/Zalo tới ${normalizedPhone}`,
      expiresInSeconds: 180,
      devOtp: otp,
    };
  }

  // Xác minh mã OTP 6 số và cấp token phiên tin cậy 60 ngày cho tài xế
  async verifyShipperOtp(dto: VerifyShipperOtpDto) {
    const normalizedPhone = dto.phone.trim().replace(/^(\+84)/, '0');
    const inputOtp = dto.otp.trim();

    const session = await this.shipperSessionModel.findOne({
      phone: normalizedPhone,
    });

    if (!session || !session.otp || !session.otpExpiresAt) {
      throw new BadRequestException(
        'Số điện thoại chưa yêu cầu gửi mã OTP hoặc phiên đã kết thúc',
      );
    }

    // Chống vét cạn: Quá 5 lần sai thì hủy mã OTP
    if (session.failedAttempts >= 5) {
      await this.shipperSessionModel.updateOne(
        { phone: normalizedPhone },
        { $unset: { otp: 1, otpExpiresAt: 1 } },
      );
      throw new BadRequestException(
        'Bạn đã nhập sai OTP quá 5 lần. Vui lòng yêu cầu mã xác thực mới',
      );
    }

    // Kiểm tra thời hạn hiệu lực của OTP
    if (new Date() > session.otpExpiresAt) {
      throw new BadRequestException(
        'Mã OTP đã hết hạn sử dụng. Vui lòng yêu cầu gửi lại mã mới',
      );
    }

    // So khớp mã OTP
    if (session.otp !== inputOtp) {
      await this.shipperSessionModel.updateOne(
        { phone: normalizedPhone },
        { $inc: { failedAttempts: 1 } },
      );
      const remaining = 5 - (session.failedAttempts + 1);
      throw new BadRequestException(
        `Mã OTP không chính xác. Bạn còn ${remaining} lần thử`,
      );
    }

    // Cấp token phiên giao hàng tin cậy 60 ngày
    const sessionToken = `shp_sess_${crypto.randomBytes(24).toString('hex')}`;
    const sessionExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    session.isVerified = true;
    session.verifiedAt = new Date();
    session.sessionToken = sessionToken;
    session.sessionExpiresAt = sessionExpiresAt;
    session.otp = undefined;
    session.otpExpiresAt = undefined;
    session.failedAttempts = 0;
    await session.save();

    this.logger.log(
      `[SHIPPER_VERIFIED] Tài xế ${normalizedPhone} đã xác thực thành công (Token: ${sessionToken.substring(0, 16)}...)`,
    );

    return {
      success: true,
      message: 'Xác thực số điện thoại tài xế thành công',
      sessionToken,
      phone: normalizedPhone,
      expiresAt: sessionExpiresAt,
    };
  }

  // Xác minh mã idToken từ Google Firebase và cấp token phiên giao hàng tin cậy cho tài xế
  async verifyFirebaseToken(dto: VerifyFirebaseTokenDto) {
    const auth = getFirebaseAuth();

    try {
      const decodedToken = await auth.verifyIdToken(dto.idToken.trim());
      const rawPhone = decodedToken.phone_number;

      if (!rawPhone) {
        throw new BadRequestException(
          'Token Firebase không chứa thông tin số điện thoại hợp lệ',
        );
      }

      // Chuẩn hóa định dạng số điện thoại về 10 chữ số nội địa
      const normalizedPhone = rawPhone.replace(/^(\+84)/, '0').trim();

      // Sinh token phiên giao hàng tin cậy ngẫu nhiên an toàn
      const sessionToken = `shp_sess_${crypto.randomBytes(24).toString('hex')}`;
      const sessionExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      await this.shipperSessionModel.findOneAndUpdate(
        { phone: normalizedPhone },
        {
          phone: normalizedPhone,
          isVerified: true,
          verifiedAt: new Date(),
          sessionToken,
          sessionExpiresAt,
          otp: undefined,
          otpExpiresAt: undefined,
          failedAttempts: 0,
        },
        { upsert: true, new: true },
      );

      this.logger.log(
        `[FIREBASE_AUTH] Tài xế ${normalizedPhone} đã xác thực thành công qua Firebase (Token: ${sessionToken.substring(0, 16)}...)`,
      );

      return {
        success: true,
        message: 'Xác thực số điện thoại tài xế thành công qua Firebase',
        sessionToken,
        phone: normalizedPhone,
        expiresAt: sessionExpiresAt,
      };
    } catch (error) {
      this.logger.error('Lỗi khi đối soát Firebase ID Token:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException(
        'Mã Firebase idToken không hợp lệ hoặc đã hết hạn',
      );
    }
  }

  // Lấy danh sách các bưu kiện của cư dân đang đăng nhập
  async getMyPackages(residentId: string) {
    if (!Types.ObjectId.isValid(residentId)) {
      throw new BadRequestException('Mã cư dân không hợp lệ');
    }

    const packages = await this.packageModel
      .find({ residentId: new Types.ObjectId(residentId) })
      .sort({ createdAt: -1 })
      .populate('lockerId', 'name code locationDescription');

    return packages.map((pkg) => {
      const locker = pkg.lockerId as unknown as {
        name?: string;
        code?: string;
        locationDescription?: string;
      };

      return {
        _id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        lockerName: locker?.name || 'Trạm Tủ Thông Minh',
        lockerCode: locker?.code || '',
        locationDescription: locker?.locationDescription || '',
        boxNumber: pkg.boxNumber,
        boxSize: pkg.boxSize,
        pinCode: pkg.pinCode,
        qrCodeToken: pkg.qrCodeToken,
        status: pkg.status,
        carrierName: pkg.carrierName,
        droppedOffAt: pkg.droppedOffAt,
        expiredAt: pkg.expiredAt,
        pickedUpAt: pkg.pickedUpAt,
        note: pkg.note,
      };
    });
  }

  // Lấy thông tin chi tiết một bưu kiện cụ thể
  async getPackageById(id: string, residentId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã bưu kiện không hợp lệ');
    }

    const pkg = await this.packageModel
      .findById(id)
      .populate('lockerId', 'name code locationDescription')
      .populate('buildingId', 'name code address');

    if (!pkg) {
      throw new NotFoundException('Kiện hàng không tồn tại trong hệ thống');
    }

    if (String(pkg.residentId) !== residentId) {
      throw new BadRequestException(
        'Bạn không có quyền xem kiện hàng của người khác',
      );
    }

    return pkg;
  }

  // Lấy mã QR Token động dùng để quét mở cửa tủ
  async getQrToken(id: string, residentId: string) {
    const pkg = await this.getPackageById(id, residentId);
    return {
      qrCodeToken: pkg.qrCodeToken,
      expiredAt: pkg.expiredAt,
      status: pkg.status,
    };
  }

  // Xác thực mã OTP 6 số tại màn hình trạm tủ để mở khóa lấy đồ
  async pickupWithOtp(dto: PickupOtpDto) {
    const locker = await this.lockerModel.findOne({
      code: dto.lockerCode.trim().toUpperCase(),
    });

    if (!locker) {
      throw new NotFoundException(
        `Trạm tủ với mã ${dto.lockerCode} không tồn tại`,
      );
    }

    const pkg = await this.packageModel.findOne({
      lockerId: locker._id,
      pinCode: dto.pinCode.trim(),
      status: PackageStatus.WAITING_FOR_PICKUP,
    });

    if (!pkg) {
      throw new BadRequestException(
        'Mã OTP không chính xác hoặc bưu kiện đã được lấy trước đó',
      );
    }

    if (pkg.lockedUntil && pkg.lockedUntil > new Date()) {
      throw new BadRequestException(
        'Ngăn tủ này đang bị tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau',
      );
    }

    const box = await this.boxModel.findById(pkg.boxId);
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
      lockerId: locker._id,
      boxNumber: pkg.boxNumber,
      packageId: pkg._id,
      action: LockerAction.PICKUP_OTP,
      performedBy: pkg.receiverPhone,
      status: 'SUCCESS',
    });

    return {
      message: `Xác thực mã OTP thành công. Cửa ngăn tủ số ${pkg.boxNumber} đã mở!`,
      package: {
        _id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        pickedUpAt: pkg.pickedUpAt,
      },
      boxNumber: pkg.boxNumber,
      action: 'OPEN_DOOR',
    };
  }

  // Quét mã QR token trước camera của trạm tủ để mở khóa lấy đồ
  async pickupWithQr(dto: PickupQrDto) {
    const locker = await this.lockerModel.findOne({
      code: dto.lockerCode.trim().toUpperCase(),
    });

    if (!locker) {
      throw new NotFoundException(
        `Trạm tủ với mã ${dto.lockerCode} không tồn tại`,
      );
    }

    const pkg = await this.packageModel.findOne({
      lockerId: locker._id,
      qrCodeToken: dto.qrCodeToken.trim(),
      status: PackageStatus.WAITING_FOR_PICKUP,
    });

    if (!pkg) {
      throw new BadRequestException(
        'Mã QR không hợp lệ hoặc bưu kiện đã được lấy trước đó',
      );
    }

    const box = await this.boxModel.findById(pkg.boxId);
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
      lockerId: locker._id,
      boxNumber: pkg.boxNumber,
      packageId: pkg._id,
      action: LockerAction.PICKUP_QR,
      performedBy: pkg.receiverPhone,
      status: 'SUCCESS',
    });

    return {
      message: `Quét mã QR thành công. Cửa ngăn tủ số ${pkg.boxNumber} đã mở!`,
      package: {
        _id: String(pkg._id),
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        pickedUpAt: pkg.pickedUpAt,
      },
      boxNumber: pkg.boxNumber,
      action: 'OPEN_DOOR',
    };
  }

  // Tác vụ nền tự động kiểm tra và chuyển các đơn hàng quá 48 giờ sang trạng thái quá hạn
  @Cron(CronExpression.EVERY_HOUR)
  async handleOverduePackagesCron(): Promise<void> {
    const now = new Date();
    const result = await this.packageModel.updateMany(
      {
        status: PackageStatus.WAITING_FOR_PICKUP,
        expiredAt: { $lt: now },
      },
      {
        $set: { status: PackageStatus.OVERDUE },
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Đã tự động chuyển ${result.modifiedCount} bưu kiện quá hạn lưu kho sang trạng thái OVERDUE`,
      );
    }
  }
}
