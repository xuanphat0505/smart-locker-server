import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import { CreateBuildingAdminDto, CreateResidentDto } from './dto';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // Tạo mới một tài khoản người dùng vào cơ sở dữ liệu
  async create(userData: Partial<User>): Promise<User> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  // Khởi tạo tài khoản Ban Quản Lý Tòa Nhà mới do System Admin thực hiện
  async createBuildingAdmin(
    dto: CreateBuildingAdminDto,
    createdByAdminId: string,
  ): Promise<User> {
    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Địa chỉ email này đã được sử dụng');
    }

    const existingPhone = await this.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Số điện thoại này đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newAdmin = await this.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      password: hashedPassword,
      role: Role.BUILDING_ADMIN,
      buildingId: new Types.ObjectId(dto.buildingId),
      approvalStatus: ApprovalStatus.ACTIVE,
      approvedBy: new Types.ObjectId(createdByAdminId),
      approvedAt: new Date(),
    });

    const sanitized = await this.findById(newAdmin._id.toString());
    return sanitized as User;
  }

  // Khởi tạo tài khoản Cư Dân trực tiếp do Ban Quản Lý Tòa Nhà thực hiện
  async createResidentByAdmin(
    dto: CreateResidentDto,
    creator: AuthenticatedUser,
  ): Promise<User> {
    if (!creator.buildingId) {
      throw new BadRequestException(
        'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
      );
    }

    const existingEmail = await this.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Địa chỉ email này đã được sử dụng');
    }

    const existingPhone = await this.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Số điện thoại này đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newResident = await this.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      password: hashedPassword,
      role: Role.RESIDENT,
      buildingId: new Types.ObjectId(creator.buildingId),
      apartment: dto.apartment.trim(),
      approvalStatus: ApprovalStatus.ACTIVE,
      approvedBy: new Types.ObjectId(creator.userId),
      approvedAt: new Date(),
    });

    const sanitized = await this.findById(newResident._id.toString());
    return sanitized as User;
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

  // Lấy danh sách người dùng theo phạm vi quyền hạn của người gọi
  async findAllScoped(creator: AuthenticatedUser): Promise<User[]> {
    if (creator.role === Role.SYSTEM_ADMIN) {
      return this.userModel
        .find()
        .select('-password')
        .sort({ createdAt: -1 })
        .exec();
    }

    if (creator.role === Role.BUILDING_ADMIN) {
      if (!creator.buildingId) {
        throw new BadRequestException(
          'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
        );
      }
      return this.userModel
        .find({
          buildingId: new Types.ObjectId(creator.buildingId),
          role: Role.RESIDENT,
        })
        .select('-password')
        .sort({ createdAt: -1 })
        .exec();
    }

    throw new ForbiddenException(
      'Không có quyền truy cập danh sách người dùng',
    );
  }

  // Lấy chi tiết thông tin một người dùng theo phạm vi phân quyền
  async findOneScoped(
    id: string,
    creator: AuthenticatedUser,
  ): Promise<User | null> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin người dùng');
    }

    if (creator.role === Role.SYSTEM_ADMIN) {
      return user;
    }

    if (creator.role === Role.BUILDING_ADMIN) {
      const isSameBuilding =
        user.buildingId?.toString() === creator.buildingId?.toString();
      const isResident = user.role === Role.RESIDENT;

      if (!isResident || !isSameBuilding) {
        throw new ForbiddenException(
          'Bạn không có quyền xem thông tin người dùng này',
        );
      }
      return user;
    }

    throw new ForbiddenException('Không có quyền truy cập');
  }

  // Xóa tài khoản người dùng theo phạm vi phân quyền
  async removeScoped(
    id: string,
    creator: AuthenticatedUser,
  ): Promise<User | null> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng để xóa');
    }

    if (creator.role === Role.SYSTEM_ADMIN) {
      await this.userModel.findByIdAndDelete(id).exec();
      return user;
    }

    if (creator.role === Role.BUILDING_ADMIN) {
      const isSameBuilding =
        user.buildingId?.toString() === creator.buildingId?.toString();
      const isResident = user.role === Role.RESIDENT;

      if (!isResident || !isSameBuilding) {
        throw new ForbiddenException(
          'Bạn chỉ có quyền xóa tài khoản cư dân thuộc tòa nhà do mình quản lý',
        );
      }

      await this.userModel.findByIdAndDelete(id).exec();
      return user;
    }

    throw new ForbiddenException('Không có quyền thực hiện thao tác này');
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
