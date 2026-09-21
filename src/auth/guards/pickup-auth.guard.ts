import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Locker } from '../../lockers/schemas/locker.schema';

@Injectable()
export class PickupAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
  ) {}

  // Xác thực nguồn gọi mở tủ: bắt buộc x-api-key hợp lệ đối với thiết bị Kiosk hoặc Bearer Token đối với ứng dụng di động
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey =
      request.headers['x-api-key'] || request.headers['x-device-key'];
    const authHeader = request.headers['authorization'];

    if (apiKey) {
      const lockerCode = request.body?.lockerCode;
      if (!lockerCode) {
        throw new BadRequestException(
          'Yêu cầu từ thiết bị cần có mã trạm tủ lockerCode',
        );
      }

      const locker = await this.lockerModel
        .findOne({ code: String(lockerCode).trim().toUpperCase() })
        .select('+apiKey');

      if (!locker || locker.apiKey !== apiKey) {
        throw new UnauthorizedException(
          'Mã API Key của thiết bị không chính xác hoặc trạm tủ không tồn tại',
        );
      }

      request.authSource = 'DEVICE';
      request.locker = locker;
      return true;
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = await this.jwtService.verifyAsync(token);
        request.user = decoded;
        request.authSource = 'MOBILE';
        return true;
      } catch {
        throw new UnauthorizedException(
          'Bearer Token không hợp lệ hoặc đã hết hạn',
        );
      }
    }

    throw new UnauthorizedException(
      'Yêu cầu không được phép. Vui lòng cung cấp x-api-key cho thiết bị hoặc Bearer Token cho ứng dụng di động',
    );
  }
}
