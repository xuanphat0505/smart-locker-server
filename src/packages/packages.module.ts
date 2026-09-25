import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Package,
  PackageSchema,
  ShipperSession,
  ShipperSessionSchema,
} from './schemas';
import {
  LockerLog,
  LockerLogSchema,
} from '../lockers/schemas/locker-log.schema';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { Box, BoxSchema } from '../lockers/schemas/box.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { PickupAuthGuard } from '../auth/guards/pickup-auth.guard';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Package.name, schema: PackageSchema },
      { name: ShipperSession.name, schema: ShipperSessionSchema },
      { name: LockerLog.name, schema: LockerLogSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Box.name, schema: BoxSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    NotificationsModule,
    MqttModule,
    AiModule,
  ],
  controllers: [PackagesController],
  providers: [PackagesService, PickupAuthGuard],
  exports: [PackagesService],
})
export class PackagesModule {}
