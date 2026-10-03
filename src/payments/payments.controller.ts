import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentIntentDto,
  CreateSubscriptionIntentDto,
  SandboxConfirmPaymentDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiCheckFeeDoc,
  ApiCreatePaymentIntentDoc,
  ApiCreateSubscriptionIntentDoc,
  ApiSandboxConfirmPaymentDoc,
  ApiGetMyPaymentsDoc,
  ApiGetPaymentByOrderCodeDoc,
  ApiKioskPickupDoc,
} from './swagger';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  // Khởi tạo PaymentsController với dịch vụ PaymentsService
  constructor(private readonly paymentsService: PaymentsService) {}

  // Kiểm tra phí quá hạn và các mốc thời gian gia hạn của bưu kiện
  @Get('package/:packageId/fee')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiCheckFeeDoc()
  async checkFee(@Param('packageId') packageId: string) {
    return this.paymentsService.checkFee(packageId);
  }

  // Khởi tạo phiên giao dịch thanh toán VietQR nộp phí quá hạn hoặc gia hạn lưu kho
  @Post('create-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiCreatePaymentIntentDoc()
  async createPaymentIntent(
    @Body() dto: CreatePaymentIntentDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.paymentsService.createPaymentIntent(dto, req.user.userId);
  }

  // Khởi tạo phiên giao dịch thanh toán VietQR đăng ký hoặc gia hạn gói tháng VIP 30k
  @Post('subscription/create-intent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiCreateSubscriptionIntentDoc()
  async createSubscriptionIntent(
    @Body() dto: CreateSubscriptionIntentDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.paymentsService.createSubscriptionIntent(dto, req.user.userId);
  }

  // Xác nhận thanh toán thành công trong môi trường kiểm thử Sandbox - chỉ xử lý nghiệp vụ tài chính
  @Post('sandbox-confirm')
  @ApiSandboxConfirmPaymentDoc()
  async sandboxConfirm(@Body() dto: SandboxConfirmPaymentDto) {
    return this.paymentsService.confirmPayment(dto.orderCode, true);
  }

  // ESP32 gọi sau khi polling xác nhận thanh toán thành công - kích hoạt mở chốt điện và hoàn tất nhận hàng
  @Post('kiosk-pickup')
  @ApiKioskPickupDoc()
  async kioskPickup(@Body() dto: SandboxConfirmPaymentDto) {
    return this.paymentsService.completeKioskPickup(dto.orderCode);
  }

  // Lấy danh sách lịch sử các giao dịch thanh toán của cư dân đang đăng nhập
  @Get('my-payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RESIDENT)
  @ApiBearerAuth('JWT-auth')
  @ApiGetMyPaymentsDoc()
  async getMyPayments(@Request() req: { user: AuthenticatedUser }) {
    return this.paymentsService.getMyPayments(req.user.userId);
  }

  // Tra cứu chi tiết trạng thái giao dịch thanh toán theo mã orderCode duy nhất
  @Get('order/:orderCode')
  @ApiGetPaymentByOrderCodeDoc()
  async getPaymentByOrderCode(
    @Param('orderCode', ParseIntPipe) orderCode: number,
  ) {
    return this.paymentsService.getPaymentByOrderCode(orderCode);
  }
}
