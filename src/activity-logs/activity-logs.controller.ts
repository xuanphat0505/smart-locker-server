import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActivityLogsService } from './activity-logs.service';
import {
  ActivityLogStatsQueryDto,
  QueryActivityLogDto,
} from './dto/query-activity-log.dto';
import {
  ApiActivityLogStatsDoc,
  ApiListActivityLogsDoc,
} from './swagger/activity-log.swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

@ApiTags('Activity Logs')
@ApiBearerAuth('JWT-auth')
@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  // Liệt kê nhật ký thao tác theo phạm vi quyền của người quản trị
  @Get()
  @ApiListActivityLogsDoc()
  async findAll(
    @Query() query: QueryActivityLogDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.activityLogsService.findAll(req.user, query);
  }

  // Thống kê nhật ký thao tác theo trạng thái, nhóm và ngày
  @Get('stats')
  @ApiActivityLogStatsDoc()
  async getStats(
    @Query() query: ActivityLogStatsQueryDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.activityLogsService.getStats(req.user, query);
  }
}
