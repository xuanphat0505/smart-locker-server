import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MqttService } from './mqtt.service';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { NotificationsModule } from '../notifications/notifications.module';

// Module quản lý giao tiếp MQTT giữa hệ thống máy chủ và các trạm tủ IoT
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Locker.name, schema: LockerSchema }]),
    forwardRef(() => NotificationsModule),
  ],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
