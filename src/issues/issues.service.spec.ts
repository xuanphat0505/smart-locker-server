import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { IssuesService } from './issues.service';
import {
  IssueCategory,
  IssuePriority,
  IssueStatus,
} from './enums/issue.enums';

const buildingA = new Types.ObjectId();
const buildingB = new Types.ObjectId();

const userOf = (
  role: Role,
  buildingId?: Types.ObjectId,
): AuthenticatedUser => ({
  userId: new Types.ObjectId().toString(),
  email: 'user@example.com',
  role,
  buildingId: buildingId ? String(buildingId) : undefined,
});

describe('IssuesService', () => {
  const makeIssue = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    ticketCode: 'TK-0001',
    title: 'Ngăn số 4 không mở được',
    status: IssueStatus.PENDING,
    priority: IssuePriority.MEDIUM,
    buildingId: buildingA,
    reporter: { userId: new Types.ObjectId() },
    ...over,
  });

  const make = (issue = makeIssue()) => {
    let seq = 0;
    const counterModel = {
      // Mô phỏng $inc nguyên tử: mỗi lần gọi tăng đúng một đơn vị
      findOneAndUpdate: jest.fn().mockImplementation(() =>
        Promise.resolve({ seq: ++seq }),
      ),
    };
    const issueModel = {
      findById: jest.fn().mockResolvedValue(issue),
      findOneAndUpdate: jest.fn().mockResolvedValue({ ...issue }),
      create: jest.fn().mockImplementation((doc: Record<string, unknown>) =>
        Promise.resolve({ _id: new Types.ObjectId(), ...doc }),
      ),
    };
    const lockerModel = { findOne: jest.fn().mockResolvedValue(null) };
    const userModel = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve({ name: 'Nguyen Van A', phone: '0912345678', email: 'a@x.vn' }),
        }),
      }),
      find: jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ _id: new Types.ObjectId() }]) }),
      }),
    };
    const upload = {
      uploadIssueImage: jest.fn().mockResolvedValue({ url: 'u', publicId: 'p' }),
    };
    const notifications = {
      createNotification: jest.fn().mockResolvedValue({}),
    };
    const activity = {
      log: jest.fn().mockResolvedValue(undefined),
      buildActor: jest.fn().mockResolvedValue({ name: 'BQL', role: Role.BUILDING_ADMIN }),
    };
    const service = new IssuesService(
      issueModel as never,
      counterModel as never,
      lockerModel as never,
      userModel as never,
      upload as never,
      notifications as never,
      activity as never,
    );
    return { service, issueModel, lockerModel, upload, notifications, counterModel };
  };

  describe('mã phiếu', () => {
    it('tạo đồng thời 20 phiếu không trùng mã và đúng định dạng TK-0001', async () => {
      const { service } = make();
      const codes = await Promise.all(
        Array.from({ length: 20 }, () => service.nextTicketCode()),
      );

      expect(new Set(codes).size).toBe(20);
      expect(codes[0]).toMatch(/^TK-\d{4}$/);
      expect(codes).toContain('TK-0001');
      expect(codes).toContain('TK-0020');
    });
  });

  describe('create', () => {
    const dto = {
      title: 'Ngăn số 4 không mở được',
      description: 'Nhập đúng OTP nhưng cửa không bật',
      category: IssueCategory.LOCKER,
    };

    it('cư dân báo trong tòa của mình, báo cho Ban Quản Lý', async () => {
      const { service, issueModel, notifications } = make();
      const resident = userOf(Role.RESIDENT, buildingA);

      const created = await service.create(resident, dto);

      expect(created.ticketCode).toBe('TK-0001');
      const [doc] = issueModel.create.mock.calls[0] as [
        { status?: IssueStatus; priority: IssuePriority; timeline: unknown[] },
      ];
      expect(doc.priority).toBe(IssuePriority.MEDIUM);
      expect(doc.timeline).toHaveLength(1);
      expect(notifications.createNotification).toHaveBeenCalled();
    });

    it('tài xế không có tòa nhà phải truyền lockerCode', async () => {
      const { service } = make();
      await expect(
        service.create(userOf(Role.SHIPPER), dto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cư dân không báo được cho trạm tủ của tòa khác', async () => {
      const { service, lockerModel } = make();
      lockerModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        buildingId: buildingB,
      });

      await expect(
        service.create(userOf(Role.RESIDENT, buildingA), {
          ...dto,
          lockerCode: 'LK-OTHER',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('từ chối ảnh sai loại hoặc quá nhiều ảnh, không tải gì lên', async () => {
      const { service, upload } = make();
      const resident = userOf(Role.RESIDENT, buildingA);
      const file = (mimetype: string, size = 1000) =>
        ({ mimetype, size }) as Express.Multer.File;

      await expect(
        service.create(resident, dto, [file('application/pdf')]),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(resident, dto, [file('image/png', 6 * 1024 * 1024)]),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(resident, dto, Array.from({ length: 4 }, () => file('image/png'))),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upload.uploadIssueImage).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('BQL tòa khác không xem hay sửa được phiếu', async () => {
      const { service } = make();
      await expect(
        service.updateStatus(
          String(new Types.ObjectId()),
          { status: IssueStatus.IN_PROGRESS },
          userOf(Role.BUILDING_ADMIN, buildingB),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chuyển trạng thái không hợp lệ bị từ chối, gợi ý dùng leo thang', async () => {
      const { service } = make();
      const bql = userOf(Role.BUILDING_ADMIN, buildingA);

      await expect(
        service.updateStatus(String(new Types.ObjectId()), { status: IssueStatus.CLOSED }, bql),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateStatus(String(new Types.ObjectId()), { status: IssueStatus.ESCALATED }, bql),
      ).rejects.toThrow('leo thang');
    });

    it('hoàn tất phiếu bắt buộc có ghi chú', async () => {
      const { service } = make();
      await expect(
        service.updateStatus(
          String(new Types.ObjectId()),
          { status: IssueStatus.RESOLVED },
          userOf(Role.BUILDING_ADMIN, buildingA),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('phiếu đã leo thang chỉ System Admin được xử lý tiếp', async () => {
      const { service } = make(makeIssue({ status: IssueStatus.ESCALATED }));

      await expect(
        service.updateStatus(
          String(new Types.ObjectId()),
          { status: IssueStatus.IN_PROGRESS },
          userOf(Role.BUILDING_ADMIN, buildingA),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.updateStatus(
          String(new Types.ObjectId()),
          { status: IssueStatus.IN_PROGRESS },
          userOf(Role.SYSTEM_ADMIN),
        ),
      ).resolves.toBeDefined();
    });

    it('hai người cùng đổi một phiếu thì người sau nhận 409', async () => {
      const { service, issueModel } = make();
      issueModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          String(new Types.ObjectId()),
          { status: IssueStatus.IN_PROGRESS },
          userOf(Role.BUILDING_ADMIN, buildingA),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('chuyển sang xử lý thì gán người phụ trách và ghi dòng thời gian', async () => {
      const { service, issueModel } = make();
      await service.updateStatus(
        String(new Types.ObjectId()),
        { status: IssueStatus.IN_PROGRESS, note: 'Đang kiểm tra' },
        userOf(Role.BUILDING_ADMIN, buildingA),
      );

      const [, update] = issueModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        {
          $set: { status: IssueStatus; assignee?: unknown };
          $push: { timeline: { fromStatus: IssueStatus; toStatus: IssueStatus } };
        },
      ];
      expect(update.$set.status).toBe(IssueStatus.IN_PROGRESS);
      expect(update.$set.assignee).toBeDefined();
      expect(update.$push.timeline).toMatchObject({
        fromStatus: IssueStatus.PENDING,
        toStatus: IssueStatus.IN_PROGRESS,
      });
    });
  });

  describe('escalate', () => {
    it('chỉ leo thang được phiếu đang chờ hoặc đang xử lý', async () => {
      const bql = userOf(Role.BUILDING_ADMIN, buildingA);

      const resolved = make(makeIssue({ status: IssueStatus.RESOLVED }));
      await expect(
        resolved.service.escalate(String(new Types.ObjectId()), {}, bql),
      ).rejects.toBeInstanceOf(ConflictException);

      const pending = make();
      const result = await pending.service.escalate(String(new Types.ObjectId()), {}, bql);
      expect(result).toBeDefined();
      const [, update] = pending.issueModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: { status: IssueStatus; escalatedToSuperAdmin: boolean } },
      ];
      expect(update.$set).toMatchObject({
        status: IssueStatus.ESCALATED,
        escalatedToSuperAdmin: true,
      });
      expect(pending.notifications.createNotification).toHaveBeenCalled();
    });
  });
});
