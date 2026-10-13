import { Role } from '../../auth/enums/role.enum';
import { LockerAction } from '../../lockers/enums/locker.enums';
import {
  ActivityActorRole,
  ActivityCategory,
  ActivityStatus,
} from '../enums/activity-log.enums';

interface LockerActionActivity {
  category: ActivityCategory;
  title: string;
  defaultActorRole: ActivityActorRole;
  defaultStatus: ActivityStatus;
}

// Bảng ánh xạ duy nhất từ hành động tác động tủ sang nội dung hiển thị trong nhật ký thao tác
export const LOCKER_ACTION_ACTIVITY: Record<LockerAction, LockerActionActivity> =
  {
    [LockerAction.DROP_OFF]: {
      category: ActivityCategory.PACKAGE,
      title: 'Shipper gửi bưu kiện vào tủ',
      defaultActorRole: Role.SHIPPER,
      defaultStatus: ActivityStatus.SUCCESS,
    },
    [LockerAction.PICKUP_OTP]: {
      category: ActivityCategory.PICKUP,
      title: 'Cư dân nhận hàng bằng mã OTP',
      defaultActorRole: Role.RESIDENT,
      defaultStatus: ActivityStatus.SUCCESS,
    },
    [LockerAction.PICKUP_QR]: {
      category: ActivityCategory.PICKUP,
      title: 'Cư dân nhận hàng bằng mã QR',
      defaultActorRole: Role.RESIDENT,
      defaultStatus: ActivityStatus.SUCCESS,
    },
    [LockerAction.PICKUP_FACE_ID]: {
      category: ActivityCategory.PICKUP,
      title: 'Cư dân nhận hàng bằng khuôn mặt',
      defaultActorRole: Role.RESIDENT,
      defaultStatus: ActivityStatus.SUCCESS,
    },
    [LockerAction.REMOTE_OPEN]: {
      category: ActivityCategory.LOCKER,
      title: 'Mở khóa ngăn tủ từ xa',
      defaultActorRole: Role.BUILDING_ADMIN,
      defaultStatus: ActivityStatus.WARNING,
    },
    [LockerAction.FORCE_OPEN]: {
      category: ActivityCategory.LOCKER,
      title: 'Mở cưỡng bức ngăn tủ',
      defaultActorRole: Role.BUILDING_ADMIN,
      defaultStatus: ActivityStatus.WARNING,
    },
    [LockerAction.OVERDUE_RETRIEVAL]: {
      category: ActivityCategory.PACKAGE,
      title: 'Thu hồi bưu kiện quá hạn về kho',
      defaultActorRole: Role.BUILDING_ADMIN,
      defaultStatus: ActivityStatus.INFO,
    },
  };
