import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Issue, IssueSchema } from './schemas/issue.schema';
import { COUNTER_MODEL_NAME, CounterSchema } from './schemas/counter.schema';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UploadModule } from '../upload/upload.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Issue.name, schema: IssueSchema },
      { name: COUNTER_MODEL_NAME, schema: CounterSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: User.name, schema: UserSchema },
    ]),
    UploadModule,
    NotificationsModule,
    ActivityLogsModule,
  ],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
