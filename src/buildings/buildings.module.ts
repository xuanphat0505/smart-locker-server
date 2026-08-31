import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BuildingsController } from './buildings.controller';
import { BuildingsService } from './buildings.service';
import { Building, BuildingSchema } from './schemas/building.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Building.name, schema: BuildingSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService, MongooseModule],
})
export class BuildingsModule {}
