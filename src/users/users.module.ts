import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { Package, PackageSchema } from '../packages/schemas/package.schema';

import { BuildingsModule } from '../buildings/buildings.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';
import { AiModule } from '../ai/ai.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Package.name, schema: PackageSchema },
    ]),
    BuildingsModule,
    MailModule,
    NotificationsModule,
    UploadModule,
    AiModule,
    ActivityLogsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
