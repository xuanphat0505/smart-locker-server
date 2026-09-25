import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AntiSpoofingService } from './services/anti-spoofing.service';
import { FaceRecognitionService } from './services/face-recognition.service';
import { FaceVerificationService } from './services/face-verification.service';
import { FaceDetectorService } from './services/face-detector.service';
import { CheckLivenessDto } from './dto/check-liveness.dto';
import { CheckFaceMatchDto } from './dto/check-match.dto';
import {
  ApiCheckLivenessDoc,
  ApiGetAiStatusDoc,
  ApiVerifyMatchDoc,
} from './swagger/ai.swagger';

@ApiTags('AI - Anti-Spoofing & Verification')
@Controller('ai')
export class AiController {
  constructor(
    private readonly antiSpoofingService: AntiSpoofingService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly faceVerificationService: FaceVerificationService,
    private readonly faceDetectorService: FaceDetectorService,
  ) {}

  // Kiểm tra độ chân thực khuôn mặt từ file ảnh tải lên hoặc chuỗi Base64
  @Post('check-liveness')
  @ApiCheckLivenessDoc()
  @UseInterceptors(FileInterceptor('file'))
  async checkLiveness(
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: CheckLivenessDto,
  ) {
    const imageBuffer = this.antiSpoofingService.extractImageBuffer(
      file,
      body?.imageBase64,
    );
    const result = await this.antiSpoofingService.checkLiveness(imageBuffer, {
      threshold: body?.threshold,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Kiểm tra tính chân thực khuôn mặt thành công',
      data: result,
    };
  }

  // Lấy thông tin trạng thái hoạt động và tham số cấu hình của các mô hình AI trong bộ nhớ RAM
  @Get('status')
  @ApiGetAiStatusDoc()
  getStatus() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin trạng thái mô hình AI thành công',
      data: {
        antiSpoofing: this.antiSpoofingService.getModelStatus(),
        faceDetector: {
          isReady: this.faceDetectorService.isReady(),
          modelArchitecture: 'UltraFace RFB-320',
          inputSize: '320x240',
        },
        faceRecognition: {
          isReady: this.faceRecognitionService.isReady(),
          modelArchitecture: 'MobileFaceNet ArcFace',
          embeddingDimension: 512,
          threshold: 0.48,
        },
      },
    };
  }

  // Kiểm tra so khớp khuôn mặt với các đơn hàng tại trạm tủ phục vụ thử nghiệm có tích hợp tự động phát hiện và crop khuôn mặt
  @Post('verify-match')
  @ApiVerifyMatchDoc()
  @UseInterceptors(FileInterceptor('file'))
  async verifyMatch(
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: CheckFaceMatchDto,
    @Query('lockerCode') queryLockerCode?: string,
    @Query('includeCroppedFace') queryIncludeCroppedFace?: string,
    @Headers('x-locker-code') headerLockerCode?: string,
  ) {
    const lockerCode = body?.lockerCode || queryLockerCode || headerLockerCode;

    if (!lockerCode) {
      throw new BadRequestException(
        'Vui lòng cung cấp mã trạm tủ lockerCode (qua form-data, query param hoặc header x-locker-code)',
      );
    }

    const imageBuffer = this.antiSpoofingService.extractImageBuffer(
      file,
      body?.imageBase64,
    );

    const includeCroppedFace =
      body?.includeCroppedFace === true ||
      body?.includeCroppedFace === ('true' as unknown) ||
      queryIncludeCroppedFace === 'true';

    const result = await this.faceVerificationService.checkMatchOnly(
      lockerCode,
      imageBuffer,
      { includeCroppedFace },
    );

    return {
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }
}
