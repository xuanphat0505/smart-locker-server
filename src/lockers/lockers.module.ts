import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Locker, LockerSchema } from './schemas/locker.schema';
import { Box, BoxSchema } from './schemas/box.schema';
import { LockerLog, LockerLogSchema } from './schemas/locker-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Building, BuildingSchema } from '../buildings/schemas/building.schema';
import { LockersController } from './lockers.controller';
import { LockersService } from './lockers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Locker.name, schema: LockerSchema },
      { name: Box.name, schema: BoxSchema },
      { name: LockerLog.name, schema: LockerLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Building.name, schema: BuildingSchema },
    ]),
  ],
  controllers: [LockersController],
  providers: [LockersService],
  exports: [LockersService, MongooseModule],
})
export class LockersModule {}
