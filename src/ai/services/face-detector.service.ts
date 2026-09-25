import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

// Kích thước chuẩn đầu vào của mô hình YuNet 2023mar
const YUNET_INPUT_SIZE = 640;
const YUNET_STRIDES = [8, 16, 32];
const DEFAULT_SCORE_THRESHOLD = 0.6;
const DEFAULT_IOU_THRESHOLD = 0.4;

// Điểm chuẩn trục mắt trong không gian ArcFace kích thước 112x112
const ARCFACE_REFERENCE_EYE_DIST = 35.2372;
const ARCFACE_EYE_Y_RATIO = 51.5989 / 112.0;
const ARCFACE_EYE_X_RATIO = 55.9132 / 112.0;

export interface LandmarkPoint {
  x: number;
  y: number;
}

export interface FacialLandmarks {
  rightEye: LandmarkPoint;
  leftEye: LandmarkPoint;
  noseTip: LandmarkPoint;
  rightMouth: LandmarkPoint;
  leftMouth: LandmarkPoint;
}

export interface DetectedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  area: number;
  landmarks?: FacialLandmarks;
}

interface RawFaceCandidate {
  origX1: number;
  origY1: number;
  origX2: number;
  origY2: number;
  score: number;
  landmarks: FacialLandmarks;
}

@Injectable()
export class FaceDetectorService implements OnModuleInit {
  private readonly logger = new Logger(FaceDetectorService.name);
  private session: ort.InferenceSession | null = null;
  private isModelLoaded = false;

  // Nạp mô hình YuNet phát hiện khuôn mặt và 5 điểm mốc khi khởi động module
  async onModuleInit(): Promise<void> {
    await this.loadModel();
  }

  // Tải file trọng số ONNX của YuNet vào bộ nhớ RAM
  async loadModel(): Promise<void> {
    try {
      const candidatePaths = [
        path.join(__dirname, '../models/face_detection_yunet_2023mar.onnx'),
        path.join(
          process.cwd(),
          'dist/ai/models/face_detection_yunet_2023mar.onnx',
        ),
        path.join(
          process.cwd(),
          'src/ai/models/face_detection_yunet_2023mar.onnx',
        ),
      ];

      const modelPath = candidatePaths.find((p) => fs.existsSync(p));

      if (!modelPath) {
        this.logger.warn(
          `Không tìm thấy file model YuNet tại: ${candidatePaths.join(' | ')}`,
        );
        return;
      }

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      this.isModelLoaded = true;
      this.logger.log('Nạp mô hình YuNet 2023mar ONNX thành công vào RAM');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi nạp mô hình YuNet: ${message}`);
    }
  }

  // Tính tỷ lệ diện tích giao trên hợp IoU giữa hai hộp tọa độ ảnh gốc
  private calculateIoU(c1: RawFaceCandidate, c2: RawFaceCandidate): number {
    const x1 = Math.max(c1.origX1, c2.origX1);
    const y1 = Math.max(c1.origY1, c2.origY1);
    const x2 = Math.min(c1.origX2, c2.origX2);
    const y2 = Math.min(c1.origY2, c2.origY2);

    const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (c1.origX2 - c1.origX1) * (c1.origY2 - c1.origY1);
    const area2 = (c2.origX2 - c2.origX1) * (c2.origY2 - c2.origY1);
    const unionArea = area1 + area2 - interArea;

    return unionArea > 0 ? interArea / unionArea : 0;
  }

  // Khử các kết quả dự đoán trùng lặp bằng giải thuật Non-Maximum Suppression
  private applyNms(
    candidates: RawFaceCandidate[],
    iouThreshold = DEFAULT_IOU_THRESHOLD,
  ): RawFaceCandidate[] {
    const selected: RawFaceCandidate[] = [];
    for (const candidate of candidates) {
      let keep = true;
      for (const sel of selected) {
        if (this.calculateIoU(candidate, sel) > iouThreshold) {
          keep = false;
          break;
        }
      }
      if (keep) {
        selected.push(candidate);
      }
    }
    return selected;
  }

  // Phát hiện khuôn mặt và trích xuất 5 điểm mốc đặc trưng từ ảnh đầu vào
  async detectFace(
    imageBuffer: Buffer,
    scoreThreshold = DEFAULT_SCORE_THRESHOLD,
  ): Promise<DetectedBox | null> {
    if (!this.session || !this.isModelLoaded) {
      await this.loadModel();
      if (!this.session) return null;
    }

    try {
      const meta = await sharp(imageBuffer).metadata();
      const origW = meta.width || YUNET_INPUT_SIZE;
      const origH = meta.height || YUNET_INPUT_SIZE;

      const scale = Math.min(
        YUNET_INPUT_SIZE / origW,
        YUNET_INPUT_SIZE / origH,
      );
      const scaledW = Math.round(origW * scale);
      const scaledH = Math.round(origH * scale);

      const resizedBuffer = await sharp(imageBuffer)
        .resize(scaledW, scaledH)
        .extend({
          top: 0,
          left: 0,
          bottom: YUNET_INPUT_SIZE - scaledH,
          right: YUNET_INPUT_SIZE - scaledW,
          background: { r: 0, g: 0, b: 0 },
        })
        .removeAlpha()
        .raw()
        .toBuffer();

      const pixelCount = YUNET_INPUT_SIZE * YUNET_INPUT_SIZE;
      const floatData = new Float32Array(3 * pixelCount);

      // Chuyển đổi định dạng sang tensor RGB NCHW với khoảng giá trị 0 đến 255
      for (let i = 0; i < pixelCount; i++) {
        floatData[i] = resizedBuffer[i * 3];
        floatData[pixelCount + i] = resizedBuffer[i * 3 + 1];
        floatData[2 * pixelCount + i] = resizedBuffer[i * 3 + 2];
      }

      const inputTensor = new ort.Tensor('float32', floatData, [
        1,
        3,
        YUNET_INPUT_SIZE,
        YUNET_INPUT_SIZE,
      ]);

      const results = await this.session.run({
        [this.session.inputNames[0]]: inputTensor,
      });

      const candidates: RawFaceCandidate[] = [];

      for (const stride of YUNET_STRIDES) {
        const cols = Math.floor(YUNET_INPUT_SIZE / stride);
        const rows = Math.floor(YUNET_INPUT_SIZE / stride);

        const clsData = results[`cls_${stride}`].data as Float32Array;
        const objData = results[`obj_${stride}`].data as Float32Array;
        const bboxData = results[`bbox_${stride}`].data as Float32Array;
        const kpsData = results[`kps_${stride}`].data as Float32Array;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const clsScore = Math.max(0, Math.min(1, clsData[idx]));
            const objScore = Math.max(0, Math.min(1, objData[idx]));
            const score = Math.sqrt(clsScore * objScore);

            if (score < scoreThreshold) {
              continue;
            }

            const cx = (c + bboxData[idx * 4 + 0]) * stride;
            const cy = (r + bboxData[idx * 4 + 1]) * stride;
            const w = Math.exp(bboxData[idx * 4 + 2]) * stride;
            const h = Math.exp(bboxData[idx * 4 + 3]) * stride;

            const x1 = cx - w / 2;
            const y1 = cy - h / 2;

            const kx0 = (kpsData[idx * 10 + 0] + c) * stride;
            const ky0 = (kpsData[idx * 10 + 1] + r) * stride;
            const kx1 = (kpsData[idx * 10 + 2] + c) * stride;
            const ky1 = (kpsData[idx * 10 + 3] + r) * stride;
            const kx2 = (kpsData[idx * 10 + 4] + c) * stride;
            const ky2 = (kpsData[idx * 10 + 5] + r) * stride;
            const kx3 = (kpsData[idx * 10 + 6] + c) * stride;
            const ky3 = (kpsData[idx * 10 + 7] + r) * stride;
            const kx4 = (kpsData[idx * 10 + 8] + c) * stride;
            const ky4 = (kpsData[idx * 10 + 9] + r) * stride;

            const origX1 = Math.max(0, x1 / scale);
            const origY1 = Math.max(0, y1 / scale);
            const origX2 = Math.min(origW, (x1 + w) / scale);
            const origY2 = Math.min(origH, (y1 + h) / scale);

            candidates.push({
              origX1,
              origY1,
              origX2,
              origY2,
              score,
              landmarks: {
                rightEye: { x: kx0 / scale, y: ky0 / scale },
                leftEye: { x: kx1 / scale, y: ky1 / scale },
                noseTip: { x: kx2 / scale, y: ky2 / scale },
                rightMouth: { x: kx3 / scale, y: ky3 / scale },
                leftMouth: { x: kx4 / scale, y: ky4 / scale },
              },
            });
          }
        }
      }

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => b.score - a.score);
      const filtered = this.applyNms(candidates);

      if (filtered.length === 0) {
        return null;
      }

      // Ưu tiên khuôn mặt có diện tích lớn nhất (người đứng gần camera nhất)
      filtered.sort((a, b) => {
        const areaA = (a.origX2 - a.origX1) * (a.origY2 - a.origY1);
        const areaB = (b.origX2 - b.origX1) * (b.origY2 - b.origY1);
        return areaB - areaA;
      });

      const best = filtered[0];
      const normX1 = best.origX1 / origW;
      const normY1 = best.origY1 / origH;
      const normX2 = best.origX2 / origW;
      const normY2 = best.origY2 / origH;

      return {
        x1: normX1,
        y1: normY1,
        x2: normX2,
        y2: normY2,
        score: best.score,
        area: (normX2 - normX1) * (normY2 - normY1),
        landmarks: best.landmarks,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi trong quá trình detect khuôn mặt: ${message}`);
      return null;
    }
  }

  // Căn chỉnh xoay ngang trục mắt và cắt khuôn mặt theo chuẩn ArcFace kích thước 112x112
  async alignFace(
    imageBuffer: Buffer,
    landmarks: FacialLandmarks,
  ): Promise<Buffer> {
    const meta = await sharp(imageBuffer).metadata();
    const origW = meta.width || YUNET_INPUT_SIZE;
    const origH = meta.height || YUNET_INPUT_SIZE;

    const eyeR = landmarks.rightEye;
    const eyeL = landmarks.leftEye;

    const dx = eyeL.x - eyeR.x;
    const dy = eyeL.y - eyeR.y;
    const eyeDist = Math.sqrt(dx * dx + dy * dy);
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    const eyeMidX = (eyeR.x + eyeL.x) / 2;
    const eyeMidY = (eyeR.y + eyeL.y) / 2;

    const cropBoxSize = (112 / ARCFACE_REFERENCE_EYE_DIST) * eyeDist;

    let rotated = sharp(imageBuffer);
    if (Math.abs(angleDeg) > 0.5) {
      rotated = rotated.rotate(-angleDeg, {
        background: { r: 0, g: 0, b: 0 },
      });
    }

    const rotMeta = await rotated.metadata();
    const rotW = rotMeta.width || origW;
    const rotH = rotMeta.height || origH;

    const origCx = origW / 2;
    const origCy = origH / 2;
    const rad = (-angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const relX = eyeMidX - origCx;
    const relY = eyeMidY - origCy;
    const rotRelX = relX * cos - relY * sin;
    const rotRelY = relX * sin + relY * cos;

    const rotMidX = rotRelX + rotW / 2;
    const rotMidY = rotRelY + rotH / 2;

    const cropLeft = Math.round(rotMidX - cropBoxSize * ARCFACE_EYE_X_RATIO);
    const cropTop = Math.round(rotMidY - cropBoxSize * ARCFACE_EYE_Y_RATIO);
    const cropSize = Math.round(cropBoxSize);

    let extractLeft = cropLeft;
    let extractTop = cropTop;
    let extractWidth = cropSize;
    let extractHeight = cropSize;

    let padLeft = 0;
    let padTop = 0;
    let padRight = 0;
    let padBottom = 0;

    if (extractLeft < 0) {
      padLeft = -extractLeft;
      extractLeft = 0;
    }
    if (extractTop < 0) {
      padTop = -extractTop;
      extractTop = 0;
    }
    if (extractLeft + extractWidth > rotW) {
      padRight = extractLeft + extractWidth - rotW;
      extractWidth = rotW - extractLeft;
    }
    if (extractTop + extractHeight > rotH) {
      padBottom = extractTop + extractHeight - rotH;
      extractHeight = rotH - extractTop;
    }

    let pipeline = rotated.extract({
      left: Math.max(0, extractLeft),
      top: Math.max(0, extractTop),
      width: Math.max(1, extractWidth),
      height: Math.max(1, extractHeight),
    });

    if (padLeft > 0 || padTop > 0 || padRight > 0 || padBottom > 0) {
      pipeline = pipeline.extend({
        top: Math.max(0, padTop),
        bottom: Math.max(0, padBottom),
        left: Math.max(0, padLeft),
        right: Math.max(0, padRight),
        background: { r: 0, g: 0, b: 0 },
      });
    }

    return await pipeline
      .resize(112, 112, { fit: 'fill' })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  // Tự động phát hiện khuôn mặt và căn chỉnh chuẩn hóa về kích thước 112x112
  async cropFace(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const face = await this.detectFace(imageBuffer);
      if (!face || !face.landmarks) {
        this.logger.warn(
          'Không phát hiện thấy khuôn mặt rõ nét, sử dụng ảnh gốc làm phương án dự phòng',
        );
        return imageBuffer;
      }

      return await this.alignFace(imageBuffer, face.landmarks);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi căn chỉnh và cắt khuôn mặt: ${message}`);
      return imageBuffer;
    }
  }

  // Kiểm tra trạng thái nạp và sẵn sàng của mô hình YuNet trong bộ nhớ
  isReady(): boolean {
    return this.isModelLoaded && this.session !== null;
  }
}
