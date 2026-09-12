import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';
import { NotificationsController } from './notifications.controller';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    PushNotificationsService,
  ],
  exports: [
    NotificationsGateway,
    NotificationsService,
    PushNotificationsService,
  ],
})
export class NotificationsModule {}
