import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './schemas/user.schema';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // Tạo mới một tài khoản người dùng vào cơ sở dữ liệu
  async create(userData: Partial<User>): Promise<User> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  // Tìm kiếm người dùng theo địa chỉ email duy nhất
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  // Tìm kiếm người dùng theo số điện thoại duy nhất
  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ phone: phone.trim() }).exec();
  }

  // Tìm kiếm thông tin người dùng theo mã định danh id
  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('-password').exec();
  }

  // Lấy danh sách cư dân đang ở trạng thái chờ xét duyệt của một tòa nhà cụ thể
  async findPendingResidentsByBuilding(buildingId: string): Promise<User[]> {
    return this.userModel
      .find({
        buildingId: new Types.ObjectId(buildingId),
        role: Role.RESIDENT,
        approvalStatus: ApprovalStatus.PENDING,
      })
      .select('-password')
      .sort({ createdAt: -1 })
      .exec();
  }

  // Cập nhật trạng thái phê duyệt tài khoản cư dân của Ban Quản Lý
  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedBy?: string,
    rejectedReason?: string,
  ): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        {
          approvalStatus: status,
          ...(approvedBy
            ? {
                approvedBy: new Types.ObjectId(approvedBy),
                approvedAt: new Date(),
              }
            : {}),
          ...(rejectedReason ? { rejectedReason } : {}),
        },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  // Lấy danh sách toàn bộ người dùng trong hệ thống
  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  // Xóa tài khoản người dùng theo mã định danh id
  async remove(id: string): Promise<User | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  // Cập nhật mã băm Refresh Token của người dùng vào cơ sở dữ liệu
  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash }).exec();
  }

  // Tìm kiếm thông tin người dùng bao gồm cả mã băm Refresh Token để xác thực
  async findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('-password').exec();
  }
}
