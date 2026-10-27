import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Package } from '../../packages/schemas/package.schema';
import { Locker } from '../../lockers/schemas/locker.schema';
import { Box } from '../../lockers/schemas/box.schema';
import { User } from '../../users/schemas/user.schema';
import { PackageStatus } from '../../packages/enums/package.enums';
import { claimPackageForPickup } from '../../packages/utils/package-claim';
import {
  BoxStatus,
  DoorStatus,
  LockerAction,
} from '../../lockers/enums/locker.enums';
import { AntiSpoofingService } from './anti-spoofing.service';
import { FaceRecognitionService } from './face-recognition.service';
import { FaceDetectorService } from './face-detector.service';
import { MqttService } from '../../mqtt/mqtt.service';
import { PaymentsService } from '../../payments/payments.service';
import { PaymentType } from '../../payments/enums/payment.enums';
import { Role } from '../../auth/enums/role.enum';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';
import {
  VerifyFaceHardwareResult,
  EnrollFaceResult,
  ProcessEnrollmentResult,
  CheckFaceMatchResult,
  FaceDetectionMetadata,
} from '../interfaces/face-verification.interface';

// Ngưỡng độ tương đồng Cosine Similarity chấp nhận trùng khớp cho vector 512 chiều ArcFace sau khi crop khuôn mặt
const FACE_MATCH_THRESHOLD = 0.48;

@Injectable()
export class FaceVerificationService {
  private readonly logger = new Logger(FaceVerificationService.name);

  constructor(
    @InjectModel(Package.name)
    private readonly packageModel: Model<Package>,
    @InjectModel(Locker.name)
    private readonly lockerModel: Model<Locker>,
    @InjectModel(Box.name)
    private readonly boxModel: Model<Box>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly antiSpoofingService: AntiSpoofingService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly faceDetectorService: FaceDetectorService,
    private readonly mqttService: MqttService,
    private readonly paymentsService: PaymentsService,
    private readonly activityLogsService: ActivityLogsService,
  ) { }

  // Tính toán vector trung bình và chuẩn hóa chuẩn L2 từ danh sách các vector đặc trưng khuôn mặt đa góc
  private calculateMeanNormalizedEmbedding(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      return [];
    }
    if (embeddings.length === 1) {
      return embeddings[0];
    }

    const dimension = embeddings[0].length;
    const meanEmbedding = new Array(dimension).fill(0);

    for (const vec of embeddings) {
      for (let i = 0; i < dimension; i++) {
        meanEmbedding[i] += vec[i];
      }
    }

    let norm = 0;
    for (let i = 0; i < dimension; i++) {
      meanEmbedding[i] /= embeddings.length;
      norm += meanEmbedding[i] * meanEmbedding[i];
    }

    norm = Math.sqrt(norm) || 1;
    return meanEmbedding.map((val) => val / norm);
  }

  // Kiểm tra độ chân thực chống giả mạo và trích xuất vector đặc trưng từ ảnh chụp khuôn mặt khi đăng ký
  async processEnrollmentBuffers(
    imageBuffers: Buffer[],
    identifier?: string,
  ): Promise<ProcessEnrollmentResult> {
    if (!imageBuffers || imageBuffers.length === 0) {
      throw new BadRequestException(
        'Vui lòng cung cấp ít nhất một ảnh chụp khuôn mặt hợp lệ',
      );
    }

    const primaryBuffer = imageBuffers[0];
    const detectedFace =
      await this.faceDetectorService.detectFace(primaryBuffer);
    if (!detectedFace) {
      throw new BadRequestException(
        'Không tìm thấy khuôn mặt rõ nét trong ảnh. Vui lòng chụp lại ảnh khuôn mặt chính diện',
      );
    }

    const livenessResult = await this.antiSpoofingService.checkLiveness(
      primaryBuffer,
      { faceBox: detectedFace },
    );
    if (!livenessResult.isReal) {
      throw new BadRequestException(
        `Ảnh khuôn mặt không đạt chuẩn chân thực (Điểm thật: ${(livenessResult.livenessScore * 100).toFixed(1)}%). Vui lòng chụp lại ảnh người thật rõ nét`,
      );
    }

    const finalEmbedding =
      await this.faceRecognitionService.extractEmbedding(primaryBuffer);

    return {
      embedding: finalEmbedding,
      livenessScore: Math.round(livenessResult.livenessScore * 10000) / 10000,
      enrolledPosesCount: 1,
    };
  }

  // Đăng ký hoặc cập nhật dữ liệu sinh trắc học khuôn mặt chính diện cho cư dân
  async enrollFace(
    userId: string,
    imageBuffers: Buffer | Buffer[],
  ): Promise<EnrollFaceResult> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers];
    const processed = await this.processEnrollmentBuffers(buffers, userId);

    const enrolledAt = new Date();
    user.faceAuth = {
      enabled: true,
      embedding: processed.embedding,
      enrolledAt,
    };

    await user.save();
    this.logger.log(
      `Cư dân ${user.name} (${user.phone}) đã đăng ký Face ID thành công`,
    );

    return {
      success: true,
      livenessScore: processed.livenessScore,
      enrolledAt,
      enrolledPosesCount: 1,
    };
  }

  // Lưu ảnh nhận được từ camera trạm tủ phục vụ gỡ lỗi, mã trạm được làm sạch trước khi đưa vào tên file
  private saveDebugCapture(lockerCode: string, imageBuffer: Buffer): void {
    try {
      const safeLockerCode = lockerCode.replace(/[^A-Za-z0-9_-]/g, '_');
      const debugDir = path.join(process.cwd(), 'uploads/debug');
      const historyDir = path.join(debugDir, 'captures');
      fs.mkdirSync(historyDir, { recursive: true });

      const latestCapturePath = path.join(debugDir, 'latest_cam_capture.jpg');
      fs.writeFileSync(latestCapturePath, imageBuffer);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(
        path.join(historyDir, `capture_${safeLockerCode}_${timestamp}.jpg`),
        imageBuffer,
      );

      this.logger.log(
        `[CAMERA_IN] Đã nhận ảnh từ trạm ${safeLockerCode} (${imageBuffer.length} bytes) -> Đã lưu tại: ${latestCapturePath}`,
      );
    } catch (saveErr) {
      this.logger.warn(`Không thể lưu ảnh debug camera: ${saveErr}`);
    }
  }

  // Xac thuc khuon mat tu camera trạm tu Kiosk va thuc hien mo ngan tu tuong ung
  async verifyAndUnlock(
    lockerCode: string,
    imageBuffer: Buffer,
  ): Promise<VerifyFaceHardwareResult> {
    const startTime = Date.now();

    // Chỉ lưu ảnh camera để gỡ lỗi khi bật SAVE_FACE_DEBUG_IMAGES, vì đây là dữ liệu sinh trắc học của cả người ngoài
    if (process.env.SAVE_FACE_DEBUG_IMAGES === 'true') {
      this.saveDebugCapture(lockerCode, imageBuffer);
    }

    // Buoc 1: Phat hien khuon mat bang YuNet va kiem tra chong gia mao MiniFASNet
    const detectedFace = await this.faceDetectorService.detectFace(imageBuffer);
    if (!detectedFace) {
      this.logger.warn(
        `Tu choi xac thuc tai tram ${lockerCode}: Khong tim thay khuon mat trong anh camera`,
      );
      throw new BadRequestException(
        'Khong phat hien khuon mat trong anh chup. Vui long dung truoc camera',
      );
    }

    const livenessResult = await this.antiSpoofingService.checkLiveness(
      imageBuffer,
      { faceBox: detectedFace },
    );

    this.logger.log(
      `[ANTI_SPOOFING] Trạm ${lockerCode} -> Điểm Liveness: ${(livenessResult.livenessScore * 100).toFixed(1)}% | Spoof: ${(livenessResult.spoofScore * 100).toFixed(1)}% | Kết luận: ${livenessResult.verdict} (Inference: ${livenessResult.inferenceTimeMs}ms)`,
    );

    if (!livenessResult.isReal) {
      this.logger.warn(
        `Tu choi xac thuc tai tram ${lockerCode}: Phat hien mat gia hoac khong ro net (Liveness: ${(livenessResult.livenessScore * 100).toFixed(1)}%)`,
      );
      throw new ForbiddenException(
        'Phat hien khuon mat khong hop le hoac gia mao man hinh/anh in',
      );
    }

    // Trich xuat vector dac trung khuon mat tu anh camera
    const inputEmbedding =
      await this.faceRecognitionService.extractEmbedding(imageBuffer);

    // Tim kiem tram tu theo ma code
    const locker = await this.lockerModel.findOne({
      code: lockerCode.trim().toUpperCase(),
    });
    if (!locker) {
      throw new NotFoundException(
        `Tram tu voi ma ${lockerCode} khong ton tai trong he thong`,
      );
    }

    // Buoc 4: Lay danh sach cac buu kien dang cho cu dan den lay tai tram tu nay (bao gom ca buu kien qua han)
    const activePackages = await this.packageModel
      .find({
        lockerId: locker._id,
        status: {
          $in: [PackageStatus.WAITING_FOR_PICKUP, PackageStatus.OVERDUE],
        },
      })
      .populate({
        path: 'residentId',
        select:
          '+faceAuth.embedding faceAuth.enabled name phone apartment avatar',
      });

    if (activePackages.length === 0) {
      throw new NotFoundException(
        'Hien khong co buu kien nao dang cho nhan tai tram tu nay',
      );
    }

    // Buoc 5: Thuat toan so khop pham vi cuc bo 1:N giua anh camera va cu dan co don hang
    let bestMatch: {
      package: Package;
      resident: User;
      score: number;
    } | null = null;

    for (const pkg of activePackages) {
      const resident = pkg.residentId as unknown as User;
      if (
        !resident ||
        !resident.faceAuth?.enabled ||
        !resident.faceAuth?.embedding ||
        resident.faceAuth.embedding.length === 0
      ) {
        continue;
      }

      const similarity = this.faceRecognitionService.calculateCosineSimilarity(
        inputEmbedding,
        resident.faceAuth.embedding,
      );

      if (similarity >= FACE_MATCH_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.score) {
          bestMatch = {
            package: pkg,
            resident,
            score: similarity,
          };
        }
      }
    }

    if (!bestMatch) {
      this.logger.warn(
        `Khong tim thay cu dan phu hop tai tram ${lockerCode} (Tong so don cho: ${activePackages.length})`,
      );
      throw new UnauthorizedException(
        'Khuon mat khong trung khop voi bat ky cu dan nao co don hang cho tai tu',
      );
    }

    const matchedPkg = bestMatch.package;
    const matchedResident = bestMatch.resident;

    // Kiem tra cuoc phi luu kho va tinh trang qua han cua buu kien
    const feeInfo = await this.paymentsService.checkFee(String(matchedPkg._id));

    if (feeInfo.feeDue > 0) {
      // Khoi tao phien thanh toan SePay cho tram tu Kiosk
      const intent = await this.paymentsService.createPaymentIntent(
        {
          packageId: String(matchedPkg._id),
          paymentType: PaymentType.OVERDUE_PICKUP,
        },
        undefined,
        { isKiosk: true },
      );

      const paymentMessage = feeInfo.isOverdue
        ? `Bưu kiện tại Ngăn #${matchedPkg.boxNumber} đã quá hạn lưu kho. Vui lòng quét mã QR trên màn hình Kiosk để nộp phí mở tủ.`
        : `Vui lòng quét mã QR trên màn hình Kiosk để thanh toán phí nhận hàng Ngăn #${matchedPkg.boxNumber}.`;

      // Phat ban tin MQTT yeu cau tram tu hien thi ma QR thanh toan tren man hinh LCD
      await this.mqttService.publishPaymentRequired(
        locker.code,
        matchedPkg.boxNumber,
        {
          orderCode: intent.orderCode,
          feeAmount: intent.amount,
          qrPayload: intent.qrPayload,
          paymentUrl: intent.paymentUrl,
          residentName: matchedResident.name || matchedPkg.receiverName,
          message: paymentMessage,
        },
      );

      this.logger.log(
        `[FACE_PAYMENT_REQUIRED] Tram ${locker.code} - Cu dan ${matchedResident.name} - Ngan #${matchedPkg.boxNumber} can nop phi: ${intent.amount} VND (Order #${intent.orderCode})`,
      );

      const totalInferenceTime = Date.now() - startTime;

      return {
        success: false,
        requiresPayment: true,
        boxNumber: matchedPkg.boxNumber,
        feeAmount: intent.amount,
        orderCode: intent.orderCode,
        qrPayload: intent.qrPayload,
        paymentUrl: intent.paymentUrl,
        message: paymentMessage,
        residentName: matchedResident.name || matchedPkg.receiverName,
        residentPhone: matchedResident.phone || matchedPkg.receiverPhone,
        apartment: matchedResident.apartment || matchedPkg.apartment,
        trackingNumber: matchedPkg.trackingNumber,
        matchScore: bestMatch.score,
        livenessScore: livenessResult.livenessScore,
        inferenceTimeMs: totalInferenceTime,
      };
    }

    // Chiem quyen nhan kien bang mot lenh cap nhat duy nhat de hai yeu cau dong thoi khong cung mo tu
    const claimedPkg = await claimPackageForPickup(
      this.packageModel,
      matchedPkg._id,
    );
    if (!claimedPkg) {
      throw new BadRequestException(
        'Buu kien da duoc nhan truoc do boi mot yeu cau khac',
      );
    }

    // Phat lenh mo khoa Solenoid toi phan cung ESP32 qua MQTT ngay sau khi chiem quyen nhan kien
    this.mqttService
      .publishDoorUnlock(locker.code, matchedPkg.boxNumber)
      .catch((err) => {
        this.logger.error(
          `Loi khi phat lenh MQTT mo ngan ${matchedPkg.boxNumber} tai tram ${locker.code}: ${err}`,
        );
      });

    // Buoc 6: Giai phong ngan tu ve trang thai kha dung
    const box = await this.boxModel.findById(matchedPkg.boxId);
    if (box) {
      box.status = BoxStatus.AVAILABLE;
      box.currentPackageId = undefined;
      box.doorStatus = DoorStatus.OPEN;
      box.hasItem = false;
      await box.save();
    }

    // Ghi nhat ky su kien mo tu bang Face ID
    await this.activityLogsService.recordLockerAction({
      locker,
      boxNumber: matchedPkg.boxNumber,
      packageId: matchedPkg._id,
      action: LockerAction.PICKUP_FACE_ID,
      performedBy: matchedResident.phone || matchedPkg.receiverPhone,
      status: 'SUCCESS',
      actor: {
        userId: matchedResident._id,
        name: matchedResident.name,
        phone: matchedResident.phone,
        role: Role.RESIDENT,
      },
      metadata: {
        matchScore: bestMatch.score,
        livenessScore: livenessResult.livenessScore,
        verificationMethod: 'AI_FACE_ID',
      },
    });

    const totalInferenceTime = Date.now() - startTime;
    this.logger.log(
      `Xac thuc Face ID thanh cong: Cu dan ${matchedResident.name} - Ngan #${matchedPkg.boxNumber} - Do tuong dong: ${(bestMatch.score * 100).toFixed(1)}% - Tong thoi gian: ${totalInferenceTime}ms`,
    );

    return {
      success: true,
      boxNumber: matchedPkg.boxNumber,
      residentName: matchedResident.name || matchedPkg.receiverName,
      residentPhone: matchedResident.phone || matchedPkg.receiverPhone,
      apartment: matchedResident.apartment || matchedPkg.apartment,
      trackingNumber: matchedPkg.trackingNumber,
      matchScore: bestMatch.score,
      livenessScore: livenessResult.livenessScore,
      inferenceTimeMs: totalInferenceTime,
    };
  }

  // Kiểm tra so khớp khuôn mặt thử nghiệm với các đơn hàng tại trạm tủ mà không thực hiện mở tủ hay đổi dữ liệu
  async checkMatchOnly(
    lockerCode: string,
    imageBuffer: Buffer,
    options?: { includeCroppedFace?: boolean },
  ): Promise<CheckFaceMatchResult> {
    const startTime = Date.now();

    // Bước 1: Phát hiện vị trí và 5 điểm mốc khuôn mặt bằng mô hình YuNet
    const detectedFace = await this.faceDetectorService.detectFace(imageBuffer);
    const faceDetectionInfo: FaceDetectionMetadata = detectedFace
      ? {
        detected: true,
        confidence: Math.round(detectedFace.score * 1000) / 1000,
        box: {
          x1: Math.round(detectedFace.x1 * 1000) / 1000,
          y1: Math.round(detectedFace.y1 * 1000) / 1000,
          x2: Math.round(detectedFace.x2 * 1000) / 1000,
          y2: Math.round(detectedFace.y2 * 1000) / 1000,
        },
        landmarks: detectedFace.landmarks,
        cropApplied: true,
      }
      : {
        detected: false,
        cropApplied: false,
      };

    let croppedFaceBase64: string | undefined;
    if (options?.includeCroppedFace && detectedFace) {
      try {
        const croppedBuffer =
          await this.faceDetectorService.cropFace(imageBuffer);
        croppedFaceBase64 = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`;
      } catch (err: unknown) {
        this.logger.warn(`Không thể tạo chuỗi Base64 ảnh crop: ${String(err)}`);
      }
    }

    // Bước 2: Kiểm tra tính chân thực khuôn mặt bằng mô hình Anti-Spoofing
    const livenessResult = await this.antiSpoofingService.checkLiveness(
      imageBuffer,
      { faceBox: detectedFace },
    );

    if (!livenessResult.isReal) {
      return {
        isMatch: false,
        isReal: false,
        matchScore: 0,
        livenessScore: Math.round(livenessResult.livenessScore * 1000) / 1000,
        threshold: FACE_MATCH_THRESHOLD,
        candidateCount: 0,
        faceDetection: faceDetectionInfo,
        croppedFaceBase64,
        message: `Phát hiện ảnh giả mạo hoặc không đạt chuẩn (Điểm thật: ${(livenessResult.livenessScore * 100).toFixed(1)}%)`,
        inferenceTimeMs: Date.now() - startTime,
        dryRun: true,
      };
    }

    // Bước 3: Trích xuất vector đặc trưng 512 chiều từ ảnh khuôn mặt (đã tự động crop)
    const inputEmbedding =
      await this.faceRecognitionService.extractEmbedding(imageBuffer);

    // Bước 4: Tìm kiếm trạm tủ theo mã code
    const locker = await this.lockerModel.findOne({
      code: lockerCode.trim().toUpperCase(),
    });

    if (!locker) {
      throw new NotFoundException(
        `Trạm tủ với mã ${lockerCode} không tồn tại trong hệ thống`,
      );
    }

    // Bước 5: Lấy danh sách các bưu kiện đang chờ nhận tại trạm tủ này (bao gồm cả bưu kiện quá hạn)
    const activePackages = await this.packageModel
      .find({
        lockerId: locker._id,
        status: {
          $in: [PackageStatus.WAITING_FOR_PICKUP, PackageStatus.OVERDUE],
        },
      })
      .populate({
        path: 'residentId',
        select:
          '+faceAuth.embedding faceAuth.enabled name phone apartment avatar',
      });

    if (activePackages.length === 0) {
      return {
        isMatch: false,
        isReal: true,
        matchScore: 0,
        livenessScore: Math.round(livenessResult.livenessScore * 1000) / 1000,
        threshold: FACE_MATCH_THRESHOLD,
        candidateCount: 0,
        faceDetection: faceDetectionInfo,
        croppedFaceBase64,
        message: 'Hiện không có bưu kiện nào đang chờ nhận tại trạm tủ này',
        inferenceTimeMs: Date.now() - startTime,
        dryRun: true,
      };
    }

    // Bước 6: So khớp 1:N với các cư dân có Face ID
    let bestMatch: {
      package: Package;
      resident: User;
      score: number;
    } | null = null;
    let validCandidates = 0;

    for (const pkg of activePackages) {
      const resident = pkg.residentId as unknown as User;
      if (
        !resident ||
        !resident.faceAuth?.enabled ||
        !resident.faceAuth?.embedding ||
        resident.faceAuth.embedding.length === 0
      ) {
        continue;
      }

      validCandidates++;
      const similarity = this.faceRecognitionService.calculateCosineSimilarity(
        inputEmbedding,
        resident.faceAuth.embedding,
      );

      if (similarity >= FACE_MATCH_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.score) {
          bestMatch = {
            package: pkg,
            resident,
            score: similarity,
          };
        }
      }
    }

    const inferenceTimeMs = Date.now() - startTime;

    if (!bestMatch) {
      return {
        isMatch: false,
        isReal: true,
        matchScore: 0,
        livenessScore: Math.round(livenessResult.livenessScore * 1000) / 1000,
        threshold: FACE_MATCH_THRESHOLD,
        candidateCount: validCandidates,
        faceDetection: faceDetectionInfo,
        croppedFaceBase64,
        message: `Khuôn mặt không trùng khớp với bất kỳ cư dân nào có đơn chờ tại tủ (${validCandidates} cư dân có Face ID)`,
        inferenceTimeMs,
        dryRun: true,
      };
    }

    const matchedPkg = bestMatch.package;
    const matchedResident = bestMatch.resident;

    return {
      isMatch: true,
      isReal: true,
      matchScore: Math.round(bestMatch.score * 1000) / 1000,
      livenessScore: Math.round(livenessResult.livenessScore * 1000) / 1000,
      threshold: FACE_MATCH_THRESHOLD,
      faceDetection: faceDetectionInfo,
      croppedFaceBase64,
      matchedResident: {
        userId: String(matchedResident._id),
        name: matchedResident.name,
        phone: matchedResident.phone,
        apartment: matchedResident.apartment,
      },
      matchedPackage: {
        packageId: String(matchedPkg._id),
        trackingNumber: matchedPkg.trackingNumber,
        boxNumber: matchedPkg.boxNumber,
        status: matchedPkg.status,
      },
      candidateCount: validCandidates,
      message: `Xác thực khớp với cư dân ${matchedResident.name} - Ô tủ số ${matchedPkg.boxNumber}`,
      inferenceTimeMs,
      dryRun: true,
    };
  }
}
