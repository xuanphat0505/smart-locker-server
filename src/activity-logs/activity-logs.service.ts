import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';
import { ActivityLog } from './schemas/activity-log.schema';
import { LockerLog } from '../lockers/schemas/locker-log.schema';
import { User } from '../users/schemas/user.schema';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { resolveBuildingScope, toObjectIdOrUndefined } from '../common/utils/building-scope.util';
import { escapeRegex } from '../common/utils/escape-regex.util';
import { buildLockerActivityEntry } from './utils/build-locker-activity';
import { ActivityLogStatsQueryDto, QueryActivityLogDto } from './dto/query-activity-log.dto';
import {
  ActivityActorInput,
  CreateActivityLogInput,
  LockerActionInput,
} from './interfaces/activity-log.interface';

const DEFAULT_STATS_RANGE_DAYS = 30;
const MAX_STATS_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    @InjectModel(ActivityLog.name)
    private readonly activityLogModel: Model<ActivityLog>,
    @InjectModel(LockerLog.name)
    private readonly lockerLogModel: Model<LockerLog>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) { }

  // Ghi một bản ghi nhật ký thao tác; lỗi chỉ được cảnh báo và không bao giờ làm hỏng nghiệp vụ gọi nó
  async log(input: CreateActivityLogInput): Promise<void> {
    try {
      await this.activityLogModel.create({
        actor: {
          ...input.actor,
          userId: toObjectIdOrUndefined(input.actor.userId),
        },
        buildingId: toObjectIdOrUndefined(input.buildingId),
        category: input.category,
        status: input.status,
        title: input.title,
        description: input.description,
        target: input.target,
        metadata: input.metadata,
      });
    } catch (err) {
      this.logger.warn(
        `Không ghi được nhật ký thao tác "${input.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Ghi nhật ký phần cứng LockerLog như trước đây rồi ghi thêm ActivityLog tương ứng cho trang quản trị
  async recordLockerAction(input: LockerActionInput): Promise<void> {
    await this.lockerLogModel.create({
      lockerId: input.locker._id as Types.ObjectId,
      boxNumber: input.boxNumber,
      packageId: input.packageId,
      action: input.action,
      performedBy: input.performedBy,
      status: input.status,
      metadata: input.metadata,
    });

    await this.log(buildLockerActivityEntry(input));
  }

  // Dựng thông tin người thực hiện từ tài khoản quản trị đang đăng nhập
  async buildActor(user: AuthenticatedUser): Promise<ActivityActorInput> {
    const account = await this.userModel.findById(user.userId).select('name phone').lean();

    return {
      userId: user.userId,
      name: account?.name ?? user.email,
      phone: account?.phone,
      role: user.role,
    };
  }

  // Dựng điều kiện lọc dùng chung cho danh sách và thống kê, luôn bị giới hạn theo phạm vi tòa nhà
  private buildFilter(
    user: AuthenticatedUser,
    query: ActivityLogStatsQueryDto,
    range?: { from: Date; to: Date },
  ): QueryFilter<ActivityLog> {
    const filter: QueryFilter<ActivityLog> = {};

    const scope = resolveBuildingScope(user, query.buildingId);
    if (scope) filter.buildingId = scope;

    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.actorRole) filter['actor.role'] = query.actorRole;
    if (query.actorId) filter['actor.userId'] = new Types.ObjectId(query.actorId);

    const from = range?.from ?? (query.from ? new Date(query.from) : undefined);
    const to = range?.to ?? (query.to ? new Date(query.to) : undefined);
    if (from && to && from > to) {
      throw new BadRequestException('Thời gian bắt đầu phải trước thời gian kết thúc');
    }
    if (from || to) {
      filter.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const term = query.search?.trim();
    if (term) {
      const contains = new RegExp(escapeRegex(term), 'i');
      filter.$or = [
        { 'actor.name': contains },
        { 'actor.phone': contains },
        { title: contains },
        { 'target.label': contains },
      ];
    }

    return filter;
  }

  // Lấy danh sách nhật ký thao tác theo phạm vi quyền, mới nhất trước
  async findAll(
    user: AuthenticatedUser,
    query: QueryActivityLogDto,
  ): Promise<PaginatedResult<ActivityLog>> {
    const filter = this.buildFilter(user, query);
    const { page, limit } = query;

    const [data, total] = await Promise.all([
      this.activityLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ActivityLog[]>()
        .exec(),
      this.activityLogModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  // Thống kê nhật ký theo trạng thái, nhóm nghiệp vụ và ngày trong một khoảng thời gian
  async getStats(user: AuthenticatedUser, query: ActivityLogStatsQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_STATS_RANGE_DAYS * DAY_MS);

    if ((to.getTime() - from.getTime()) / DAY_MS > MAX_STATS_RANGE_DAYS) {
      throw new BadRequestException(`Khoảng thống kê tối đa ${MAX_STATS_RANGE_DAYS} ngày`);
    }

    const filter = this.buildFilter(user, query, { from, to });

    const [result] = await this.activityLogModel
      .aggregate<{
        total: { n: number }[];
        byStatus: { _id: string; count: number }[];
        byCategory: { _id: string; count: number }[];
        byDay: { _id: string; count: number }[];
      }>([
        { $match: filter },
        {
          $facet: {
            total: [{ $count: 'n' }],
            byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: REPORT_TIMEZONE,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
          },
        },
      ])
      .exec();

    const toMap = (rows: { _id: string; count: number }[]) =>
      Object.fromEntries(rows.map((row) => [row._id, row.count]));

    return {
      from,
      to,
      total: result?.total[0]?.n ?? 0,
      byStatus: toMap(result?.byStatus ?? []),
      byCategory: toMap(result?.byCategory ?? []),
      byDay: (result?.byDay ?? []).map((row) => ({
        date: row._id,
        count: row.count,
      })),
    };
  }
}
