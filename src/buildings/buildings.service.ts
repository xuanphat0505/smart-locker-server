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
import {
  CreateBuildingDto,
  UpdateBuildingDto,
  PublicBuildingResponseDto,
} from './dto';
import { BuildingStatus } from './enums/building-status.enum';
import { DEFAULT_PRICING_POLICY } from '../payments/utils/pricing-policy.util';

// Danh sách trường được phép trả về cho API công khai (whitelist, trường mới thêm vào schema mặc định bị ẩn)
const PUBLIC_BUILDING_FIELDS = [
  'name',
  'code',
  'address',
  'totalFloors',
  'totalApartments',
  'hotline',
  'status',
  'description',
  'location',
  'createdAt',
  'updatedAt',
] as const;

// Biểu thức chọn trường dạng chuỗi dùng cho find().select()
const PUBLIC_BUILDING_SELECT = PUBLIC_BUILDING_FIELDS.join(' ');

// Biểu thức $project dạng đối tượng dùng cho aggregate
const PUBLIC_BUILDING_PROJECTION = Object.fromEntries(
  PUBLIC_BUILDING_FIELDS.map((field) => [field, 1]),
);

@Injectable()
export class BuildingsService {
  constructor(
    @InjectModel(Building.name) private buildingModel: Model<Building>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) { }

  // Khởi tạo một Tòa Nhà mới vào cơ sở dữ liệu
  async create(dto: CreateBuildingDto): Promise<Building> {
    const normalizedCode = dto.code.toUpperCase().trim();
    const existingBuilding = await this.findByCode(normalizedCode);
    if (existingBuilding) {
      throw new ConflictException('Mã tòa nhà này đã tồn tại trong hệ thống');
    }

    const { latitude, longitude, ...buildingData } = dto;
    let locationData:
      | { type: string; coordinates: [number, number] }
      | undefined;

    if (latitude !== undefined && longitude !== undefined) {
      locationData = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
    }

    const newBuilding = new this.buildingModel({
      ...buildingData,
      name: dto.name.trim(),
      code: normalizedCode,
      address: dto.address.trim(),
      status: BuildingStatus.ACTIVE,
      ...(locationData ? { location: locationData } : {}),
    });

    return newBuilding.save();
  }

  // Lấy danh sách tất cả các Tòa Nhà (tùy chọn lọc theo trạng thái hoạt động)
  async findAll(status?: BuildingStatus): Promise<Building[]> {
    const filter = status ? { status } : {};
    return this.buildingModel.find(filter).sort({ name: 1 }).exec();
  }

  // Lấy danh sách Tòa Nhà đang hoạt động cho API công khai, chỉ gồm các trường trong whitelist
  async findAllPublic(): Promise<PublicBuildingResponseDto[]> {
    return this.buildingModel
      .find({ status: BuildingStatus.ACTIVE })
      .select(PUBLIC_BUILDING_SELECT)
      .sort({ name: 1 })
      .lean<PublicBuildingResponseDto[]>()
      .exec();
  }

  // Tìm kiếm danh sách Tòa Nhà gần vị trí GPS hiện tại sử dụng chỉ mục 2dsphere
  async findNearby(
    lat: number,
    lng: number,
    radiusInMeters = 5000,
  ): Promise<PublicBuildingResponseDto[]> {
    return this.buildingModel.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          distanceField: 'distance',
          maxDistance: radiusInMeters,
          spherical: true,
          query: { status: BuildingStatus.ACTIVE },
        },
      },
      {
        $sort: { distance: 1 },
      },
      {
        $project: { ...PUBLIC_BUILDING_PROJECTION, distance: 1 },
      },
    ]);
  }

  // Lấy chi tiết một Tòa Nhà cho API công khai, chỉ gồm các trường trong whitelist
  async findPublicById(id: string): Promise<PublicBuildingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã tòa nhà không hợp lệ');
    }

    const building = await this.buildingModel
      .findById(id)
      .select(PUBLIC_BUILDING_SELECT)
      .lean<PublicBuildingResponseDto>()
      .exec();

    if (!building) {
      throw new NotFoundException('Không tìm thấy thông tin tòa nhà');
    }
    return building;
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
    const current = await this.findById(id);

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

    const { latitude, longitude, bankAccount, pricingPolicy, ...restDto } = dto;
    const updatePayload: Record<string, unknown> = { ...restDto };

    if (latitude !== undefined && longitude !== undefined) {
      updatePayload.location = {
        type: 'Point',
        coordinates: [longitude, latitude],
      };
    }

    // Hợp nhất an toàn thông tin tài khoản ngân hàng thụ hưởng tránh ghi đè mất trường
    if (bankAccount) {
      const mergedBank = {
        ...(current.bankAccount || {}),
        ...bankAccount,
      };
      if (mergedBank.accountName) {
        mergedBank.accountName = mergedBank.accountName.toUpperCase().trim();
      }
      if (mergedBank.accountNumber) {
        mergedBank.accountNumber = mergedBank.accountNumber.trim();
      }
      if (mergedBank.bankBin) {
        mergedBank.bankBin = mergedBank.bankBin.trim();
      }
      updatePayload.bankAccount = mergedBank;
    }

    // Hợp nhất an toàn và kiểm tra tính hợp lý của biểu phí 4 chặng
    if (pricingPolicy) {
      const mergedPolicy = {
        ...(current.pricingPolicy || DEFAULT_PRICING_POLICY),
        ...pricingPolicy,
      };

      if (
        mergedPolicy.t1Hours &&
        mergedPolicy.t2Hours &&
        mergedPolicy.t1Hours >= mergedPolicy.t2Hours
      ) {
        throw new BadRequestException('Mốc thời lượng T1 phải nhỏ hơn T2');
      }

      if (
        mergedPolicy.t2Hours &&
        mergedPolicy.t3Hours &&
        mergedPolicy.t2Hours >= mergedPolicy.t3Hours
      ) {
        throw new BadRequestException('Mốc thời lượng T2 phải nhỏ hơn T3');
      }

      updatePayload.pricingPolicy = mergedPolicy;
    }

    const updated = await this.buildingModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(
        'Không tìm thấy thông tin tòa nhà để cập nhật',
      );
    }

    return updated;
  }

  // Lấy thông tin tòa nhà của Ban Quản Lý đang đăng nhập
  async findMyBuilding(buildingId?: string): Promise<Building> {
    if (!buildingId) {
      throw new BadRequestException(
        'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
      );
    }
    return this.findById(buildingId);
  }

  // Cập nhật thông tin tòa nhà do Ban Quản Lý thực hiện giới hạn các trường an toàn
  async updateMyBuilding(
    buildingId: string | undefined,
    dto: UpdateBuildingDto,
  ): Promise<Building> {
    if (!buildingId) {
      throw new BadRequestException(
        'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
      );
    }

    // Chặn Ban Quản Lý tự ý thay đổi mã định danh hoặc trạng thái kích hoạt của tòa nhà
    const { ...safeDto } = dto;
    return this.update(buildingId, safeDto);
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
