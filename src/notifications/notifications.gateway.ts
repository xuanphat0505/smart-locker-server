import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Xử lý khi có client (Web Admin hoặc Mobile) kết nối tới kênh thông báo
  handleConnection(client: Socket): void {
    this.logger.log(`Client kết nối Socket: ${client.id}`);
  }

  // Xử lý khi client ngắt kết nối
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ngắt kết nối Socket: ${client.id}`);
  }

  // Cho phép Web Admin đăng ký nhận thông báo theo Tòa Nhà cụ thể
  @SubscribeMessage('join_building')
  async handleJoinBuilding(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { buildingId: string },
  ): Promise<void> {
    if (payload?.buildingId) {
      const roomName = `building_${payload.buildingId}`;
      await client.join(roomName);
      this.logger.log(`Client ${client.id} đã tham gia phòng: ${roomName}`);
      client.emit('joined_building', {
        room: roomName,
        message: 'Tham gia phòng nhận thông báo tòa nhà thành công',
      });
    }
  }

  // Cho phép Admin rời khỏi phòng của tòa nhà
  @SubscribeMessage('leave_building')
  async handleLeaveBuilding(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { buildingId: string },
  ): Promise<void> {
    if (payload?.buildingId) {
      const roomName = `building_${payload.buildingId}`;
      await client.leave(roomName);
      this.logger.log(`Client ${client.id} đã rời khỏi phòng: ${roomName}`);
    }
  }

  // Cho phép Cư dân join phòng cá nhân để nhận kết quả phê duyệt ngay trên app
  @SubscribeMessage('join_resident')
  async handleJoinResident(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { residentId: string },
  ): Promise<void> {
    if (payload?.residentId) {
      const roomName = `resident_${payload.residentId}`;
      await client.join(roomName);
      this.logger.log(`Cư dân ${client.id} đã tham gia phòng: ${roomName}`);
    }
  }

  // Phát thông báo hồ sơ cư dân mới cho Ban Quản Lý tòa nhà
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
    const roomName = `building_${buildingId}`;
    this.logger.log(
      `Phát sự kiện NEW_PENDING_RESIDENT tới phòng: ${roomName} cho cư dân ${resident.name}`,
    );

    const eventPayload = {
      type: 'NEW_PENDING_RESIDENT',
      title: 'Hồ sơ cư dân mới chờ duyệt',
      message: `Cư dân ${resident.name} (Căn hộ: ${resident.apartment}) vừa hoàn tất đăng ký`,
      resident,
      timestamp: new Date().toISOString(),
    };

    // Bắn thông báo vào phòng riêng của các building_admin của tòa nhà
    this.server.to(roomName).emit('NEW_PENDING_RESIDENT', eventPayload);
  }

  // Phát thông báo kết quả phê duyệt hoặc từ chối hồ sơ cư dân
  notifyResidentApprovalResult(
    buildingId: string,
    residentId: string,
    result: {
      status: 'ACTIVE' | 'REJECTED';
      apartment?: string;
      reason?: string;
    },
  ): void {
    const buildingRoom = `building_${buildingId}`;
    const residentRoom = `resident_${residentId}`;

    const eventPayload = {
      type: 'RESIDENT_APPROVAL_RESULT',
      residentId,
      status: result.status,
      apartment: result.apartment,
      reason: result.reason,
      timestamp: new Date().toISOString(),
    };

    this.server.to(buildingRoom).emit('RESIDENT_APPROVAL_RESULT', eventPayload);
    this.server.to(residentRoom).emit('RESIDENT_APPROVAL_RESULT', eventPayload);
  }

  // Phát thông báo bưu kiện mới đã đến ngăn tủ cho Cư Dân
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
    const residentRoom = `resident_${residentId}`;
    const buildingRoom = `building_${buildingId}`;

    const eventPayload = {
      type: 'PACKAGE_NEW',
      title: `Bưu kiện mới tại Ngăn #${packageInfo.boxNumber}!`,
      message: `Đơn hàng ${packageInfo.trackingNumber} từ ${packageInfo.carrierName} đã được đặt tại Ngăn #${packageInfo.boxNumber} (${packageInfo.lockerName}). Mã OTP nhận hàng: ${packageInfo.pinCode}`,
      package: packageInfo,
      timestamp: new Date().toISOString(),
    };

    this.server.to(residentRoom).emit('PACKAGE_NEW', eventPayload);
    this.server.to(buildingRoom).emit('PACKAGE_NEW', eventPayload);
  }
}
