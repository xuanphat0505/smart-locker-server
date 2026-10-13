import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityLog, ActivityLogSchema } from './schemas/activity-log.schema';
import {
  LockerLog,
  LockerLogSchema,
} from '../lockers/schemas/locker-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ActivityLogsController } from './activity-logs.controller';
import { ActivityLogsService } from './activity-logs.service';

// Module nhật ký thao tác chỉ phụ thuộc Mongoose nên có thể được mọi module nghiệp vụ import mà không tạo vòng phụ thuộc
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActivityLog.name, schema: ActivityLogSchema },
      { name: LockerLog.name, schema: LockerLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
