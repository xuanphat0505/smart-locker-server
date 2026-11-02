import { ForbiddenException } from '@nestjs/common';
import { ApprovalStatus } from '../enums/approval-status.enum';

// Chỉ tài khoản đã được duyệt và đang hoạt động mới được tự sửa hồ sơ cá nhân
export function assertActiveAccount(status?: ApprovalStatus): void {
  if (status !== ApprovalStatus.ACTIVE) {
    throw new ForbiddenException(
      'Chỉ tài khoản đang hoạt động mới được cập nhật hồ sơ cá nhân',
    );
  }
}
