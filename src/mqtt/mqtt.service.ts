import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mqtt from 'mqtt';
import { Locker } from '../lockers/schemas/locker.schema';
import { LockerStatus } from '../lockers/enums';
import { NotificationsGateway } from '../notifications/notifications.gateway';

// Cấu trúc dữ liệu bản tin trạng thái phần cứng nhận từ MQTT
interface MqttStatusPayload {
  device?: string;
  boxNumber?: number | string;
  event?: string;
  status?: string;
  doorStatus?: string;
  hasItem?: boolean;
  uptimeSec?: number;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Locker.name)
    private readonly lockerModel: Model<Locker>,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // Khởi tạo kết nối tới MQTT Broker khi module khởi động
  onModuleInit() {
    this.connect();
  }

  // Đóng kết nối an toàn khi ứng dụng dừng hoạt động
  onModuleDestroy() {
    if (this.client) {
      this.logger.log('Đang đóng kết nối MQTT Client...');
      this.client.end(true);
    }
  }

  // Thiết lập kết nối và đăng ký các sự kiện với MQTT Broker
  private connect() {
    const rawBrokerUrl =
      this.configService.get<string>('MQTT_BROKER_URL') ||
      'broker.emqx.io:1883';

    let brokerUrl = rawBrokerUrl.trim();
    if (
      !brokerUrl.startsWith('mqtt://') &&
      !brokerUrl.startsWith('mqtts://') &&
      !brokerUrl.startsWith('ws://') &&
      !brokerUrl.startsWith('wss://')
    ) {
      if (brokerUrl.includes(':8883')) {
        brokerUrl = `mqtts://${brokerUrl}`;
      } else {
        brokerUrl = `mqtt://${brokerUrl}`;
      }
    }

    const clientId =
      this.configService.get<string>('MQTT_CLIENT_ID') ||
      `smart_locker_server_${Math.random().toString(16).substring(2, 8)}`;

    const username = this.configService.get<string>('MQTT_USERNAME');
    const password = this.configService.get<string>('MQTT_PASSWORD');

    const options: mqtt.IClientOptions = {
      clientId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
      rejectUnauthorized: false,
    };

    if (username) options.username = username;
    if (password) options.password = password;

    this.logger.log(
      `Đang kết nối MQTT Broker: ${brokerUrl} (Client ID: ${clientId})`,
    );

    try {
      this.client = mqtt.connect(brokerUrl, options);

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Kết nối MQTT Broker thành công: ${brokerUrl}`);

        // Đăng ký nhận phản hồi trạng thái từ các trạm tủ
        this.client?.subscribe('smartlocker/+/status', (err) => {
          if (err) {
            this.logger.error(
              `Lỗi khi đăng ký topic smartlocker/+/status: ${err.message}`,
            );
          } else {
            this.logger.log('Đã đăng ký lắng nghe topic: smartlocker/+/status');
          }
        });
      });

      this.client.on('message', (topic, payload) => {
        void this.handleIncomingMessage(topic, payload);
      });

      this.client.on('error', (err) => {
        this.logger.error(`Lỗi MQTT Broker: ${err.message}`);
      });

      this.client.on('offline', () => {
        this.isConnected = false;
        this.logger.warn('MQTT Client đã chuyển sang trạng thái offline');
      });

      this.client.on('reconnect', () => {
        this.logger.log('Đang thử kết nối lại MQTT Broker...');
      });
    } catch (error) {
      this.logger.error(
        `Khởi tạo MQTT Client thất bại: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Xử lý và phân tích bản tin MQTT nhận được từ các trạm tủ
  private async handleIncomingMessage(
    topic: string,
    payload: Buffer,
  ): Promise<void> {
    try {
      const messageStr = payload.toString();
      this.logger.log(`[MQTT_IN] [${topic}]: ${messageStr}`);

      // Phân tích và tự động cập nhật trạng thái kết nối phần cứng thời gian thực
      if (topic.startsWith('smartlocker/') && topic.endsWith('/status')) {
        const data = JSON.parse(messageStr) as MqttStatusPayload;
        const topicParts = topic.split('/');
        const fallbackDevice = topicParts.length > 1 ? topicParts[1] : '';
        const rawDevice = data.device || fallbackDevice;
        const lockerCode = rawDevice.trim().toUpperCase();

        if (lockerCode) {
          const rawEvent = data.event || data.status || '';
          const event = rawEvent.toUpperCase();
          const boxNumber =
            typeof data.boxNumber === 'number'
              ? data.boxNumber
              : parseInt(String(data.boxNumber || 0), 10) || 0;
          const rawDoorStatus = data.doorStatus || 'CLOSED';
          const doorStatus = rawDoorStatus.toUpperCase() as 'OPEN' | 'CLOSED';
          const hasItem = Boolean(data.hasItem);

          if (event === 'OFFLINE') {
            await this.lockerModel.updateOne(
              { code: lockerCode },
              { status: LockerStatus.OFFLINE },
            );
            this.logger.warn(
              `Trạm tủ ${lockerCode} vừa ngắt kết nối (OFFLINE)`,
            );
          } else if (
            event === 'ONLINE' ||
            event === 'HEARTBEAT' ||
            event === 'DOOR_CLOSED' ||
            event === 'DOOR_UNLOCKED' ||
            event === 'DOOR_OPENED' ||
            event === 'ITEM_DETECTED' ||
            event === 'ITEM_REMOVED'
          ) {
            await this.lockerModel.updateOne(
              { code: lockerCode },
              {
                status: LockerStatus.ONLINE,
                lastHeartbeatAt: new Date(),
              },
            );
          }

          // Chuyển tiếp trạng thái cảm biến tới phòng Socket của trạm tủ
          this.notificationsGateway.notifyHardwareStatus(lockerCode, {
            boxNumber,
            event,
            doorStatus,
            hasItem,
            timestamp: Date.now(),
          });
        }
      }
    } catch (e) {
      this.logger.warn(
        `Lỗi khi đọc bản tin MQTT từ ${topic}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Phát bản tin mở khóa Solenoid ngăn tủ tới phần cứng ESP32
  async publishDoorUnlock(
    lockerCode: string,
    boxNumber: number,
    durationMs = 5000,
  ): Promise<boolean> {
    const formattedCode = lockerCode.trim().toUpperCase();
    const topic = `smartlocker/${formattedCode}/control`;

    const payload = JSON.stringify({
      command: 'UNLOCK',
      lockerCode: formattedCode,
      boxNumber,
      durationMs,
      timestamp: Date.now(),
    });

    if (!this.client || !this.isConnected) {
      this.logger.warn(
        `MQTT chưa kết nối hoặc đang offline. Đang xếp hàng gửi lệnh UNLOCK cho Ngăn #${boxNumber} trạm ${formattedCode}`,
      );
    }

    return new Promise((resolve) => {
      if (!this.client) {
        return resolve(false);
      }

      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(
            `Lỗi khi phát lệnh UNLOCK tới ${topic}: ${err.message}`,
          );
          resolve(false);
        } else {
          this.logger.log(
            `[MQTT_OUT] [${topic}] Đã phát lệnh UNLOCK Ngăn #${boxNumber} (Thời gian mở: ${durationMs}ms)`,
          );
          resolve(true);
        }
      });
    });
  }

  // Kiểm tra trạng thái kết nối của MQTT Client
  isBrokerConnected(): boolean {
    return this.isConnected;
  }
}
