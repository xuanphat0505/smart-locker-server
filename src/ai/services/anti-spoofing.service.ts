import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import {
  LivenessCheckResult,
  AntiSpoofingOptions,
} from '../interfaces/anti-spoofing.interface';

// Hang so kich thuoc anh va chuan hoa ImageNet theo dung kien truc huan luyen
const MODEL_INPUT_SIZE = 224;
const DEFAULT_LIVENESS_THRESHOLD = 0.8;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

@Injectable()
export class AntiSpoofingService implements OnModuleInit {
  private readonly logger = new Logger(AntiSpoofingService.name);
  private session: ort.InferenceSession | null = null;
  private isModelLoaded = false;

  // Khoi tao va nap mo hinh ONNX vao RAM khi module khoi dong
  async onModuleInit(): Promise<void> {
    await this.loadModel();
  }

  // Nap file trong so ONNX tu thu muc models vao bo nho
  async loadModel(): Promise<void> {
    try {
      const candidatePaths = [
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
          `Khong tim thay file model tai cac duong dan: ${candidatePaths.join(' | ')}`,
        );
        return;
      }

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      this.isModelLoaded = true;
      this.logger.log('Nap mo hinh Anti-Spoofing ONNX thanh cong vao RAM');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Loi khi nap mo hinh Anti-Spoofing: ${message}`);
    }
  }

  // Chuyen doi Buffer anh JPEG thanh Tensor Float32 theo chuan NCHW ImageNet
  async preprocessImageToTensor(imageBuffer: Buffer): Promise<ort.Tensor> {
    const rawPixelBuffer = await sharp(imageBuffer)
      .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const floatData = new Float32Array(3 * pixelCount);

    // Sap xep du lieu theo dinh dang phang NCHW va ap dung chuan hoa ImageNet
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
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    ]);
  }

  // Kiem tra hinh anh la nguoi that hay gia mao man hinh hoac anh in
  async checkLiveness(
    imageBuffer: Buffer,
    options?: AntiSpoofingOptions,
  ): Promise<LivenessCheckResult> {
    if (!this.session || !this.isModelLoaded) {
      await this.loadModel();
      if (!this.session) {
        throw new Error('Mo hinh Anti-Spoofing ONNX chua duoc khoi tao');
      }
    }

    const threshold = options?.threshold ?? DEFAULT_LIVENESS_THRESHOLD;
    const startTime = Date.now();

    const inputTensor = await this.preprocessImageToTensor(imageBuffer);
    const inputName = this.session.inputNames[0];

    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputName] = inputTensor;

    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    const outputTensor = results[outputName];
    const logits = outputTensor.data as Float32Array;

    // Tinh toan ham Softmax de quy doi logits ve xac suat phan tram
    const maxLogit = Math.max(logits[0], logits[1]);
    const exp0 = Math.exp(logits[0] - maxLogit);
    const exp1 = Math.exp(logits[1] - maxLogit);
    const sumExp = exp0 + exp1;

    const livenessScore = Number((exp0 / sumExp).toFixed(4));
    const spoofScore = Number((exp1 / sumExp).toFixed(4));
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

  // Lay trang thai san sang cua mo hinh AI trong he thong
  isReady(): boolean {
    return this.isModelLoaded && this.session !== null;
  }

  // Trích xuất và chuẩn hóa dữ liệu Buffer hình ảnh từ Multipart File hoặc chuỗi Base64
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

  // Lấy thông tin trạng thái hoạt động và tham số cấu hình thực tế của mô hình
  getModelStatus() {
    return {
      isReady: this.isReady(),
      modelArchitecture: 'MobileNetV2',
      inputSize: MODEL_INPUT_SIZE,
      defaultThreshold: DEFAULT_LIVENESS_THRESHOLD,
    };
  }
}
