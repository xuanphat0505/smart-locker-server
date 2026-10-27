// Danh sách biến môi trường bí mật bắt buộc phải có để server khởi động an toàn
const REQUIRED_SECRET_ENV_KEYS = ['JWT_ACCESS_SECRET_KEY', 'JWT_REFRESH_SECRET_KEY'];

// Dừng ứng dụng ngay khi khởi động nếu thiếu khóa bí mật, tránh dùng giá trị mặc định công khai
export function assertRequiredEnv(): void {
  const missingKeys = REQUIRED_SECRET_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim(),
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${missingKeys.join(', ')}. Hãy khai báo trong file .env trước khi khởi động server.`,
    );
  }
}
