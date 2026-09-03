import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LockersService } from './lockers.service';
import { CreateLockerDto, LookupReceiverDto } from './dto';
import { Locker } from './schemas/locker.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import {
  ApiGetLockerByCodeDoc,
  ApiGetLockerBoxesDoc,
  ApiLookupReceiverDoc,
  ApiCreateLockerDoc,
  ApiFindAllLockersDoc,
} from './swagger/locker.swagger';

@ApiTags('Lockers')
@Controller('lockers')
export class LockersController {
  constructor(private readonly lockersService: LockersService) {}

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
  async findAll(): Promise<Locker[]> {
    return this.lockersService.findAll();
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
}
