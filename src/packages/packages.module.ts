import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Package, PackageSchema } from './schemas/package.schema';
import {
  LockerLog,
  LockerLogSchema,
} from '../lockers/schemas/locker-log.schema';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { Box, BoxSchema } from '../lockers/schemas/box.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Package.name, schema: PackageSchema },
      { name: LockerLog.name, schema: LockerLogSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Box.name, schema: BoxSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
