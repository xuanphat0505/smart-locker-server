import { Injectable, Logger } from '@nestjs/common';

export interface ExpoPushPayload {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
}

// Dịch vụ gửi thông báo đẩy tới thiết bị di động thông qua hạ tầng Expo Push Notification Service
@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  // Kiểm tra định dạng chuỗi token có hợp lệ theo chuẩn Expo Push Token hay không
  isExpoPushToken(token: unknown): boolean {
    if (typeof token !== 'string') return false;
    return /^(Expo(nent)?PushToken)\[.*\]$/.test(token.trim());
  }

  // Gửi thông báo đẩy đến một hoặc nhiều thiết bị di động sử dụng Expo Push API
  async sendPushNotification(payload: ExpoPushPayload): Promise<boolean> {
    const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
    const validTokens = recipients.filter((token) =>
      this.isExpoPushToken(token),
    );

    if (validTokens.length === 0) {
      this.logger.warn('Không có Expo Push Token hợp lệ để gửi thông báo đẩy');
      return false;
    }

    try {
      const messages = validTokens.map((token) => ({
        to: token,
        sound: payload.sound ?? 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        priority: payload.priority ?? 'high',
        channelId: payload.channelId ?? 'default',
        badge: payload.badge,
      }));

      const response = await fetch(this.expoPushUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Lỗi từ máy chủ Expo Push API: ${response.status} - ${errorText}`,
        );
        return false;
      }

      const result = (await response.json()) as {
        data?: Array<{ status: string; message?: string; details?: any }>;
      };

      this.logger.log(
        `Đã phát thông báo đẩy thành công tới ${validTokens.length} thiết bị qua Expo`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi ngoại lệ khi gửi thông báo đẩy qua Expo: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
