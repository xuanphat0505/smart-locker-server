import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateCheckResult,
  CreateInvoicePayload,
  EInvoiceApiError,
} from './einvoice.types';

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

interface CachedSeries {
  templateCode: string;
  year: number;
  series: string;
}

// Bóc lớp bọc dữ liệu { data: ... } thường gặp ở phản hồi của SePay
function unwrap<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

// Máy khách gọi API hóa đơn điện tử SePay: lấy và giữ token, tạo hóa đơn, hỏi trạng thái, đọc seri hóa đơn
@Injectable()
export class SepayEInvoiceClient {
  private token: CachedToken | null = null;
  private cachedSeries: CachedSeries | null = null;

  constructor(private readonly configService: ConfigService) {}

  // Cho biết tính năng hóa đơn điện tử có được bật và đủ cấu hình hay không
  isEnabled(): boolean {
    return (
      this.configService.get<string>('EINVOICE_ENABLED') === 'true' &&
      Boolean(this.configService.get<string>('EINVOICE_BASE_URL')) &&
      Boolean(this.configService.get<string>('EINVOICE_CLIENT_ID')) &&
      Boolean(this.configService.get<string>('EINVOICE_CLIENT_SECRET')) &&
      Boolean(this.configService.get<string>('EINVOICE_PROVIDER_ACCOUNT_ID'))
    );
  }

  // Lấy seri hóa đơn của mẫu đang dùng từ tài khoản nhà cung cấp, lưu tạm theo năm để không gọi lại mỗi lần
  async getInvoiceSeries(templateCode: string): Promise<string> {
    const year = new Date().getFullYear();
    if (
      this.cachedSeries &&
      this.cachedSeries.templateCode === templateCode &&
      this.cachedSeries.year === year
    ) {
      return this.cachedSeries.series;
    }

    const providerAccountId = this.requireConfig('EINVOICE_PROVIDER_ACCOUNT_ID');
    const account = await this.request<{
      templates?: { template_code: string; invoice_series: string }[];
    }>(`/v1/provider-accounts/${providerAccountId}`);

    const template = account.templates?.find(
      (item) => item.template_code === templateCode,
    );
    if (!template) {
      throw new EInvoiceApiError(
        `Tài khoản nhà cung cấp không có mẫu hóa đơn ${templateCode}`,
        0,
      );
    }

    this.cachedSeries = { templateCode, year, series: template.invoice_series };
    return template.invoice_series;
  }

  // Gửi yêu cầu tạo hóa đơn và trả về mã theo dõi dùng để hỏi trạng thái
  async createInvoice(payload: CreateInvoicePayload): Promise<string> {
    const result = await this.request<{ tracking_code: string }>(
      '/v1/invoices/create',
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return result.tracking_code;
  }

  // Hỏi trạng thái tạo hóa đơn: Pending khi đang xử lý, Success kèm thông tin hóa đơn khi xong
  async checkCreate(trackingCode: string): Promise<CreateCheckResult> {
    return this.request<CreateCheckResult>(
      `/v1/invoices/create/check/${encodeURIComponent(trackingCode)}`,
    );
  }

  // Đọc một biến cấu hình bắt buộc
  private requireConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new EInvoiceApiError(`Thiếu cấu hình ${name}`, 0);
    }
    return value;
  }

  // Lấy token bằng Basic Auth, dùng lại token còn hạn và làm mới khi sắp hết hạn
  private async getToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.token &&
      this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()
    ) {
      return this.token.value;
    }

    const clientId = this.requireConfig('EINVOICE_CLIENT_ID');
    const clientSecret = this.requireConfig('EINVOICE_CLIENT_SECRET');
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(`${this.baseUrl()}/v1/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    });
    const body = await this.readBody(response);
    if (!response.ok) throw this.toError(response.status, body, '/v1/token');

    const payload = unwrap<{ access_token?: string; expires_in?: number }>(body);
    const accessToken =
      payload?.access_token ?? (body as { access_token?: string })?.access_token;
    if (!accessToken) {
      throw new EInvoiceApiError('Phản hồi lấy token không có access_token', response.status);
    }

    const ttlMs = payload?.expires_in
      ? payload.expires_in * 1000
      : DEFAULT_TOKEN_TTL_MS;
    this.token = { value: accessToken, expiresAt: Date.now() + ttlMs };
    return accessToken;
  }

  // Gọi một đường dẫn API kèm token; nhận 401 thì lấy token mới và thử lại đúng một lần
  private async request<T>(
    path: string,
    init: { method?: string; body?: string } = {},
    retried = false,
  ): Promise<T> {
    const token = await this.getToken(retried);
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 && !retried) {
      return this.request<T>(path, init, true);
    }

    const body = await this.readBody(response);
    if (!response.ok) throw this.toError(response.status, body, path);
    return unwrap<T>(body);
  }

  // Địa chỉ gốc của API, bỏ dấu gạch chéo cuối nếu có
  private baseUrl(): string {
    return this.requireConfig('EINVOICE_BASE_URL').replace(/\/$/, '');
  }

  // Đọc nội dung phản hồi dưới dạng JSON, giữ nguyên chuỗi nếu không phải JSON
  private async readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // Dựng lỗi từ phản hồi thất bại, lấy mã lỗi và thông điệp của SePay nếu có
  private toError(
    httpStatus: number,
    body: unknown,
    path: string,
  ): EInvoiceApiError {
    const error = (body as { error?: { code?: string; message?: string } })
      ?.error;
    return new EInvoiceApiError(
      `eInvoice ${httpStatus} ${path}: ${error?.message ?? JSON.stringify(body)}`,
      httpStatus,
      error?.code,
    );
  }
}
