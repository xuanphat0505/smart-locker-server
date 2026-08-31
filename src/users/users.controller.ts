import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from './enums/approval-status.enum';
import { User } from './schemas/user.schema';
import {
  CreateBuildingAdminDto,
  CreateResidentDto,
  RejectResidentDto,
} from './dto';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiCreateBuildingAdminDoc,
  ApiCreateResidentByAdminDoc,
  ApiGetProfileDoc,
  ApiGetPendingResidentsDoc,
  ApiApproveResidentDoc,
  ApiRejectResidentDoc,
  ApiFindAllUsersDoc,
  ApiFindOneUserDoc,
  ApiRemoveUserDoc,
} from './swagger/user.swagger';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Khởi tạo tài khoản Ban Quản Lý Tòa Nhà mới (Chỉ dành riêng cho System Admin)
  @Post('building-admin')
  @Roles(Role.SYSTEM_ADMIN)
  @ApiCreateBuildingAdminDoc()
  async createBuildingAdmin(
    @Body() dto: CreateBuildingAdminDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User> {
    return this.usersService.createBuildingAdmin(dto, req.user.userId);
  }

  // Khởi tạo tài khoản Cư Dân mới trong chung cư (Dành riêng cho Ban Quản Lý Tòa Nhà)
  @Post('resident')
  @Roles(Role.BUILDING_ADMIN)
  @ApiCreateResidentByAdminDoc()
  async createResident(
    @Body() dto: CreateResidentDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User> {
    return this.usersService.createResidentByAdmin(dto, req.user);
  }

  // Lấy thông tin tài khoản cá nhân của người dùng đang đăng nhập
  @Get('profile')
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN, Role.SHIPPER, Role.RESIDENT)
  @ApiGetProfileDoc()
  async getProfile(
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User | null> {
    return this.usersService.findById(req.user.userId);
  }

  // Lấy danh sách cư dân đang chờ xét duyệt thuộc tòa nhà của Ban Quản Lý
  @Get('pending-residents')
  @Roles(Role.BUILDING_ADMIN)
  @ApiGetPendingResidentsDoc()
  async getPendingResidents(
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User[]> {
    if (!req.user.buildingId) {
      throw new BadRequestException(
        'Tài khoản quản trị chưa được liên kết với Tòa nhà nào',
      );
    }
    return this.usersService.findPendingResidentsByBuilding(
      req.user.buildingId,
    );
  }

  // Phê duyệt hồ sơ cư dân của tòa nhà (Dành riêng cho Ban Quản Lý)
  @Patch(':id/approve')
  @Roles(Role.BUILDING_ADMIN)
  @ApiApproveResidentDoc()
  async approveResident(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User> {
    const updated = await this.usersService.updateApprovalStatus(
      id,
      ApprovalStatus.ACTIVE,
      req.user.userId,
    );
    if (!updated) {
      throw new NotFoundException('Không tìm thấy hồ sơ cư dân để phê duyệt');
    }
    return updated;
  }

  // Từ chối phê duyệt hồ sơ cư dân kèm theo lý do (Dành riêng cho Ban Quản Lý)
  @Patch(':id/reject')
  @Roles(Role.BUILDING_ADMIN)
  @ApiRejectResidentDoc()
  async rejectResident(
    @Param('id') id: string,
    @Body() dto: RejectResidentDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User> {
    const updated = await this.usersService.updateApprovalStatus(
      id,
      ApprovalStatus.REJECTED,
      req.user.userId,
      dto.reason,
    );
    if (!updated) {
      throw new NotFoundException('Không tìm thấy hồ sơ cư dân để từ chối');
    }
    return updated;
  }

  // Lấy danh sách người dùng theo phạm vi phân quyền (System Admin xem tất cả, BQL xem cư dân tòa mình)
  @Get()
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiFindAllUsersDoc()
  async findAll(@Request() req: { user: AuthenticatedUser }): Promise<User[]> {
    return this.usersService.findAllScoped(req.user);
  }

  // Lấy chi tiết thông tin một người dùng theo phạm vi phân quyền
  @Get(':id')
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiFindOneUserDoc()
  async findOne(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User | null> {
    return this.usersService.findOneScoped(id, req.user);
  }

  // Xóa tài khoản người dùng theo phạm vi phân quyền (System Admin xóa bất kỳ, BQL chỉ xóa cư dân tòa mình)
  @Delete(':id')
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiRemoveUserDoc()
  async remove(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<User | null> {
    return this.usersService.removeScoped(id, req.user);
  }
}
