import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Package, PackageSchema } from '../packages/schemas/package.schema';
import { Building, BuildingSchema } from '../buildings/schemas/building.schema';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { Box, BoxSchema } from '../lockers/schemas/box.schema';
import {
  LockerLog,
  LockerLogSchema,
} from '../lockers/schemas/locker-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Package.name, schema: PackageSchema },
      { name: Building.name, schema: BuildingSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Box.name, schema: BoxSchema },
      { name: LockerLog.name, schema: LockerLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    MqttModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, MongooseModule],
})
export class PaymentsModule {}
