import { BadGatewayException } from '@nestjs/common';
import { SmsService } from './sms.service';

// Dựng ConfigService giả từ một bảng giá trị
const makeService = (env: Record<string, string>) =>
  new SmsService({ get: (key: string) => env[key] } as never);

const gatewayEnv = {
  SMS_PROVIDER: 'android-gateway',
  SMS_GATEWAY_URL: 'http://192.168.1.50:8080/message',
  SMS_GATEWAY_USERNAME: 'user',
  SMS_GATEWAY_PASSWORD: 'pass',
};

describe('SmsService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('chế độ console không gọi mạng', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await makeService({ SMS_PROVIDER: 'console' }).send('+84397192664', 'hi');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('thiếu cấu hình cổng thì tự chuyển sang console', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await makeService({ SMS_PROVIDER: 'android-gateway' }).send('+84397192664', 'hi');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gửi đúng địa chỉ, xác thực Basic và nội dung', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as never;

    await makeService(gatewayEnv).send('+84397192664', 'Ma OTP 123456');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://192.168.1.50:8080/message');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      textMessage: { text: 'Ma OTP 123456' },
      phoneNumbers: ['+84397192664'],
    });
  });

  it('cổng trả lỗi HTTP thì ném 502', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as never;

    await expect(
      makeService(gatewayEnv).send('+84397192664', 'hi'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('không kết nối được cổng thì ném 502', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as never;

    await expect(
      makeService(gatewayEnv).send('+84397192664', 'hi'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('chỉ bật devMode khi SMS_DEV_MODE là true', () => {
    expect(makeService({ SMS_DEV_MODE: 'true' }).devMode).toBe(true);
    expect(makeService({ SMS_DEV_MODE: 'false' }).devMode).toBe(false);
    expect(makeService({}).devMode).toBe(false);
  });
});
