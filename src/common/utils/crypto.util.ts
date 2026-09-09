import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Lấy khóa mã hóa 32 bytes từ biến môi trường hoặc tự động phái sinh khóa an toàn
function getEncryptionKey(customKey?: string): Buffer {
  const keyString =
    customKey ||
    process.env.TWO_FACTOR_ENCRYPTION_KEY ||
    process.env.JWT_ACCESS_SECRET_KEY ||
    'smart-locker-default-fallback-key-32b!';

  return crypto.createHash('sha256').update(keyString).digest();
}

// Mã hóa chuỗi văn bản bằng thuật toán AES-256-GCM đảm bảo tính bảo mật và toàn vẹn dữ liệu
export function encryptText(plainText: string, customKey?: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey(customKey);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

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

  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
