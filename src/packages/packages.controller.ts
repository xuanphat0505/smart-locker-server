import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import {
  DropOffPackageDto,
  PickupOtpDto,
  PickupQrDto,
  SendShipperOtpDto,
  VerifyShipperOtpDto,
  VerifyFirebaseTokenDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiDropOffPackageDoc,
  ApiGetMyPackagesDoc,
  ApiGetPackageByIdDoc,
  ApiGetQrTokenDoc,
  ApiPickupOtpDoc,
  ApiPickupQrDoc,
  ApiSendShipperOtpDoc,
  ApiVerifyShipperOtpDoc,
  ApiVerifyFirebaseTokenDoc,
} from './swagger/package.swagger';

@ApiTags('Packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

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

  // Nhập mã OTP 6 số tại màn hình trạm tủ để mở khóa lấy bưu kiện
  @Post('pickup/otp')
  @ApiPickupOtpDoc()
  async pickupWithOtp(@Body() dto: PickupOtpDto) {
    return this.packagesService.pickupWithOtp(dto);
  }

  // Quét mã QR token trước camera trạm tủ để mở khóa lấy bưu kiện
  @Post('pickup/qr')
  @ApiPickupQrDoc()
  async pickupWithQr(@Body() dto: PickupQrDto) {
    return this.packagesService.pickupWithQr(dto);
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
  @Roles(Role.RESIDENT, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiGetPackageByIdDoc()
  async getPackageById(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.packagesService.getPackageById(id, req.user.userId);
  }
}
