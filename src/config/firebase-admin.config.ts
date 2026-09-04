import {
  initializeApp,
  cert,
  getApps,
  App,
  ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';

const logger = new Logger('FirebaseAdmin');

let firebaseApp: App | undefined;

// Khởi tạo Firebase Admin SDK từ file khóa riêng tư Service Account
export function initFirebaseAdmin(): App {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const serviceAccountPath = path.resolve(
    __dirname,
    'smart-locker-datn-firebase-adminsdk.json',
  );

  if (fs.existsSync(serviceAccountPath)) {
    try {
      const rawData = fs.readFileSync(serviceAccountPath, 'utf8');
      const serviceAccount = JSON.parse(rawData) as ServiceAccount;
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      logger.log(
        'Đã kết nối thành công Firebase Admin SDK (smart-locker-datn)',
      );
    } catch (error) {
      logger.error('Lỗi khi nạp file khóa Firebase Service Account:', error);
    }
  } else {
    logger.warn(
      `Không tìm thấy file Firebase Service Account tại ${serviceAccountPath}`,
    );
  }

  return firebaseApp || initializeApp();
}

// Lấy đối tượng dịch vụ xác thực Firebase Auth
export function getFirebaseAuth(): Auth {
  const app = initFirebaseAdmin();
  return getAuth(app);
}
