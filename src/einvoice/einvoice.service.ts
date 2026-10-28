import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { Package } from '../packages/schemas/package.schema';
import { User } from '../users/schemas/user.schema';
import { MailService } from '../mail/mail.service';
import { SepayEInvoiceClient } from './sepay-einvoice.client';
import { CreateCheckResult, EInvoiceApiError, IssuedInvoice } from './einvoice.types';
import { buildInvoicePayload, buildReferenceCode } from './utils/build-invoice-payload.util';
import { getErrorMessage } from '../common/utils/text.util';

const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2500;
const DOCUMENT_EXISTED_CODE = 'EINVOICE_DOCUMENT_EXISTED';
const PDF_DOWNLOAD_TIMEOUT_MS = 15000;
const PDF_MAX_BYTES = 5 * 1024 * 1024;

// Dịch vụ phát hành hóa đơn điện tử sandbox cho một thanh toán đã hoàn tất rồi gửi link hóa đơn qua email cho cư dân
@Injectable()
export class EInvoiceService {
  private readonly logger = new Logger(EInvoiceService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Package.name) private readonly packageModel: Model<Package>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly client: SepayEInvoiceClient,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  // Phát hành hóa đơn cho thanh toán vừa hoàn tất; không bao giờ ném lỗi để không ảnh hưởng luồng thanh toán
  async issueForPayment(payment: PaymentDocument): Promise<void> {
    try {
      await this.run(payment);
    } catch (error) {
      this.logger.error(
        `Lỗi không mong đợi khi phát hành hóa đơn cho đơn #${payment.orderCode}: ${error instanceof Error ? error.message : String(error)}`,
        `Lỗi không mong đợi khi phát hành hóa đơn cho đơn #${payment.orderCode}: ${getErrorMessage(error)}`,
      );
    }
  }

  // Kiểm tra điều kiện, đánh dấu đang xử lý rồi chạy tuần tự tạo hóa đơn, chờ kết quả và gửi email
  private async run(payment: PaymentDocument): Promise<void> {
    if (!this.client.isEnabled()) return;

    if (!payment.userId) {
      this.logger.log(`[EINVOICE] Đơn #${payment.orderCode} không có cư dân nhận, bỏ qua hóa đơn`);
      return;
    }

    const user = await this.userModel.findById(payment.userId).select('name email phone').lean();
    if (!user?.email) {
      this.logger.log(
        `[EINVOICE] Cư dân của đơn #${payment.orderCode} chưa có email, bỏ qua hóa đơn`,
      );
      return;
    }

    const referenceCode = buildReferenceCode(payment.orderCode);
    const claimed = await this.paymentModel.updateOne(
      { _id: payment._id, eInvoice: { $exists: false } },
      { $set: { eInvoice: { status: 'PROCESSING', referenceCode } } },
    );
    if (claimed.modifiedCount === 0) {
      this.logger.log(`[EINVOICE] Đơn #${payment.orderCode} đã có hóa đơn hoặc đang được xử lý`);
      return;
    }

    try {
      const trackingNumber = await this.findTrackingNumber(payment);
      const templateCode = this.configService.get<string>('EINVOICE_TEMPLATE_CODE') || '2';
      const payload = buildInvoicePayload({
        orderCode: payment.orderCode,
        amount: payment.amount,
        paymentType: payment.paymentType,
        trackingNumber,
        buyerName: user.name,
        buyerEmail: user.email,
        buyerPhone: user.phone,
        templateCode,
        invoiceSeries: await this.client.getInvoiceSeries(templateCode),
        providerAccountId: this.configService.get<string>('EINVOICE_PROVIDER_ACCOUNT_ID') as string,
        issuedAt: new Date(),
      });

      const trackingCode = await this.createOrReuse(payload, referenceCode);
      const invoice = await this.waitUntilIssued(trackingCode);

      await this.paymentModel.updateOne(
        { _id: payment._id },
        {
          $set: {
            'eInvoice.invoiceNumber': invoice.invoice_number,
            'eInvoice.pdfUrl': invoice.pdf_url,
          },
        },
      );

      const displayNumber = `${invoice.invoice_series}${invoice.invoice_number}`;
      const pdfContent = await this.downloadPdf(invoice.pdf_url);

      const sent = await this.mailService.sendInvoiceEmail(user.email, user.name, {
        invoiceNumber: displayNumber,
        amount: payment.amount,
        description: payload.items[0].item_name,
        pdfUrl: invoice.pdf_url,
        issuedAt: new Date(),
        pdf: pdfContent ? { filename: `${displayNumber}.pdf`, content: pdfContent } : undefined,
      });
      if (!sent) throw new Error('Gửi email hóa đơn không thành công');

      await this.paymentModel.updateOne(
        { _id: payment._id },
        {
          $set: {
            'eInvoice.status': 'EMAILED',
            'eInvoice.emailedAt': new Date(),
          },
        },
      );
      this.logger.log(
        `[EINVOICE] Đơn #${payment.orderCode} đã phát hành hóa đơn ${invoice.invoice_number} và gửi email`,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      await this.paymentModel.updateOne(
        { _id: payment._id },
        { $set: { 'eInvoice.status': 'FAILED', 'eInvoice.lastError': message } },
      );
      this.logger.error(`[EINVOICE] Đơn #${payment.orderCode} thất bại: ${message}`);
    }
  }

  // Tạo hóa đơn; nếu mã tham chiếu đã tồn tại thì dùng lại và chỉ hỏi trạng thái
  private async createOrReuse(
    payload: Parameters<SepayEInvoiceClient['createInvoice']>[0],
    referenceCode: string,
  ): Promise<string> {
    try {
      return await this.client.createInvoice(payload);
    } catch (error) {
      if (error instanceof EInvoiceApiError && error.code === DOCUMENT_EXISTED_CODE) {
        return referenceCode;
      }
      throw error;
    }
  }

  // Hỏi trạng thái tạo hóa đơn vài lần ngắn: Pending thì chờ tiếp, Success thì trả hóa đơn, giá trị khác là lỗi
  private async waitUntilIssued(trackingCode: string): Promise<IssuedInvoice> {
    let last: CreateCheckResult | null = null;
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      last = await this.client.checkCreate(trackingCode);
      const status = String(last.status).toLowerCase();

      if (status === 'success' && last.invoice) return last.invoice;
      if (status !== 'pending' && status !== 'success') {
        throw new Error(`SePay trả trạng thái ${last.status}: ${last.message ?? ''}`);
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `Hóa đơn chưa hoàn tất sau ${POLL_ATTEMPTS} lần kiểm tra (trạng thái cuối: ${last?.status})`,
    );
  }

  // Tải file PDF hóa đơn để đính kèm email; lỗi, quá lớn hoặc không phải PDF thì trả null để email vẫn gửi kèm link
  private async downloadPdf(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(PDF_DOWNLOAD_TIMEOUT_MS),
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !contentType.includes('pdf')) {
        this.logger.warn(
          `[EINVOICE] Không tải được PDF (mã ${response.status}, loại ${contentType}), gửi email kèm link`,
        );
        return null;
      }

      const content = Buffer.from(await response.arrayBuffer());
      if (content.length === 0 || content.length > PDF_MAX_BYTES) {
        this.logger.warn(
          `[EINVOICE] PDF có kích thước ${content.length} byte không hợp lệ, gửi email kèm link`,
        );
        return null;
      }
      return content;
    } catch (error) {
      this.logger.warn(
        `[EINVOICE] Lỗi khi tải PDF: ${error instanceof Error ? error.message : String(error)}, gửi email kèm link`,
        `[EINVOICE] Lỗi khi tải PDF: ${getErrorMessage(error)}, gửi email kèm link`,
      );
      return null;
    }
  }

  // Lấy mã vận đơn của kiện hàng gắn với thanh toán để ghi vào tên hàng
  private async findTrackingNumber(payment: PaymentDocument): Promise<string | undefined> {
    if (!payment.packageId) return undefined;
    const pkg = await this.packageModel.findById(payment.packageId).select('trackingNumber').lean();
    return pkg?.trackingNumber;
  }

  // Chờ một khoảng giữa các lần hỏi trạng thái
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
