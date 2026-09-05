import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsGateway } from './notifications.gateway';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../auth/enums/role.enum';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from './enums/notification.enums';
import { QueryNotificationDto, BroadcastNotificationDto } from './dto';

// Dịch vụ quản lý thông báo, lưu trữ lịch sử vào database và phát sóng qua WebSocket
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // Lưu một bản ghi thông báo mới vào cơ sở dữ liệu
  async createNotification(payload: {
    recipientId: Types.ObjectId | string;
    buildingId?: Types.ObjectId | string;
    title: string;
    message: string;
    category: NotificationCategory;
    type: NotificationType;
    priority?: NotificationPriority;
    actionUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<NotificationDocument> {
    const doc = new this.notificationModel({
      ...payload,
      recipientId: new Types.ObjectId(payload.recipientId),
      buildingId: payload.buildingId
        ? new Types.ObjectId(payload.buildingId)
        : undefined,
      priority: payload.priority || NotificationPriority.NORMAL,
      isRead: false,
      readAt: null,
    });
    return doc.save();
  }

  // Lấy danh sách thông báo của người dùng kèm phân trang và các bộ lọc
  async getMyNotifications(userId: string, query: QueryNotificationDto) {
    const { page = 1, limit = 20, category, priority, isRead } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      recipientId: new Types.ObjectId(userId),
    };

    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (isRead !== undefined) filter.isRead = isRead;

    const [data, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
      this.notificationModel
        .countDocuments({
          recipientId: new Types.ObjectId(userId),
          isRead: false,
        })
        .exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      unreadCount,
    };
  }

  // Đếm nhanh số lượng thông báo chưa đọc của người dùng
  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const count = await this.notificationModel.countDocuments({
      recipientId: new Types.ObjectId(userId),
      isRead: false,
    });
    return { unreadCount: count };
  }

  // Đánh dấu một thông báo cụ thể là đã đọc
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationDocument> {
    const notification = await this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        recipientId: new Types.ObjectId(userId),
      },
      {
        $set: { isRead: true, readAt: new Date() },
      },
      { new: true },
    );

    if (!notification) {
      throw new NotFoundException(
        'Không tìm thấy thông báo hoặc bạn không có quyền truy cập',
      );
    }

    return notification;
  }

  // Đánh dấu tất cả thông báo của người dùng là đã đọc
  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const result = await this.notificationModel.updateMany(
      {
        recipientId: new Types.ObjectId(userId),
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  // Xóa một thông báo khỏi hộp thư cá nhân
  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<{ message: string }> {
    const result = await this.notificationModel.findOneAndDelete({
      _id: new Types.ObjectId(notificationId),
      recipientId: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException(
        'Không tìm thấy thông báo hoặc bạn không có quyền xóa',
      );
    }

    return { message: 'Đã xóa thông báo thành công' };
  }

  // Ban Quản Lý phát sóng thông báo toàn bộ cư dân trong tòa nhà
  async broadcastToBuilding(adminId: string, dto: BroadcastNotificationDto) {
    const residents = await this.userModel
      .find({
        buildingId: new Types.ObjectId(dto.buildingId),
        role: Role.RESIDENT,
      })
      .select('_id')
      .lean()
      .exec();

    if (residents.length === 0) {
      return {
        message: 'Tòa nhà chưa có cư dân nào để gửi thông báo',
        sentCount: 0,
      };
    }

    const notifications = residents.map((res) => ({
      recipientId: res._id,
      buildingId: new Types.ObjectId(dto.buildingId),
      title: dto.title,
      message: dto.message,
      category: dto.category || NotificationCategory.SYSTEM,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      priority: dto.priority || NotificationPriority.NORMAL,
      actionUrl: dto.actionUrl || null,
      metadata: {
        senderId: new Types.ObjectId(adminId),
      },
      isRead: false,
      readAt: null,
    }));

    await this.notificationModel.insertMany(notifications, { ordered: false });

    // Phát sự kiện realtime qua Socket.IO tới phòng của tòa nhà
    this.notificationsGateway.broadcastToBuilding(dto.buildingId, {
      title: dto.title,
      message: dto.message,
      category: dto.category,
      priority: dto.priority,
      actionUrl: dto.actionUrl,
      timestamp: new Date().toISOString(),
    });

    return {
      message: `Đã gửi thông báo thành công tới ${residents.length} cư dân trong tòa nhà`,
      sentCount: residents.length,
    };
  }

  // Điều phối phát thông báo khi có hồ sơ cư dân mới đăng ký
  async notifyNewResident(
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
  ): Promise<void> {
    try {
      // Tìm các quản trị viên của tòa nhà để lưu thông báo vào database
      const buildingAdmins = await this.userModel
        .find({
          $or: [
            {
              buildingId: new Types.ObjectId(buildingId),
              role: Role.BUILDING_ADMIN,
            },
            { role: Role.SYSTEM_ADMIN },
          ],
        })
        .select('_id')
        .lean()
        .exec();

      if (buildingAdmins.length > 0) {
        const notifs = buildingAdmins.map((admin) => ({
          recipientId: admin._id,
          buildingId: new Types.ObjectId(buildingId),
          title: 'Hồ sơ cư dân mới chờ duyệt',
          message: `Cư dân ${resident.name} (Căn hộ: ${resident.apartment || 'Chưa cập nhật'}) vừa hoàn tất đăng ký`,
          category: NotificationCategory.ACCOUNT,
          type: NotificationType.RESIDENT_REGISTRATION_PENDING,
          priority: NotificationPriority.HIGH,
          actionUrl: '/admin/residents/pending',
          metadata: {
            residentId: new Types.ObjectId(resident.id),
            phone: resident.phone,
            apartment: resident.apartment,
          },
          isRead: false,
          readAt: null,
        }));

        await this.notificationModel.insertMany(notifs, { ordered: false });
      }

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
  async notifyResidentApprovalResult(
    buildingId: string,
    residentId: string,
    result: {
      status: 'ACTIVE' | 'REJECTED';
      apartment?: string;
      reason?: string;
    },
  ): Promise<void> {
    try {
      const isApproved = result.status === 'ACTIVE';

      // Lưu thông báo vào hộp thư cá nhân của cư dân
      await this.createNotification({
        recipientId: residentId,
        buildingId,
        title: isApproved
          ? 'Hồ sơ cư dân đã được phê duyệt'
          : 'Hồ sơ cư dân đã bị từ chối',
        message: isApproved
          ? `Tài khoản cư dân tại căn hộ ${result.apartment || ''} đã được kích hoạt thành công.`
          : `Yêu cầu xác nhận cư dân bị từ chối. Lý do: ${result.reason || 'Thông tin không khớp với dữ liệu tòa nhà'}.`,
        category: NotificationCategory.ACCOUNT,
        type: isApproved
          ? NotificationType.RESIDENT_APPROVED
          : NotificationType.RESIDENT_REJECTED,
        priority: isApproved
          ? NotificationPriority.NORMAL
          : NotificationPriority.HIGH,
        actionUrl: isApproved ? '/(tabs)' : '/auth/register/resident',
        metadata: {
          status: result.status,
          apartment: result.apartment,
          reason: result.reason,
        },
      });

      // Kênh WebSocket Socket.IO
      this.notificationsGateway.notifyResidentApprovalResult(
        buildingId,
        residentId,
        result,
      );
    } catch (error) {
      this.logger.error(
        `Lỗi khi điều phối thông báo kết quả duyệt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Điều phối phát thông báo bưu kiện mới đến cho Cư Dân
  async notifyPackageDropOff(
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
  ): Promise<void> {
    try {
      // Lưu thông báo vào hộp thư của cư dân nhận hàng
      await this.createNotification({
        recipientId: residentId,
        buildingId,
        title: `Bưu kiện mới tại Ngăn #${packageInfo.boxNumber}!`,
        message: `Đơn hàng ${packageInfo.trackingNumber} từ ${packageInfo.carrierName} đã được đặt tại Ngăn #${packageInfo.boxNumber} (${packageInfo.lockerName}). Mã OTP nhận hàng: ${packageInfo.pinCode}`,
        category: NotificationCategory.PACKAGE,
        type: NotificationType.PACKAGE_ARRIVED,
        priority: NotificationPriority.HIGH,
        actionUrl: `/locker/pickup?id=${packageInfo.id}&otp=${packageInfo.pinCode}&locker=${packageInfo.boxNumber}`,
        metadata: {
          packageId: new Types.ObjectId(packageInfo.id),
          trackingNumber: packageInfo.trackingNumber,
          boxNumber: packageInfo.boxNumber,
          lockerCode: packageInfo.lockerCode,
          pinCode: packageInfo.pinCode,
          carrierName: packageInfo.carrierName,
        },
      });

      // Kênh WebSocket Socket.IO
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
