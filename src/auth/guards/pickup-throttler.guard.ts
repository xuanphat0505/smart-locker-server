import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { isKioskRequest } from './pickup-auth.guard';

// Giới hạn tần suất lấy hàng: tính theo tài khoản đối với ứng dụng di động, bỏ qua thiết bị Kiosk dùng chung một địa chỉ IP
@Injectable()
export class PickupThrottlerGuard extends ThrottlerGuard {
  // Chỉ áp dụng giới hạn cho yêu cầu từ ứng dụng di động, Kiosk đã được xác thực bằng API key của trạm tủ
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ authSource?: string }>();
    return isKioskRequest(request.authSource);
  }

  // Đếm theo mã người dùng trong JWT để đổi mạng hoặc đổi IP vẫn không thoát được giới hạn
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.sub ? `user-${req.user.sub}` : req.ip;
  }
}
