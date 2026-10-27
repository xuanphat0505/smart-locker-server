import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

// Kết quả Expo trả về cho từng tin nhắn đã gửi
interface ExpoPushTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

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

// Số tin nhắn tối đa Expo cho phép trong một yêu cầu gửi
const EXPO_MAX_BATCH_SIZE = 100;

// Dịch vụ gửi thông báo đẩy tới thiết bị di động thông qua hạ tầng Expo Push Notification Service
@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // Kiểm tra định dạng chuỗi token có hợp lệ theo chuẩn Expo Push Token hay không
  isExpoPushToken(token: unknown): boolean {
    if (typeof token !== 'string') return false;
    return /^(Expo(nent)?PushToken)\[.*\]$/.test(token.trim());
  }

  // Xóa khỏi người dùng các token mà Expo báo thiết bị không còn đăng ký, vì ticket trả về cùng thứ tự với tin nhắn đã gửi
  private async removeUnregisteredTokens(
    tokens: string[],
    tickets?: ExpoPushTicket[],
  ): Promise<void> {
    if (!Array.isArray(tickets)) return;

    const deadTokens = tokens.filter(
      (_, index) =>
        tickets[index]?.status === 'error' &&
        tickets[index]?.details?.error === 'DeviceNotRegistered',
    );
    if (deadTokens.length === 0) return;

    try {
      await this.userModel
        .updateMany(
          { devicePushToken: { $in: deadTokens } },
          { $unset: { devicePushToken: 1 } },
        )
        .exec();
      this.logger.log(
        `Đã xóa ${deadTokens.length} Expo Push Token không còn hợp lệ (DeviceNotRegistered)`,
      );
    } catch (error) {
      this.logger.error(
        `Không xóa được token push hết hạn: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
      // Expo chỉ nhận tối đa 100 tin nhắn mỗi yêu cầu nên chia lô khi gửi nhiều thiết bị
      let allSucceeded = true;
      for (let i = 0; i < validTokens.length; i += EXPO_MAX_BATCH_SIZE) {
        const messages = validTokens
          .slice(i, i + EXPO_MAX_BATCH_SIZE)
          .map((token) => ({
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
          allSucceeded = false;
          continue;
        }

        const result = (await response.json()) as { data?: ExpoPushTicket[] };
        const batchTokens = messages.map((message) => message.to);
        await this.removeUnregisteredTokens(batchTokens, result.data);
      }

      if (allSucceeded) {
        this.logger.log(
          `Đã phát thông báo đẩy thành công tới ${validTokens.length} thiết bị qua Expo`,
        );
      }
      return allSucceeded;
    } catch (error) {
      this.logger.error(
        `Lỗi ngoại lệ khi gửi thông báo đẩy qua Expo: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
