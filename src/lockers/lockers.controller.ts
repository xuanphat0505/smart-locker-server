import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LockersService, LockerListItem } from './lockers.service';
import { LockersAdminService } from './lockers-admin.service';
import {
  CreateLockerDto,
  UpdateLockerDto,
  LookupReceiverDto,
  UnlockBoxDto,
  UpdateBoxStatusDto,
  QueryLockerLogDto,
} from './dto';
import { Locker } from './schemas/locker.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import type { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import {
  ApiGetLockerByCodeDoc,
  ApiGetLockerBoxesDoc,
  ApiLookupReceiverDoc,
  ApiCreateLockerDoc,
  ApiFindAllLockersDoc,
  ApiUpdateLockerDoc,
  ApiGetBoxesForAdminDoc,
  ApiUpdateBoxStatusDoc,
  ApiUnlockBoxDoc,
  ApiGetLockerLogsDoc,
} from './swagger/locker.swagger';

@ApiTags('Lockers')
@Controller('lockers')
export class LockersController {
  constructor(
    private readonly lockersService: LockersService,
    private readonly lockersAdminService: LockersAdminService,
  ) {}

  // Tra cứu xác minh cư dân tòa nhà qua số điện thoại trước khi mở tủ bỏ hàng
  @Get('lookup-receiver')
  @ApiLookupReceiverDoc()
  async lookupReceiver(@Query() query: LookupReceiverDto) {
    return this.lockersService.lookupReceiver(query.phone, query.lockerCode);
  }

  // Lấy sơ đồ các ngăn tủ thời gian thực hiển thị giao diện 2D cho tài xế chọn ngăn
  @Get(':code/boxes')
  @ApiGetLockerBoxesDoc()
  async getBoxes(@Param('code') code: string) {
    return this.lockersService.getBoxesByLockerCode(code);
  }

  // Quản trị viên xem các ngăn tủ kèm bưu kiện đang nằm trong ngăn (route công khai bên trên không trả thông tin người nhận)
  @Get(':code/boxes/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiGetBoxesForAdminDoc()
  async getBoxesForAdmin(@Param('code') code: string, @Request() req: { user: AuthenticatedUser }) {
    return this.lockersAdminService.getBoxes(code, req.user);
  }

  // Quản trị viên xem lịch sử thao tác của trạm tủ từ nhật ký phần cứng
  @Get(':code/logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiGetLockerLogsDoc()
  async getLockerLogs(
    @Param('code') code: string,
    @Query() query: QueryLockerLogDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.lockersAdminService.getLogs(code, query, req.user);
  }

  // Kiểm tra tình trạng kết nối phần cứng thời gian thực của trạm tủ
  @Get(':code/health')
  async getLockerHealth(@Param('code') code: string) {
    return this.lockersService.getLockerHealth(code);
  }

  // Lấy thông tin trạm tủ chi tiết qua mã Code
  @Get(':code')
  @ApiGetLockerByCodeDoc()
  async findByCode(@Param('code') code: string): Promise<Locker> {
    return this.lockersService.findByCode(code);
  }

  // Lấy danh sách tất cả các trạm tủ trong hệ thống (Dành cho Quản trị viên)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiFindAllLockersDoc()
  async findAll(@Request() req: { user: AuthenticatedUser }): Promise<LockerListItem[]> {
    return this.lockersService.findAll(req.user);
  }

  // Khởi tạo trạm tủ mới kèm các ngăn tủ con (Dành riêng cho System Admin)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiCreateLockerDoc()
  async create(@Body() dto: CreateLockerDto): Promise<Locker> {
    return this.lockersService.create(dto);
  }

  // Quản trị viên chuyển một ngăn tủ giữa sẵn sàng và bảo trì
  @Patch(':code/boxes/:boxNumber')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiUpdateBoxStatusDoc()
  async updateBoxStatus(
    @Param('code') code: string,
    @Param('boxNumber', ParseIntPipe) boxNumber: number,
    @Body() dto: UpdateBoxStatusDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.lockersAdminService.updateBoxStatus(code, boxNumber, dto, req.user);
  }

  // Quản trị viên mở khóa một ngăn tủ từ xa kèm lý do để truy vết
  @Post(':code/boxes/:boxNumber/unlock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiUnlockBoxDoc()
  async unlockBox(
    @Param('code') code: string,
    @Param('boxNumber', ParseIntPipe) boxNumber: number,
    @Body() dto: UnlockBoxDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.lockersAdminService.unlockBox(code, boxNumber, dto, req.user);
  }

  // Cập nhật thông tin và tọa độ vị trí trạm tủ (Dành cho Quản trị viên)
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiUpdateLockerDoc()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLockerDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<Locker> {
    return this.lockersService.update(id, dto, req.user);
  }
}
