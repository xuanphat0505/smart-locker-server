import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AntiSpoofingService } from './services/anti-spoofing.service';
import { FaceRecognitionService } from './services/face-recognition.service';
import { FaceVerificationService } from './services/face-verification.service';
import { FaceDetectorService } from './services/face-detector.service';
import { AiController } from './ai.controller';
import { Package, PackageSchema } from '../packages/schemas/package.schema';
import { Locker, LockerSchema } from '../lockers/schemas/locker.schema';
import { Box, BoxSchema } from '../lockers/schemas/box.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MqttModule } from '../mqtt/mqtt.module';
import { PaymentsModule } from '../payments/payments.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Package.name, schema: PackageSchema },
      { name: Locker.name, schema: LockerSchema },
      { name: Box.name, schema: BoxSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MqttModule,
    PaymentsModule,
    ActivityLogsModule,
  ],
  controllers: [AiController],
  providers: [
    AntiSpoofingService,
    FaceRecognitionService,
    FaceVerificationService,
    FaceDetectorService,
  ],
  exports: [
    AntiSpoofingService,
    FaceRecognitionService,
    FaceVerificationService,
    FaceDetectorService,
  ],
})
export class AiModule {}
