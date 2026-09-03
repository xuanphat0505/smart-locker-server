import { Injectable, Logger } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly notificationsGateway: NotificationsGateway) {}

  // Điều phối phát thông báo khi có hồ sơ cư dân mới đăng ký
  notifyNewResident(
    buildingId: string,
    resident: {
      id: string;
      name: string;
      phone: string;
      email?: string;
      apartment?: string;
      buildingId: string;
      createdAt: Date;
    },
  ): void {
    try {
      // Kênh WebSocket Socket.IO (Thông báo tức thì tới Web Admin)
      this.notificationsGateway.notifyNewResident(buildingId, resident);

      //  Mở rộng trong tương lai: Expo Push Notification / Telegram Bot
      // TODO: Sẽ thêm sau
    } catch (error) {
      this.logger.error(
        `Lỗi khi điều phối thông báo cư dân mới: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Điều phối phát thông báo kết quả phê duyệt hoặc từ chối hồ sơ cư dân
  notifyResidentApprovalResult(
    buildingId: string,
    residentId: string,
    result: {
      status: 'ACTIVE' | 'REJECTED';
      apartment?: string;
      reason?: string;
    },
  ): void {
    try {
      // Kênh WebSocket Socket.IO
      this.notificationsGateway.notifyResidentApprovalResult(
        buildingId,
        residentId,
        result,
      );

      // Mở rộng trong tương lai: Expo Push Token tới màn hình khóa điện thoại Cư Dân
      // TODO: Sẽ thêm sau
    } catch (error) {
      this.logger.error(
        `Lỗi khi điều phối thông báo kết quả duyệt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Điều phối phát thông báo bưu kiện mới đến cho Cư Dân
  notifyPackageDropOff(
    residentId: string,
    buildingId: string,
    packageInfo: {
      id: string;
      trackingNumber: string;
      boxNumber: number;
      lockerName: string;
      lockerCode: string;
      pinCode: string;
      carrierName: string;
      droppedOffAt: Date;
    },
  ): void {
    try {
      this.notificationsGateway.notifyPackageDropOff(
        residentId,
        buildingId,
        packageInfo,
      );
    } catch (error) {
      this.logger.error(
        `Lỗi khi điều phối thông báo bưu kiện: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
