import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Package,
  PackageSchema,
  ShipperSession,
  ShipperSessionSchema,
} from './schemas';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { Box, BoxSchema } from '../lockers/schemas/box.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Building, BuildingSchema } from '../buildings/schemas/building.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { PaymentsModule } from '../payments/payments.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PickupAuthGuard } from '../auth/guards/pickup-auth.guard';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { PackagesAdminService } from './packages-admin.service';
import { DepositWatcherService } from './deposit-watcher.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Package.name, schema: PackageSchema },
      { name: ShipperSession.name, schema: ShipperSessionSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Box.name, schema: BoxSchema },
      { name: User.name, schema: UserSchema },
      { name: Building.name, schema: BuildingSchema },
    ]),
    AuthModule,
    NotificationsModule,
    MqttModule,
    AiModule,
    PaymentsModule,
    ActivityLogsModule,
  ],
  controllers: [PackagesController],
  providers: [
    PackagesService,
    PackagesAdminService,
    DepositWatcherService,
    PickupAuthGuard,
  ],
  exports: [PackagesService],
})
export class PackagesModule {}
