import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage } from '../common/utils/text.util';

const DEFAULT_TIMEOUT_MS = 8000;

// Dịch vụ gửi SMS: gửi qua điện thoại Android chạy ứng dụng SMS Gateway hoặc chỉ ghi log khi phát triển
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: 'android-gateway' | 'console';
  private readonly gatewayUrl: string;
  private readonly gatewayAuth: string;
  private readonly timeoutMs: number;

  // Bật chế độ thử nghiệm: cho phép trả mã OTP về cho client và ghi log mã
  readonly devMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.gatewayUrl = this.configService.get<string>('SMS_GATEWAY_URL') || '';
    const username = this.configService.get<string>('SMS_GATEWAY_USERNAME') || '';
    const password = this.configService.get<string>('SMS_GATEWAY_PASSWORD') || '';
    this.gatewayAuth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    this.timeoutMs = Number(this.configService.get<string>('SMS_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
    this.devMode = this.configService.get<string>('SMS_DEV_MODE') === 'true';

    const requested = this.configService.get<string>('SMS_PROVIDER') || 'console';
    const isGatewayConfigured = Boolean(this.gatewayUrl && username && password);

    if (requested === 'android-gateway' && !isGatewayConfigured) {
      this.logger.warn(
        'Thiếu SMS_GATEWAY_URL/USERNAME/PASSWORD trong .env, chuyển sang chế độ ghi log (console)',
      );
    }
    this.provider =
      requested === 'android-gateway' && isGatewayConfigured ? 'android-gateway' : 'console';

    this.logger.log(`Dịch vụ SMS đang dùng provider: ${this.provider}`);
  }

  // Gửi một tin nhắn tới số điện thoại đã ở dạng quốc tế; ném lỗi 502 nếu cổng gửi không phản hồi hoặc từ chối
  async send(phoneE164: string, text: string): Promise<void> {
    if (this.provider === 'console') {
      this.logger.log(`[SMS_CONSOLE] Tới ${phoneE164}: ${text}`);
      return;
    }

    let response: Response;
    try {
      response = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.gatewayAuth,
        },
        body: JSON.stringify({
          textMessage: { text },
          phoneNumbers: [phoneE164],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.error(`Không kết nối được cổng SMS: ${getErrorMessage(error)}`);
      throw new BadGatewayException('Không gửi được tin nhắn SMS lúc này, vui lòng thử lại sau');
    }

    if (!response.ok) {
      this.logger.error(`Cổng SMS từ chối yêu cầu: HTTP ${response.status}`);
      throw new BadGatewayException('Không gửi được tin nhắn SMS lúc này, vui lòng thử lại sau');
    }
  }
}
