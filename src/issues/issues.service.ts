import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';
import { Issue } from './schemas/issue.schema';
import { COUNTER_MODEL_NAME, CounterDocument } from './schemas/counter.schema';
import { Locker } from '../lockers/schemas/locker.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../auth/enums/role.enum';
import { ApprovalStatus } from '../users/enums/approval-status.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { canAccessBuilding, resolveBuildingScope } from '../common/utils/building-scope.util';
import { escapeRegex, normalizeCode } from '../common/utils/text.util';
import { UploadService } from '../upload/upload.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../notifications/enums/notification.enums';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityCategory, ActivityStatus } from '../activity-logs/enums/activity-log.enums';
import {
  CreateIssueDto,
  EscalateIssueDto,
  QueryIssuesDto,
  UpdateIssueStatusDto,
} from './dto/issue.dto';
import {
  ESCALATABLE_STATUSES,
  ISSUE_ALLOWED_IMAGE_TYPES,
  ISSUE_MAX_ATTACHMENTS,
  ISSUE_MAX_ATTACHMENT_BYTES,
  ISSUE_STATUS_TRANSITIONS,
  IssuePriority,
  IssueStatus,
} from './enums/issue.enums';

const TICKET_COUNTER_ID = 'issue';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @InjectModel(Issue.name) private readonly issueModel: Model<Issue>,
    @InjectModel(COUNTER_MODEL_NAME)
    private readonly counterModel: Model<CounterDocument>,
    @InjectModel(Locker.name) private readonly lockerModel: Model<Locker>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly uploadService: UploadService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  // Sinh mã phiếu tuần tự TK-0001 bằng bộ đếm nguyên tử để tạo đồng thời không bao giờ trùng mã
  async nextTicketCode(): Promise<string> {
    const counter = await this.counterModel.findOneAndUpdate(
      { _id: TICKET_COUNTER_ID },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    return `TK-${String(counter.seq).padStart(4, '0')}`;
  }

  // Kiểm tra số lượng, loại và dung lượng ảnh đính kèm trước khi tải lên
  private assertValidAttachments(files: Express.Multer.File[]): void {
    if (files.length > ISSUE_MAX_ATTACHMENTS) {
      throw new BadRequestException(`Chỉ đính kèm tối đa ${ISSUE_MAX_ATTACHMENTS} ảnh`);
    }
    for (const file of files) {
      if (!ISSUE_ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP');
      }
      if (file.size > ISSUE_MAX_ATTACHMENT_BYTES) {
        throw new BadRequestException('Mỗi ảnh tối đa 5 MB');
      }
    }
  }

  // Xác định tòa nhà và trạm tủ của phiếu: cư dân và Ban Quản Lý chỉ báo trong tòa của mình, tài xế báo theo trạm tủ
  private async resolveLocation(user: AuthenticatedUser, lockerCode?: string) {
    let locker: Locker | null = null;
    if (lockerCode) {
      locker = await this.lockerModel.findOne({
        code: normalizeCode(lockerCode),
      });
      if (!locker) {
        throw new NotFoundException(`Trạm tủ với mã ${lockerCode} không tồn tại`);
      }
      if (user.role !== Role.SHIPPER && String(locker.buildingId) !== String(user.buildingId)) {
        throw new ForbiddenException('Bạn chỉ có thể báo lỗi cho trạm tủ thuộc tòa nhà của mình');
      }
    }

    const buildingId = locker?.buildingId ?? user.buildingId;
    if (!buildingId) {
      throw new BadRequestException('Vui lòng chọn trạm tủ liên quan đến sự cố');
    }
    return { buildingId: new Types.ObjectId(String(buildingId)), locker };
  }

  // Gửi thông báo tới danh sách người nhận; lỗi gửi không bao giờ làm hỏng thao tác chính
  private async notifyUsers(
    recipientIds: Types.ObjectId[],
    issue: Pick<Issue, '_id' | 'ticketCode' | 'buildingId' | 'priority'>,
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<void> {
    await Promise.all(
      recipientIds.map((recipientId) =>
        this.notificationsService
          .createNotification({
            recipientId,
            buildingId: issue.buildingId,
            title,
            message,
            category: NotificationCategory.SYSTEM,
            type,
            priority:
              issue.priority === IssuePriority.URGENT
                ? NotificationPriority.CRITICAL
                : NotificationPriority.HIGH,
            metadata: {
              issueId: String(issue._id),
              ticketCode: issue.ticketCode,
            },
          })
          .catch((err) =>
            this.logger.warn(
              `Không gửi được thông báo phiếu ${issue.ticketCode}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          ),
      ),
    );
  }

  // Lấy mã các tài khoản đang hoạt động theo vai trò, tùy chọn giới hạn trong một tòa nhà
  private async findActiveUserIds(
    role: Role,
    buildingId?: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const users = await this.userModel
      .find({
        role,
        approvalStatus: ApprovalStatus.ACTIVE,
        ...(buildingId ? { buildingId } : {}),
      })
      .select('_id')
      .lean();
    return users.map((u) => u._id);
  }

  // Tạo phiếu báo lỗi mới kèm ảnh đính kèm tùy chọn và báo cho Ban Quản Lý của tòa nhà
  async create(user: AuthenticatedUser, dto: CreateIssueDto, files: Express.Multer.File[] = []) {
    this.assertValidAttachments(files);
    const { buildingId, locker } = await this.resolveLocation(user, dto.lockerCode);

    const reporter = await this.userModel.findById(user.userId).select('name phone email').lean();

    const uploaded = await Promise.all(
      files.map((file) => this.uploadService.uploadIssueImage(file)),
    );

    const now = new Date();
    const reporterName = reporter?.name ?? user.email;
    const issue = await this.issueModel.create({
      ticketCode: await this.nextTicketCode(),
      title: dto.title.trim(),
      description: dto.description.trim(),
      attachments: uploaded.map((item) => ({
        url: item.url,
        publicId: item.publicId,
      })),
      category: dto.category,
      priority: dto.priority ?? IssuePriority.MEDIUM,
      reporter: {
        userId: new Types.ObjectId(user.userId),
        role: user.role,
        name: reporterName,
        phone: reporter?.phone,
        email: reporter?.email ?? user.email,
      },
      buildingId,
      lockerId: locker?._id,
      timeline: [
        {
          at: now,
          actorId: new Types.ObjectId(user.userId),
          actorName: reporterName,
          note: 'Tạo phiếu',
          toStatus: IssueStatus.PENDING,
        },
      ],
    });

    const admins = (await this.findActiveUserIds(Role.BUILDING_ADMIN, buildingId)).filter(
      (id) => String(id) !== user.userId,
    );
    await this.notifyUsers(
      admins,
      issue,
      NotificationType.ISSUE_REPORTED,
      `Phiếu mới ${issue.ticketCode}`,
      `${reporterName} báo: ${issue.title}`,
    );

    await this.activityLogsService.log({
      actor: {
        userId: user.userId,
        name: reporterName,
        phone: reporter?.phone,
        role: user.role,
      },
      buildingId,
      category: ActivityCategory.ISSUE,
      status:
        issue.priority === IssuePriority.URGENT ? ActivityStatus.WARNING : ActivityStatus.INFO,
      title: 'Tạo phiếu báo lỗi',
      description: `${issue.ticketCode} - ${issue.title}`,
      target: { type: 'ISSUE', id: String(issue._id), label: issue.ticketCode },
    });

    return issue;
  }

  // Liệt kê phiếu theo phạm vi tòa nhà, mới nhất trước
  async findAll(user: AuthenticatedUser, query: QueryIssuesDto): Promise<PaginatedResult<Issue>> {
    const filter: QueryFilter<Issue> = {};

    const scope = resolveBuildingScope(user, query.buildingId);
    if (scope) filter.buildingId = scope;
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.category) filter.category = query.category;
    if (query.lockerId) filter.lockerId = new Types.ObjectId(query.lockerId);

    const term = query.search?.trim();
    if (term) {
      const contains = new RegExp(escapeRegex(term), 'i');
      filter.$or = [
        { ticketCode: new RegExp(`^${escapeRegex(term.toUpperCase())}`) },
        { title: contains },
        { 'reporter.name': contains },
        { 'reporter.phone': new RegExp(`^${escapeRegex(term)}`) },
      ];
    }

    const { page, limit } = query;
    const [data, total] = await Promise.all([
      this.issueModel
        .find(filter)
        .populate('lockerId', 'code name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<Issue[]>()
        .exec(),
      this.issueModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  // Nạp phiếu và kiểm tra người gọi có thuộc phạm vi tòa nhà của phiếu hay không
  private async loadManageableIssue(id: string, user: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Mã phiếu không hợp lệ');
    }
    const issue = await this.issueModel.findById(id);
    if (!issue) {
      throw new NotFoundException('Không tìm thấy phiếu báo lỗi');
    }
    if (!canAccessBuilding(user, issue.buildingId)) {
      throw new ForbiddenException('Bạn không có quyền xem phiếu của tòa nhà khác');
    }
    return issue;
  }

  // Lấy chi tiết một phiếu kèm dòng thời gian xử lý
  async findOne(id: string, user: AuthenticatedUser) {
    const issue = await this.loadManageableIssue(id, user);
    return issue.populate('lockerId', 'code name');
  }

  // Chuyển trạng thái xử lý theo bảng chuyển hợp lệ và ghi vào dòng thời gian
  async updateStatus(id: string, dto: UpdateIssueStatusDto, user: AuthenticatedUser) {
    const issue = await this.loadManageableIssue(id, user);
    const note = dto.note?.trim() ?? '';

    if (!ISSUE_STATUS_TRANSITIONS[issue.status].includes(dto.status)) {
      throw new BadRequestException(
        dto.status === IssueStatus.ESCALATED
          ? 'Dùng chức năng leo thang để chuyển phiếu lên Super Admin'
          : `Không thể chuyển phiếu từ ${issue.status} sang ${dto.status}`,
      );
    }
    if (issue.status === IssueStatus.ESCALATED && user.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException(
        'Phiếu đã chuyển lên Super Admin, chỉ Super Admin được xử lý tiếp',
      );
    }
    if (dto.status === IssueStatus.RESOLVED && !note) {
      throw new BadRequestException('Cần ghi chú kết quả xử lý khi hoàn tất phiếu');
    }

    const actor = await this.activityLogsService.buildActor(user);
    const set: Record<string, unknown> = { status: dto.status };
    if (dto.status === IssueStatus.RESOLVED) set.resolutionNote = note;
    if (dto.status === IssueStatus.IN_PROGRESS && !issue.assignee) {
      set.assignee = {
        userId: new Types.ObjectId(user.userId),
        name: actor.name,
      };
    }

    // Điều kiện trạng thái nằm trong truy vấn để hai quản trị viên xử lý cùng lúc chỉ một người thành công
    const updated = await this.issueModel.findOneAndUpdate(
      { _id: issue._id, status: issue.status },
      {
        $set: set,
        $push: {
          timeline: {
            at: new Date(),
            actorId: new Types.ObjectId(user.userId),
            actorName: actor.name,
            note,
            fromStatus: issue.status,
            toStatus: dto.status,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ConflictException('Phiếu vừa được người khác cập nhật, vui lòng tải lại');
    }

    if (dto.status === IssueStatus.RESOLVED && issue.reporter?.userId) {
      await this.notifyUsers(
        [issue.reporter.userId],
        issue,
        NotificationType.ISSUE_RESOLVED,
        `Phiếu ${issue.ticketCode} đã được xử lý`,
        note,
      );
    }

    await this.activityLogsService.log({
      actor,
      buildingId: issue.buildingId,
      category: ActivityCategory.ISSUE,
      status: ActivityStatus.INFO,
      title: 'Cập nhật trạng thái phiếu báo lỗi',
      description: `${issue.ticketCode}: ${issue.status} → ${dto.status}`,
      target: { type: 'ISSUE', id: String(issue._id), label: issue.ticketCode },
    });

    return updated;
  }

  // Ban Quản Lý chuyển phiếu lên Super Admin khi vượt khả năng xử lý
  async escalate(id: string, dto: EscalateIssueDto, user: AuthenticatedUser) {
    const issue = await this.loadManageableIssue(id, user);
    if (!ESCALATABLE_STATUSES.includes(issue.status)) {
      throw new ConflictException(`Không thể leo thang phiếu đang ở trạng thái ${issue.status}`);
    }

    const actor = await this.activityLogsService.buildActor(user);
    const updated = await this.issueModel.findOneAndUpdate(
      { _id: issue._id, status: { $in: ESCALATABLE_STATUSES } },
      {
        $set: {
          status: IssueStatus.ESCALATED,
          escalatedToSuperAdmin: true,
        },
        $push: {
          timeline: {
            at: new Date(),
            actorId: new Types.ObjectId(user.userId),
            actorName: actor.name,
            note: dto.note?.trim() || 'Leo thang lên Super Admin',
            fromStatus: issue.status,
            toStatus: IssueStatus.ESCALATED,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new ConflictException('Phiếu vừa được người khác cập nhật, vui lòng tải lại');
    }

    await this.notifyUsers(
      await this.findActiveUserIds(Role.SYSTEM_ADMIN),
      issue,
      NotificationType.ISSUE_ESCALATED,
      `Phiếu ${issue.ticketCode} được leo thang`,
      issue.title,
    );

    await this.activityLogsService.log({
      actor,
      buildingId: issue.buildingId,
      category: ActivityCategory.ISSUE,
      status: ActivityStatus.WARNING,
      title: 'Leo thang phiếu báo lỗi lên Super Admin',
      description: `${issue.ticketCode} - ${issue.title}`,
      target: { type: 'ISSUE', id: String(issue._id), label: issue.ticketCode },
    });

    return updated;
  }
}
