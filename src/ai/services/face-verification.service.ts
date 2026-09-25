import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Package } from '../../packages/schemas/package.schema';
import { Locker } from '../../lockers/schemas/locker.schema';
import { Box } from '../../lockers/schemas/box.schema';
import { User } from '../../users/schemas/user.schema';
import { LockerLog } from '../../lockers/schemas/locker-log.schema';
import { PackageStatus } from '../../packages/enums/package.enums';
import {
  BoxStatus,
  DoorStatus,
  LockerAction,
} from '../../lockers/enums/locker.enums';
import { AntiSpoofingService } from './anti-spoofing.service';
import { FaceRecognitionService } from './face-recognition.service';
import { MqttService } from '../../mqtt/mqtt.service';
import {
  VerifyFaceHardwareResult,
  EnrollFaceResult,
  ProcessEnrollmentResult,
} from '../interfaces/face-verification.interface';

// Nguong do tuong dong Cosine Similarity chap nhan trung khop cho vector 512 chieu ArcFace
const FACE_MATCH_THRESHOLD = 0.65;

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
    @InjectModel(LockerLog.name)
    private readonly lockerLogModel: Model<LockerLog>,
    private readonly antiSpoofingService: AntiSpoofingService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly mqttService: MqttService,
  ) {}

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
    identifier = 'resident',
  ): Promise<ProcessEnrollmentResult> {
    if (!imageBuffers || imageBuffers.length === 0) {
      throw new BadRequestException(
        'Vui lòng cung cấp ít nhất một ảnh chụp khuôn mặt hợp lệ',
      );
    }

    const primaryBuffer = imageBuffers[0];
    const livenessResult =
      await this.antiSpoofingService.checkLiveness(primaryBuffer);
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
      avatarUrl: user.avatar,
      enrolledAt,
      enrolledPosesCount: 1,
    };
  }

  // Xac thuc khuon mat tu camera trạm tu Kiosk va thuc hien mo ngan tu tuong ung
  async verifyAndUnlock(
    lockerCode: string,
    imageBuffer: Buffer,
  ): Promise<VerifyFaceHardwareResult> {
    const startTime = Date.now();

    // Buoc 1: Kiem tra chong gia mao bang mo hinh Anti-Spoofing
    const livenessResult =
      await this.antiSpoofingService.checkLiveness(imageBuffer);
    if (!livenessResult.isReal) {
      this.logger.warn(
        `Tu choi xac thuc tai tram ${lockerCode}: Phat hien mat gia (Liveness: ${livenessResult.livenessScore})`,
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

    // Buoc 4: Lay danh sach cac buu kien dang cho cu dan den lay tai tram tu nay
    const activePackages = await this.packageModel
      .find({
        lockerId: locker._id,
        status: PackageStatus.WAITING_FOR_PICKUP,
      })
      .populate({
        path: 'residentId',
        select: '+faceAuth.embedding name phone apartment avatar',
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

    // Buoc 6: Giai phong ngan tu ve trang thai kha dung
    const box = await this.boxModel.findById(matchedPkg.boxId);
    if (box) {
      box.status = BoxStatus.AVAILABLE;
      box.currentPackageId = undefined;
      box.doorStatus = DoorStatus.OPEN;
      box.hasItem = false;
      await box.save();
    }

    // Cap nhat trang thai buu kien da duoc nhan thanh cong
    matchedPkg.status = PackageStatus.PICKED_UP;
    matchedPkg.pickedUpAt = new Date();
    await matchedPkg.save();

    // Ghi nhat ky su kien mo tu bang Face ID
    await this.lockerLogModel.create({
      lockerId: locker._id,
      boxNumber: matchedPkg.boxNumber,
      packageId: matchedPkg._id,
      action: LockerAction.PICKUP_FACE_ID,
      performedBy: matchedResident.phone || matchedPkg.receiverPhone,
      status: 'SUCCESS',
      metadata: {
        matchScore: bestMatch.score,
        livenessScore: livenessResult.livenessScore,
        verificationMethod: 'AI_FACE_ID',
      },
    });

    // Phat lenh mo khoa Solenoid toi phan cung ESP32 qua MQTT
    this.mqttService
      .publishDoorUnlock(locker.code, matchedPkg.boxNumber)
      .catch((err) => {
        this.logger.error(
          `Loi khi phat lenh MQTT mo ngan ${matchedPkg.boxNumber} tai tram ${locker.code}: ${err}`,
        );
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
}
