import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

import { FaceDetectorService } from './face-detector.service';

// Hang so kich thuoc anh dau vao va chieu khong gian vector dac trung
const FACE_INPUT_SIZE = 112;
const EMBEDDING_DIMENSION = 512;

@Injectable()
export class FaceRecognitionService implements OnModuleInit {
  private readonly logger = new Logger(FaceRecognitionService.name);
  private session: ort.InferenceSession | null = null;
  private isModelLoaded = false;
  private faceDetectorService: FaceDetectorService;

  constructor(@Optional() faceDetectorService?: FaceDetectorService) {
    this.faceDetectorService = faceDetectorService || new FaceDetectorService();
  }

  // Khoi tao va nap mo hinh MobileFaceNet ONNX khi module khoi dong
  async onModuleInit(): Promise<void> {
    await this.faceDetectorService.loadModel();
    await this.loadModel();
  }

  // Nap file trong so ONNX tu danh sach cac duong dan ung vien
  async loadModel(): Promise<void> {
    try {
      const candidatePaths = [
        path.join(__dirname, '../models/mobilefacenet_arcface.onnx'),
        path.join(process.cwd(), 'dist/ai/models/mobilefacenet_arcface.onnx'),
        path.join(process.cwd(), 'src/ai/models/mobilefacenet_arcface.onnx'),
      ];

      const modelPath = candidatePaths.find((p) => fs.existsSync(p));

      if (!modelPath) {
        this.logger.warn(
          `Khong tim thay file model MobileFaceNet tai: ${candidatePaths.join(' | ')}`,
        );
        return;
      }

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      this.isModelLoaded = true;
      this.logger.log(
        'Nap mo hinh MobileFaceNet ArcFace ONNX thanh cong vao RAM',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Loi khi nap mo hinh MobileFaceNet: ${message}`);
    }
  }

  // Tien xu ly anh khuon mat ve dang Tensor Float32 kich thuoc 112x112 theo chuan NCHW
  async preprocessFaceToTensor(imageBuffer: Buffer): Promise<ort.Tensor> {
    const rawPixelBuffer = await sharp(imageBuffer)
      .resize(FACE_INPUT_SIZE, FACE_INPUT_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .removeAlpha()
      .raw()
      .toBuffer();

    const pixelCount = FACE_INPUT_SIZE * FACE_INPUT_SIZE;
    const floatData = new Float32Array(3 * pixelCount);

    // Chuan hoa gia tri pixel ve doan [-1, 1] va sap xep theo kenh mau NCHW
    for (let i = 0; i < pixelCount; i++) {
      const r = rawPixelBuffer[i * 3];
      const g = rawPixelBuffer[i * 3 + 1];
      const b = rawPixelBuffer[i * 3 + 2];

      floatData[i] = (r - 127.5) / 128.0;
      floatData[pixelCount + i] = (g - 127.5) / 128.0;
      floatData[2 * pixelCount + i] = (b - 127.5) / 128.0;
    }

    return new ort.Tensor('float32', floatData, [
      1,
      3,
      FACE_INPUT_SIZE,
      FACE_INPUT_SIZE,
    ]);
  }

  // Trich xuat vector dac trung 512 chieu da chuan hoa L2 tu buffer anh khuon mat
  async extractEmbedding(imageBuffer: Buffer): Promise<number[]> {
    if (!this.session || !this.isModelLoaded) {
      await this.loadModel();
      if (!this.session) {
        throw new Error('Mo hinh MobileFaceNet ONNX chua duoc khoi tao');
      }
    }

    // Tu dong phat hien va can chinh chuan hoa khuon mat theo landmarks truoc khi dua vao ArcFace
    const croppedFaceBuffer =
      await this.faceDetectorService.cropFace(imageBuffer);
    const inputTensor = await this.preprocessFaceToTensor(croppedFaceBuffer);
    const inputName = this.session.inputNames[0];

    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputName] = inputTensor;

    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0];
    const rawEmbedding = results[outputName].data as Float32Array;

    // Tinh do dai vector Euclidean L2 norm de chuan hoa do dai ve 1
    let sumSquares = 0;
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      sumSquares += rawEmbedding[i] * rawEmbedding[i];
    }
    const norm = Math.sqrt(sumSquares) || 1e-10;

    const normalizedVector: number[] = new Array<number>(EMBEDDING_DIMENSION);
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      normalizedVector[i] = Number((rawEmbedding[i] / norm).toFixed(6));
    }

    return normalizedVector;
  }

  // Tinh do tuong dong Cosine Similarity giua hai vector dac trung da chuan hoa L2
  calculateCosineSimilarity(v1: number[], v2: number[]): number {
    if (v1.length !== v2.length) {
      return 0;
    }

    let dotProduct = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
    }

    return Number(dotProduct.toFixed(4));
  }

  // Kiem tra trang thai san sang cua mo hinh MobileFaceNet trong he thong
  isReady(): boolean {
    return this.isModelLoaded && this.session !== null;
  }
}
