import {
  Controller,
  Post,
  Get,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AntiSpoofingService } from './services/anti-spoofing.service';
import { CheckLivenessDto } from './dto/check-liveness.dto';
import { ApiCheckLivenessDoc, ApiGetAiStatusDoc } from './swagger/ai.swagger';

@ApiTags('AI - Anti-Spoofing')
@Controller('ai')
export class AiController {
  constructor(private readonly antiSpoofingService: AntiSpoofingService) {}

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

  // Lấy thông tin trạng thái hoạt động và tham số cấu hình của mô hình AI
  @Get('status')
  @ApiGetAiStatusDoc()
  getStatus() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin trạng thái mô hình AI thành công',
      data: this.antiSpoofingService.getModelStatus(),
    };
  }
}
