import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import {
  LivenessCheckResult,
  AntiSpoofingOptions,
} from '../interfaces/anti-spoofing.interface';
import { FaceDetectorService, DetectedBox } from './face-detector.service';

// Hằng số kích thước chuẩn đầu vào và tỷ lệ cắt khuôn mặt của mô hình MiniFASNet V2
const FAS_INPUT_SIZE = 80;
const LEGACY_INPUT_SIZE = 224;
const DEFAULT_LIVENESS_THRESHOLD = 0.75;
const DEFAULT_CROP_SCALE = 2.7;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

@Injectable()
export class AntiSpoofingService implements OnModuleInit {
  private readonly logger = new Logger(AntiSpoofingService.name);
  private session: ort.InferenceSession | null = null;
  private isModelLoaded = false;
  private isMiniFasNet = false;
  private faceDetectorService: FaceDetectorService;

  constructor(@Optional() faceDetectorService?: FaceDetectorService) {
    this.faceDetectorService = faceDetectorService || new FaceDetectorService();
  }

  // Khởi tạo và nạp mô hình ONNX vào RAM khi module khởi động
  async onModuleInit(): Promise<void> {
    await this.faceDetectorService.loadModel();
    await this.loadModel();
  }

  // Nạp file trọng số ONNX ưu tiên MiniFASNet V2 hoặc fallback MobileNetV2
  async loadModel(): Promise<void> {
    try {
      const candidatePaths = [
        path.join(__dirname, '../models/minifasnet_v2.onnx'),
        path.join(process.cwd(), 'dist/ai/models/minifasnet_v2.onnx'),
        path.join(process.cwd(), 'src/ai/models/minifasnet_v2.onnx'),
        path.join(__dirname, '../models/anti_spoofing_mobilenetv2.onnx'),
        path.join(
          process.cwd(),
          'dist/ai/models/anti_spoofing_mobilenetv2.onnx',
        ),
        path.join(
          process.cwd(),
          'src/ai/models/anti_spoofing_mobilenetv2.onnx',
        ),
      ];

      const modelPath = candidatePaths.find((p) => fs.existsSync(p));

      if (!modelPath) {
        this.logger.warn(
          `Không tìm thấy file model Anti-Spoofing tại: ${candidatePaths.join(' | ')}`,
        );
        return;
      }

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      this.isMiniFasNet = modelPath.toLowerCase().includes('minifasnet');
      this.isModelLoaded = true;

      const modelType = this.isMiniFasNet ? 'MiniFASNetV2' : 'MobileNetV2';
      this.logger.log(
        `Nạp mô hình Anti-Spoofing ${modelType} ONNX thành công vào RAM`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi nạp mô hình Anti-Spoofing: ${message}`);
    }
  }

  // Tính toán vùng cắt mở rộng chứa khuôn mặt và bối cảnh viền theo tỷ lệ scale của Silent Face Anti-Spoofing
  calculateCropBox(
    srcW: number,
    srcH: number,
    faceBox: { x1: number; y1: number; x2: number; y2: number },
    scale = DEFAULT_CROP_SCALE,
  ): { left: number; top: number; width: number; height: number } {
    const boxX = faceBox.x1 * srcW;
    const boxY = faceBox.y1 * srcH;
    const boxW = Math.max(1, (faceBox.x2 - faceBox.x1) * srcW);
    const boxH = Math.max(1, (faceBox.y2 - faceBox.y1) * srcH);

    const actualScale = Math.min(
      (srcH - 1) / boxH,
      Math.min((srcW - 1) / boxW, scale),
    );
    const newW = boxW * actualScale;
    const newH = boxH * actualScale;
    const cx = boxX + boxW / 2;
    const cy = boxY + boxH / 2;

    let left = cx - newW / 2;
    let top = cy - newH / 2;
    let right = cx + newW / 2;
    let bottom = cy + newH / 2;

    if (left < 0) {
      right -= left;
      left = 0;
    }
    if (top < 0) {
      bottom -= top;
      top = 0;
    }
    if (right > srcW - 1) {
      left -= right - srcW + 1;
      right = srcW - 1;
    }
    if (bottom > srcH - 1) {
      top -= bottom - srcH + 1;
      bottom = srcH - 1;
    }

    const clampedLeft = Math.max(0, Math.floor(left));
    const clampedTop = Math.max(0, Math.floor(top));
    const width = Math.max(
      1,
      Math.min(srcW - clampedLeft, Math.floor(right - left + 1)),
    );
    const height = Math.max(
      1,
      Math.min(srcH - clampedTop, Math.floor(bottom - top + 1)),
    );

    return { left: clampedLeft, top: clampedTop, width, height };
  }

  // Cắt và chuẩn hóa kích thước vùng ảnh khuôn mặt mở rộng thành buffer raw pixel RGB 80x80
  async cropFacePatch(
    imageBuffer: Buffer,
    faceBox: { x1: number; y1: number; x2: number; y2: number },
  ): Promise<Buffer> {
    const meta = await sharp(imageBuffer).metadata();
    const srcW = meta.width || 640;
    const srcH = meta.height || 480;

    const cropBox = this.calculateCropBox(
      srcW,
      srcH,
      faceBox,
      DEFAULT_CROP_SCALE,
    );

    return sharp(imageBuffer)
      .extract(cropBox)
      .resize(FAS_INPUT_SIZE, FAS_INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
  }

  // Chuyển đổi dữ liệu pixel raw RGB thành Tensor Float32 dải giá trị 0 đến 255 theo định dạng NCHW cho MiniFASNet
  createMiniFasNetTensor(rawPixelBuffer: Buffer): ort.Tensor {
    const pixelCount = FAS_INPUT_SIZE * FAS_INPUT_SIZE;
    const floatData = new Float32Array(3 * pixelCount);

    for (let i = 0; i < pixelCount; i++) {
      floatData[i] = rawPixelBuffer[i * 3];
      floatData[pixelCount + i] = rawPixelBuffer[i * 3 + 1];
      floatData[2 * pixelCount + i] = rawPixelBuffer[i * 3 + 2];
    }

    return new ort.Tensor('float32', floatData, [
      1,
      3,
      FAS_INPUT_SIZE,
      FAS_INPUT_SIZE,
    ]);
  }

  // Tiền xử lý theo chuẩn ImageNet cũ cho mô hình MobileNetV2 khi không có MiniFASNet
  async preprocessLegacyImage(imageBuffer: Buffer): Promise<ort.Tensor> {
    const rawPixelBuffer = await sharp(imageBuffer)
      .resize(LEGACY_INPUT_SIZE, LEGACY_INPUT_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    const pixelCount = LEGACY_INPUT_SIZE * LEGACY_INPUT_SIZE;
    const floatData = new Float32Array(3 * pixelCount);

    for (let i = 0; i < pixelCount; i++) {
      const r = rawPixelBuffer[i * 3];
      const g = rawPixelBuffer[i * 3 + 1];
      const b = rawPixelBuffer[i * 3 + 2];

      floatData[i] = (r / 255.0 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      floatData[pixelCount + i] =
        (g / 255.0 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      floatData[2 * pixelCount + i] =
        (b / 255.0 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }

    return new ort.Tensor('float32', floatData, [
      1,
      3,
      LEGACY_INPUT_SIZE,
      LEGACY_INPUT_SIZE,
    ]);
  }

  // Tính toán xác suất ba lớp đầu ra của MiniFASNet trong đó nhãn index 1 đại diện cho người thật
  calculateMiniFasNetScores(logits: Float32Array): {
    livenessScore: number;
    spoofScore: number;
  } {
    const maxLogit = Math.max(logits[0], logits[1], logits[2]);
    const exp0 = Math.exp(logits[0] - maxLogit);
    const exp1 = Math.exp(logits[1] - maxLogit);
    const exp2 = Math.exp(logits[2] - maxLogit);
    const sumExp = exp0 + exp1 + exp2;

    const livenessScore = Number((exp1 / sumExp).toFixed(4));
    const spoofScore = Number(((exp0 + exp2) / sumExp).toFixed(4));

    return { livenessScore, spoofScore };
  }

  // Tính toán xác suất nhị phân cho mô hình phân loại hai nhãn cũ
  calculateLegacyScores(logits: Float32Array): {
    livenessScore: number;
    spoofScore: number;
  } {
    const maxLogit = Math.max(logits[0], logits[1]);
    const exp0 = Math.exp(logits[0] - maxLogit);
    const exp1 = Math.exp(logits[1] - maxLogit);
    const sumExp = exp0 + exp1;

    const livenessScore = Number((exp0 / sumExp).toFixed(4));
    const spoofScore = Number((exp1 / sumExp).toFixed(4));

    return { livenessScore, spoofScore };
  }

  // Kiểm tra độ chân thực của khuôn mặt chống lại các hình thức giả mạo màn hình hoặc ảnh in
  async checkLiveness(
    imageBuffer: Buffer,
    options?: AntiSpoofingOptions,
  ): Promise<LivenessCheckResult> {
    if (!this.session || !this.isModelLoaded) {
      await this.loadModel();
      if (!this.session) {
        throw new Error('Mô hình Anti-Spoofing ONNX chưa được khởi tạo');
      }
    }

    const threshold = options?.threshold ?? DEFAULT_LIVENESS_THRESHOLD;
    const startTime = Date.now();

    let faceBox = options?.faceBox;
    if (this.isMiniFasNet && faceBox === undefined) {
      faceBox = await this.faceDetectorService.detectFace(imageBuffer);
    }

    // Trả về kết quả không hợp lệ nếu không tìm thấy khuôn mặt trong ảnh
    if (this.isMiniFasNet && !faceBox) {
      this.logger.warn(
        'Không phát hiện khuôn mặt trong ảnh để kiểm tra độ chân thực',
      );
      return {
        isReal: false,
        livenessScore: 0,
        spoofScore: 1,
        inferenceTimeMs: Date.now() - startTime,
        verdict: 'SPOOF',
      };
    }

    const inputTensor = this.isMiniFasNet
      ? this.createMiniFasNetTensor(
          await this.cropFacePatch(imageBuffer, faceBox!),
        )
      : await this.preprocessLegacyImage(imageBuffer);

    const inputName = this.session.inputNames[0];
    const feeds: Record<string, ort.Tensor> = { [inputName]: inputTensor };

    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    const logits = results[outputName].data as Float32Array;

    const { livenessScore, spoofScore } = this.isMiniFasNet
      ? this.calculateMiniFasNetScores(logits)
      : this.calculateLegacyScores(logits);

    const inferenceTimeMs = Date.now() - startTime;
    const isReal = livenessScore >= threshold;
    const verdict = isReal ? 'REAL' : 'SPOOF';

    return {
      isReal,
      livenessScore,
      spoofScore,
      inferenceTimeMs,
      verdict,
    };
  }

  // Lấy trạng thái sẵn sàng của mô hình Anti-Spoofing
  isReady(): boolean {
    return this.isModelLoaded && this.session !== null;
  }

  // Trích xuất buffer hình ảnh từ multipart file tải lên hoặc chuỗi Base64
  extractImageBuffer(file?: Express.Multer.File, imageBase64?: string): Buffer {
    if (file?.buffer) {
      return file.buffer;
    }

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length > 0) {
        return buf;
      }
    }

    throw new BadRequestException(
      'Vui lòng tải lên file ảnh hoặc cung cấp chuỗi imageBase64 hợp lệ',
    );
  }

  // Lấy thông tin trạng thái hoạt động và tham số cấu hình hiện hành của mô hình
  getModelStatus() {
    return {
      isReady: this.isReady(),
      modelArchitecture: this.isMiniFasNet ? 'MiniFASNetV2' : 'MobileNetV2',
      inputSize: this.isMiniFasNet ? FAS_INPUT_SIZE : LEGACY_INPUT_SIZE,
      defaultThreshold: DEFAULT_LIVENESS_THRESHOLD,
    };
  }
}
