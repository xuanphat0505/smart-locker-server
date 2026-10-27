import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { PackagesAdminService } from './packages-admin.service';
import {
  DropOffPackageDto,
  PickupOtpDto,
  PickupQrDto,
  PickupFaceDto,
  SendShipperOtpDto,
  VerifyShipperOtpDto,
  VerifyFirebaseTokenDto,
} from './dto';
import {
  QueryAdminPackagesDto,
  ReturnPackageDto,
} from './dto/admin-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Throttle } from '@nestjs/throttler';
import { PickupAuthGuard } from '../auth/guards/pickup-auth.guard';
import { PickupThrottlerGuard } from '../auth/guards/pickup-throttler.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiDropOffPackageDoc,
  ApiGetMyPackagesDoc,
  ApiGetPackageByIdDoc,
  ApiGetQrTokenDoc,
  ApiGetDepositStatusDoc,
  ApiPickupOtpDoc,
  ApiPickupQrDoc,
  ApiPickupFaceDoc,
  ApiSendShipperOtpDoc,
  ApiVerifyShipperOtpDoc,
  ApiVerifyFirebaseTokenDoc,
  ApiListAdminPackagesDoc,
  ApiReturnPackageDoc,
  ApiResendOtpDoc,
} from './swagger/package.swagger';

// Giới hạn lấy hàng từ ứng dụng: 5 lần mỗi phút và 30 lần mỗi giờ để chặn dò mã OTP
const PICKUP_THROTTLE = {
  default: { ttl: 60_000, limit: 5 },
  hourly: { ttl: 3_600_000, limit: 30 },
};

@ApiTags('Packages')
@Controller('packages')
export class PackagesController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly packagesAdminService: PackagesAdminService,
  ) {}

  // Gửi mã xác thực OTP 6 số tới số điện thoại của tài xế giao hàng
  @Post('shipper/send-otp')
  @ApiSendShipperOtpDoc()
  async sendShipperOtp(@Body() dto: SendShipperOtpDto) {
    return this.packagesService.sendShipperOtp(dto);
  }

  // Xác minh mã OTP 6 số và cấp token phiên giao hàng tin cậy cho tài xế
  @Post('shipper/verify-otp')
  @ApiVerifyShipperOtpDoc()
  async verifyShipperOtp(@Body() dto: VerifyShipperOtpDto) {
    return this.packagesService.verifyShipperOtp(dto);
  }

  // Xác minh idToken từ Google Firebase và cấp token phiên giao hàng tin cậy cho tài xế
  @Post('shipper/verify-firebase-token')
  @ApiVerifyFirebaseTokenDoc()
  async verifyFirebaseToken(@Body() dto: VerifyFirebaseTokenDto) {
    return this.packagesService.verifyFirebaseToken(dto);
  }

  // Tài xế gửi kiện hàng vào ngăn tủ không cần tài khoản
  @Post('drop-off')
  @ApiDropOffPackageDoc()
  async dropOff(@Body() dto: DropOffPackageDto) {
    return this.packagesService.dropOff(dto);
  }

  // Nhập mã OTP 6 số tại màn hình trạm tủ hoặc ứng dụng di động để mở khóa lấy bưu kiện
  @Post('pickup/otp')
  @UseGuards(PickupAuthGuard, PickupThrottlerGuard)
  @Throttle(PICKUP_THROTTLE)
  @ApiPickupOtpDoc()
  async pickupWithOtp(
    @Body() dto: PickupOtpDto,
    @Request() req: { authSource: string; user?: { sub?: string } },
  ) {
    return this.packagesService.pickupWithOtp(dto, req?.authSource, req?.user?.sub);
  }

  // Quét mã QR token trước camera trạm tủ hoặc ứng dụng di động để mở khóa lấy bưu kiện
  @Post('pickup/qr')
  @UseGuards(PickupAuthGuard, PickupThrottlerGuard)
  @Throttle(PICKUP_THROTTLE)
  @ApiPickupQrDoc()
  async pickupWithQr(
    @Body() dto: PickupQrDto,
    @Request() req: { authSource: string; user?: { sub?: string } },
  ) {
    return this.packagesService.pickupWithQr(dto, req?.authSource, req?.user?.sub);
  }

  // Nhận diện khuôn mặt cư dân trước camera trạm tủ để mở khóa lấy bưu kiện
  @Post('pickup/face')
  @UseGuards(PickupAuthGuard, PickupThrottlerGuard)
  @Throttle(PICKUP_THROTTLE)
  @ApiPickupFaceDoc()
  @UseInterceptors(FileInterceptor('file'))
  async pickupWithFace(
    @Request() req: { authSource: string },
    @UploadedFile() file?: Express.Multer.File,
    @Body() dto?: PickupFaceDto,
    @Headers('x-locker-code') lockerCodeHeader?: string,
  ) {
    // Ảnh khuôn mặt chỉ được nhận từ camera của trạm tủ, không nhận từ ứng dụng di động
    if (req?.authSource !== 'DEVICE') {
      throw new ForbiddenException(
        'Nhận diện khuôn mặt chỉ khả dụng trực tiếp tại trạm tủ',
      );
    }

    const finalDto: PickupFaceDto = {
      ...(dto || { lockerCode: '' }),
      lockerCode: dto?.lockerCode || lockerCodeHeader || '',
    };
    return this.packagesService.pickupWithFace(finalDto, file);
  }

  // Quản trị viên xem danh sách bưu kiện theo phạm vi tòa nhà (không chứa OTP và mã QR)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiListAdminPackagesDoc()
  async findAllForAdmin(
    @Query() query: QueryAdminPackagesDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.packagesAdminService.findAll(req.user, query);
  }

  // Cư dân xem danh sách toàn bộ các bưu kiện của chính mình
  @Get('my-packages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RESIDENT)
  @ApiBearerAuth('JWT-auth')
  @ApiGetMyPackagesDoc()
  async getMyPackages(@Request() req: { user: AuthenticatedUser }) {
    return this.packagesService.getMyPackages(req.user.userId);
  }

  // Tài xế tra cứu kết quả lượt gửi hàng bằng mã xác nhận nhận được lúc mở tủ, không cần tài khoản
  @Get(':id/deposit-status')
  @ApiGetDepositStatusDoc()
  async getDepositStatus(
    @Param('id') id: string,
    @Headers('x-deposit-token') depositToken?: string,
  ) {
    return this.packagesService.getDepositStatus(id, depositToken);
  }

  // Lấy mã QR Token động phục vụ hiển thị mã QR trên app cho cư dân quét
  @Get(':id/qr-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RESIDENT)
  @ApiBearerAuth('JWT-auth')
  @ApiGetQrTokenDoc()
  async getQrToken(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.packagesService.getQrToken(id, req.user.userId);
  }

  // Xem thông tin chi tiết một bưu kiện cụ thể
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RESIDENT, Role.BUILDING_ADMIN, Role.SYSTEM_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiGetPackageByIdDoc()
  async getPackageById(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    // Cư dân chỉ xem đơn của mình; quản trị viên xem theo phạm vi tòa nhà và không nhận OTP
    if (req.user.role === Role.RESIDENT) {
      return this.packagesService.getPackageById(id, req.user.userId);
    }
    return this.packagesAdminService.findOne(id, req.user);
  }

  // Quản trị viên thu hồi bưu kiện quá hạn về kho Ban Quản Lý và mở cửa ngăn tủ
  @Post(':id/return')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiReturnPackageDoc()
  async returnPackage(
    @Param('id') id: string,
    @Body() dto: ReturnPackageDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.packagesAdminService.returnToStorage(id, req.user, dto);
  }

  // Quản trị viên cấp lại mã OTP cho bưu kiện, mã mới chỉ được gửi cho cư dân
  @Post(':id/resend-otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiResendOtpDoc()
  async resendOtp(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.packagesAdminService.resendOtp(id, req.user);
  }
}
