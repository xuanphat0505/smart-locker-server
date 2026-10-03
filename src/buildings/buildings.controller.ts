import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';
import {
  CreateBuildingDto,
  UpdateBuildingDto,
  FindNearbyBuildingsDto,
} from './dto';
import { BuildingStatus } from './enums/building-status.enum';
import { Building } from './schemas/building.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiFindAllBuildingsDoc,
  ApiFindNearbyBuildingsDoc,
  ApiFindOneBuildingDoc,
  ApiCreateBuildingDoc,
  ApiUpdateBuildingDoc,
  ApiRemoveBuildingDoc,
  ApiGetMyBuildingDoc,
  ApiUpdateMyBuildingDoc,
} from './swagger/building.swagger';

@ApiTags('Buildings')
@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  // Lấy danh sách các Tòa Nhà trong hệ thống (API công khai phục vụ Mobile App)
  @Get()
  @ApiFindAllBuildingsDoc()
  async findAll(@Query('status') status?: BuildingStatus): Promise<Building[]> {
    return this.buildingsService.findAll(status || BuildingStatus.ACTIVE);
  }

  // Tìm kiếm danh sách Tòa Nhà gần vị trí GPS hiện tại (API công khai phục vụ Mobile App)
  @Get('nearby')
  @ApiFindNearbyBuildingsDoc()
  async findNearby(@Query() query: FindNearbyBuildingsDto): Promise<any[]> {
    return this.buildingsService.findNearby(query.lat, query.lng, query.radius);
  }

  // Ban Quản Lý xem thông tin chi tiết Tòa Nhà của mình
  @Get('my-building')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiGetMyBuildingDoc()
  async findMyBuilding(
    @Request() req: { user: AuthenticatedUser },
  ): Promise<Building> {
    return this.buildingsService.findMyBuilding(req.user.buildingId);
  }

  // Ban Quản Lý cập nhật thông tin và biểu phí Tòa Nhà của mình
  @Patch('my-building')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiUpdateMyBuildingDoc()
  async updateMyBuilding(
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: UpdateBuildingDto,
  ): Promise<Building> {
    return this.buildingsService.updateMyBuilding(req.user.buildingId, dto);
  }

  // Lấy thông tin chi tiết một Tòa Nhà theo mã id
  @Get(':id')
  @ApiFindOneBuildingDoc()
  async findOne(@Param('id') id: string): Promise<Building> {
    return this.buildingsService.findById(id);
  }

  // Khởi tạo Tòa Nhà đối tác mới (Dành riêng cho Quản trị viên cấp cao System Admin)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiCreateBuildingDoc()
  async create(@Body() dto: CreateBuildingDto): Promise<Building> {
    return this.buildingsService.create(dto);
  }

  // Cập nhật thông tin Tòa Nhà theo mã id
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiUpdateBuildingDoc()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<Building> {
    // Kiểm tra phạm vi quyền hạn của Ban Quản Lý
    if (
      req.user.role === Role.BUILDING_ADMIN &&
      req.user.buildingId?.toString() !== id
    ) {
      throw new ForbiddenException(
        'Bạn chỉ có quyền cập nhật thông tin tòa nhà thuộc phạm vi quản lý của mình',
      );
    }

    if (req.user.role === Role.BUILDING_ADMIN) {
      return this.buildingsService.updateMyBuilding(id, dto);
    }

    return this.buildingsService.update(id, dto);
  }

  // Xóa Tòa Nhà khỏi hệ thống (Dành riêng cho Quản trị viên cấp cao System Admin)
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiRemoveBuildingDoc()
  async remove(@Param('id') id: string): Promise<Building> {
    return this.buildingsService.remove(id);
  }
}
