import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IssuesService } from './issues.service';
import {
  CreateIssueDto,
  EscalateIssueDto,
  QueryIssuesDto,
  UpdateIssueStatusDto,
} from './dto/issue.dto';
import {
  ISSUE_MAX_ATTACHMENTS,
  ISSUE_MAX_ATTACHMENT_BYTES,
} from './enums/issue.enums';
import {
  ApiCreateIssueDoc,
  ApiEscalateIssueDoc,
  ApiGetIssueDoc,
  ApiListIssuesDoc,
  ApiUpdateIssueStatusDoc,
} from './swagger/issue.swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';

@ApiTags('Issues')
@ApiBearerAuth('JWT-auth')
@Controller('issues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  // Cư dân, tài xế hoặc Ban Quản Lý gửi phiếu báo lỗi kèm tối đa 3 ảnh
  @Post()
  @Roles(Role.RESIDENT, Role.SHIPPER, Role.BUILDING_ADMIN)
  @ApiCreateIssueDoc()
  @UseInterceptors(
    FilesInterceptor('files', ISSUE_MAX_ATTACHMENTS, {
      limits: { fileSize: ISSUE_MAX_ATTACHMENT_BYTES },
    }),
  )
  async create(
    @Body() dto: CreateIssueDto,
    @Request() req: { user: AuthenticatedUser },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.issuesService.create(req.user, dto, files ?? []);
  }

  // Quản trị viên xem danh sách phiếu theo phạm vi tòa nhà
  @Get()
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiListIssuesDoc()
  async findAll(
    @Query() query: QueryIssuesDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.issuesService.findAll(req.user, query);
  }

  // Quản trị viên xem chi tiết một phiếu
  @Get(':id')
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiGetIssueDoc()
  async findOne(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.issuesService.findOne(id, req.user);
  }

  // Quản trị viên chuyển trạng thái xử lý của phiếu
  @Patch(':id/status')
  @Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)
  @ApiUpdateIssueStatusDoc()
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIssueStatusDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.issuesService.updateStatus(id, dto, req.user);
  }

  // Ban Quản Lý chuyển phiếu lên Super Admin
  @Post(':id/escalate')
  @Roles(Role.BUILDING_ADMIN)
  @ApiEscalateIssueDoc()
  async escalate(
    @Param('id') id: string,
    @Body() dto: EscalateIssueDto,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.issuesService.escalate(id, dto, req.user);
  }
}
