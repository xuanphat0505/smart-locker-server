import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Package, PackageSchema } from '../packages/schemas/package.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MailModule } from '../mail/mail.module';
import { EInvoiceService } from './einvoice.service';
import { SepayEInvoiceClient } from './sepay-einvoice.client';

@Module({
  imports: [
    ConfigModule,
    MailModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Package.name, schema: PackageSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [EInvoiceService, SepayEInvoiceClient],
  exports: [EInvoiceService],
})
export class EInvoiceModule {}
