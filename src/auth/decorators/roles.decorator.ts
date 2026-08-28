import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

// Decorator gắn danh sách các vai trò được phép truy cập vào route handler
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
