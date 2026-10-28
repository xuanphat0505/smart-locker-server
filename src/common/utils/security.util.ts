import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Lấy khóa mã hóa 32 bytes từ biến môi trường, thiếu cả hai khóa thì báo lỗi thay vì dùng khóa mặc định
function getEncryptionKey(customKey?: string): Buffer {
  const keyString =
    customKey || process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET_KEY;

  if (!keyString) {
    throw new Error('Thiếu TWO_FACTOR_ENCRYPTION_KEY hoặc JWT_ACCESS_SECRET_KEY để mã hóa dữ liệu');
  }

  return crypto.createHash('sha256').update(keyString).digest();
}

// Mã hóa chuỗi văn bản bằng thuật toán AES-256-GCM đảm bảo tính bảo mật và toàn vẹn dữ liệu
export function encryptText(plainText: string, customKey?: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey(customKey);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

// Giải mã chuỗi ciphertext AES-256-GCM và kiểm tra tính toàn vẹn qua mã xác thực authTag
export function decryptText(cipherText: string, customKey?: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Định dạng chuỗi mã hóa không hợp lệ');
  }

  const [ivHex, encryptedHex, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const key = getEncryptionKey(customKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

  return decrypted.toString('utf8');
}

// Danh sách biến môi trường bí mật bắt buộc phải có để server khởi động an toàn
const REQUIRED_SECRET_ENV_KEYS = ['JWT_ACCESS_SECRET_KEY', 'JWT_REFRESH_SECRET_KEY'];

// Dừng ứng dụng ngay khi khởi động nếu thiếu khóa bí mật, tránh dùng giá trị mặc định công khai
export function assertRequiredEnv(): void {
  const missingKeys = REQUIRED_SECRET_ENV_KEYS.filter((key) => !process.env[key]?.trim());

  if (missingKeys.length > 0) {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${missingKeys.join(', ')}. Hãy khai báo trong file .env trước khi khởi động server.`,
    );
  }
}

// Băm SHA-256 một chuỗi và trả về dạng hex
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// So sánh hai chuỗi bằng phép so sánh thời gian cố định để không lộ thông tin qua thời gian xử lý
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
