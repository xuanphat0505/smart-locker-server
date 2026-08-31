import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Building } from './schemas/building.schema';
import { User } from '../users/schemas/user.schema';
import { CreateBuildingDto, UpdateBuildingDto } from './dto';
import { BuildingStatus } from './enums/building-status.enum';

@Injectable()
export class BuildingsService {
  constructor(
    @InjectModel(Building.name) private buildingModel: Model<Building>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // Khởi tạo một Tòa Nhà mới vào cơ sở dữ liệu
  async create(dto: CreateBuildingDto): Promise<Building> {
    const normalizedCode = dto.code.toUpperCase().trim();
    const existingBuilding = await this.findByCode(normalizedCode);
    if (existingBuilding) {
      throw new ConflictException('Mã tòa nhà này đã tồn tại trong hệ thống');
    }

    const newBuilding = new this.buildingModel({
      ...dto,
      name: dto.name.trim(),
      code: normalizedCode,
      address: dto.address.trim(),
      status: BuildingStatus.ACTIVE,
    });

    return newBuilding.save();
  }

  // Lấy danh sách tất cả các Tòa Nhà (tùy chọn lọc theo trạng thái hoạt động)
  async findAll(status?: BuildingStatus): Promise<Building[]> {
    const filter = status ? { status } : {};
    return this.buildingModel.find(filter).sort({ name: 1 }).exec();
  }

  // Tìm kiếm thông tin chi tiết một Tòa Nhà theo mã định danh ObjectId
  async findById(id: string): Promise<Building> {
    const building = await this.buildingModel.findById(id).exec();
    if (!building) {
      throw new NotFoundException('Không tìm thấy thông tin tòa nhà');
    }
    return building;
  }

  // Tìm kiếm Tòa Nhà theo mã viết tắt duy nhất
  async findByCode(code: string): Promise<Building | null> {
    return this.buildingModel
      .findOne({ code: code.toUpperCase().trim() })
      .exec();
  }

  // Cập nhật thông tin chi tiết của một Tòa Nhà
  async update(id: string, dto: UpdateBuildingDto): Promise<Building> {
    await this.findById(id);

    if (dto.code) {
      const normalizedCode = dto.code.toUpperCase().trim();
      const existing = await this.findByCode(normalizedCode);
      if (existing && existing._id.toString() !== id) {
        throw new ConflictException(
          'Mã tòa nhà này đã được sử dụng bởi tòa nhà khác',
        );
      }
      dto.code = normalizedCode;
    }

    const updated = await this.buildingModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(
        'Không tìm thấy thông tin tòa nhà để cập nhật',
      );
    }

    return updated;
  }

  // Xóa Tòa Nhà khỏi hệ thống có kiểm tra ràng buộc cư dân và tài khoản liên kết
  async remove(id: string): Promise<Building> {
    await this.findById(id);

    const hasLinkedUsers = await this.userModel.exists({
      buildingId: new Types.ObjectId(id),
    });

    if (hasLinkedUsers) {
      throw new BadRequestException(
        'Không thể xóa tòa nhà vì đang có tài khoản cư dân hoặc ban quản lý liên kết',
      );
    }

    const deleted = await this.buildingModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy thông tin tòa nhà để xóa');
    }

    return deleted;
  }
}
