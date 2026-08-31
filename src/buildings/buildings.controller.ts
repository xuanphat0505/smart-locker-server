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
import {
  ApiFindAllBuildingsDoc,
  ApiFindNearbyBuildingsDoc,
  ApiFindOneBuildingDoc,
  ApiCreateBuildingDoc,
  ApiUpdateBuildingDoc,
  ApiRemoveBuildingDoc,
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

  // Cập nhật thông tin Tòa Nhà (Dành riêng cho Quản trị viên cấp cao System Admin)
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiUpdateBuildingDoc()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
  ): Promise<Building> {
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
