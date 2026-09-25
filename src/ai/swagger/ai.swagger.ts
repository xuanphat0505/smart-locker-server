import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

// Tai lieu Swagger cho endpoint kiem tra tinh chan thuc khuon mat va chong gia mao
export function ApiCheckLivenessDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Kiem tra chong gia mao khuon mat (Anti-Spoofing)',
      description:
        'Nhan vao file anh (multipart/form-data) hoac chuoi Base64 va tra ve ket qua danh gia Real/Spoof cung xac suat',
    }),
    ApiConsumes('multipart/form-data', 'application/json'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'File anh chan dung can kiem tra (JPG, PNG, WebP)',
          },
          imageBase64: {
            type: 'string',
            description:
              'Chuoi Base64 cua anh (tuy chon neu khong gui file truc tiep)',
          },
          threshold: {
            type: 'number',
            default: 0.75,
            description:
              'Nguong xac suat phan loai nguoi that (gia tri tu 0.0 den 1.0)',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Kiem tra tinh chan thuc khuon mat thanh cong',
      schema: {
        example: {
          statusCode: 200,
          message: 'Kiem tra tinh chan thuc khuon mat thanh cong',
          data: {
            isReal: true,
            livenessScore: 0.9559,
            spoofScore: 0.0441,
            inferenceTimeMs: 16,
            verdict: 'REAL',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Du lieu dau vao khong hop le hoac thieu file anh',
    }),
  );
}

// Tai lieu Swagger cho endpoint tra cuu trang thai va thong so mo hinh AI
export function ApiGetAiStatusDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Kiem tra trang thai mo hinh Anti-Spoofing',
      description:
        'Tra ve thong tin san sang cua mo hinh ONNX trong bo nho RAM, kien truc mang va kich thuoc dau vao',
    }),
    ApiResponse({
      status: 200,
      description: 'Lay thong tin trang thai mo hinh AI thanh cong',
      schema: {
        example: {
          statusCode: 200,
          message: 'Lay thong tin trang thai mo hinh AI thanh cong',
          data: {
            isReady: true,
            modelArchitecture: 'EfficientNet-B0',
            inputSize: 224,
            defaultThreshold: 0.75,
          },
        },
      },
    }),
  );
}

// Tai lieu Swagger cho endpoint dang ky Face ID cua cu dan
export function ApiEnrollFaceDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Dang ky / Cap nhat nhan dien Face ID cua cu dan',
      description:
        'Kiem tra liveness, trich xuat vector 512 chieu luu vao user.faceAuth va dong bo anh len Cloudinary',
    }),
    ApiConsumes('multipart/form-data', 'application/json'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'File ảnh chân dung selfie (JPG, PNG, WebP)',
          },
          imageBase64: {
            type: 'string',
            description: 'Chuỗi Base64 ảnh selfie đơn lẻ nếu không upload file',
          },
          imagesBase64: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Mảng 3 chuỗi Base64 các góc mặt (chính diện, nghiêng trái, nghiêng phải)',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Dang ky Face ID thanh cong',
      schema: {
        example: {
          statusCode: 200,
          message: 'Dang ky nhan dien Face ID thanh cong',
          data: {
            success: true,
            livenessScore: 0.952,
            avatarUrl: 'https://res.cloudinary.com/.../avatar.jpg',
            enrolledAt: '2026-09-24T12:00:00.000Z',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Khuon mat gia mao hoac anh khong hop le',
    }),
  );
}

// Tai lieu Swagger cho endpoint xac thuc khuon mat mo tu tai Kiosk tram tu
export function ApiVerifyFaceHardwareDoc() {
  return applyDecorators(
    ApiOperation({
      summary: 'Xac thuc khuon mat va mo tu tai Kiosk (ESP32-CAM)',
      description:
        'Nhan ma tram tu va anh chup tu camera Kiosk, kiem tra liveness va so khop 1:N cuc bo voi cac buu kien dang cho nhan de mo tu qua MQTT',
    }),
    ApiConsumes('multipart/form-data', 'application/json'),
    ApiBody({
      schema: {
        type: 'object',
        required: ['lockerCode'],
        properties: {
          lockerCode: {
            type: 'string',
            example: 'LK-01',
            description: 'Ma tram tu thong minh',
          },
          file: {
            type: 'string',
            format: 'binary',
            description: 'File anh chup tu camera ESP32-CAM',
          },
          imageBase64: {
            type: 'string',
            description: 'Chuoi Base64 anh camera neu khong upload file',
          },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Xac thuc thanh cong, da phat lenh mo khoa ngan tu',
      schema: {
        example: {
          statusCode: 200,
          message: 'Xac thuc khuon mat thanh cong, cua tu da mo',
          data: {
            success: true,
            boxNumber: 3,
            residentName: 'Nguyen Van A',
            residentPhone: '0987654321',
            apartment: 'P1204 - Toa S1',
            trackingNumber: 'SPX123456789',
            matchScore: 0.895,
            livenessScore: 0.952,
            inferenceTimeMs: 42,
          },
        },
      },
    }),
    ApiResponse({
      status: 403,
      description: 'Phat hien gia mao khuon mat (SPOOF_DETECTED)',
    }),
    ApiResponse({
      status: 401,
      description: 'Khuon mat khong khop voi bat ky cu dan nao co don tai tu',
    }),
    ApiResponse({
      status: 404,
      description: 'Tram tu khong ton tai hoac khong co buu kien cho lay',
    }),
  );
}
