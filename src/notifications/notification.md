# Module Thông Báo Thời Gian Thực (Notifications Module)

## 1. Tổng Quan Module

Module `Notifications` chịu trách nhiệm điều phối và truyền tải các sự kiện thời gian thực (Real-time Events) giữa máy chủ Backend, giao diện quản trị Web Admin (`Smart-Locker-Admin`) và ứng dụng di động của cư dân (`Smart-Locker-Mobile`).

Hệ thống sử dụng thư viện **Socket.IO** trên nền tảng NestJS WebSockets Gateway, kết hợp cùng mô hình kiến trúc **Façade Pattern** (`NotificationsService`) để chuẩn hóa điểm điều phối tập trung, sẵn sàng tích hợp thêm các kênh thông báo đẩy (Expo Push Notification, Firebase Cloud Messaging) trong tương lai.

---

## 2. Kiến Trúc Kỹ Thuật (Architecture & Scoping)

```mermaid
graph TD
    subgraph "Nghiệp Vụ Cốt Lõi (Core Services)"
        A[AuthService] -->|notifyNewResident| S[NotificationsService]
        U[UsersService] -->|notifyResidentApprovalResult| S
        P[PackagesService - Kế hoạch] -->|notifyPackageEvents| S
    end

    subgraph "Tầng Điều Phối Façade"
        S --> G[NotificationsGateway]
        S -.->|Mở rộng| Push[Expo Push Service]
    end

    subgraph "Phân Phòng Socket.IO (Room Scoping)"
        G -->|Phát tới| R1["Phòng building_{buildingId}"]
        G -->|Phát tới| R2["Phòng resident_{residentId}"]
    end

    subgraph "Thiết Bị Đầu Cuối (Clients)"
        R1 -->|NEW_PENDING_RESIDENT| Admin["Web Admin (Ban Quản Lý)"]
        R2 -->|RESIDENT_APPROVAL_RESULT| App["Mobile App (Cư Dân)"]
    end
```

### Thông Số Kết Nối WebSocket:
- **Giao thức**: WebSocket / HTTP Long-polling (Socket.IO v4)
- **Namespace**: `/notifications`
- **Cổng kết nối**: Cùng cổng với HTTP Server (`http://localhost:5005` hoặc `process.env.PORT`)
- **CORS**: `origin: '*'`, `credentials: true`

---

## 3. Cơ Chế Phân Phòng (Multi-tenant Room Scoping)

Để đảm bảo bảo mật dữ liệu và tránh tình trạng phát tán thông báo sai tòa nhà (Noise Pollution), hệ thống phân tách kết nối thành các phòng riêng biệt:

| Tên Phòng (Room Key) | Đối Tượng Tham Gia | Mục Đích Sử Dụng |
| :--- | :--- | :--- |
| `building_{buildingId}` | Ban Quản Lý tòa nhà (`BUILDING_ADMIN`) | Nhận cảnh báo cư dân mới đăng ký chờ duyệt, thông báo kiện hàng giao tại tủ của tòa nhà, cảnh báo kiện hàng quá hạn. |
| `resident_{residentId}` | Tài khoản Cư Dân (`RESIDENT`) trên Mobile | Nhận thông báo phê duyệt hồ sơ cá nhân, mã OTP nhận hàng, thông báo khi shipper gửi đồ vào tủ. |

---

## 4. Đặc Tả Sự Kiện WebSocket (Socket.IO Events Specification)

### 4.1. Sự Kiện Từ Client Gửi Lên Server (Inbound Messages)

#### 1. `join_building` - Tham gia phòng thông báo của Tòa Nhà
Dành cho Web Admin đăng ký nhận thông báo thuộc phạm vi tòa nhà mình quản trị ngay sau khi đăng nhập.

- **Payload gửi lên**:
```json
{
  "buildingId": "6a978676c4f29c7ea2913b13"
}
```
- **Sự kiện phản hồi từ Server (`joined_building`)**:
```json
{
  "room": "building_6a978676c4f29c7ea2913b13",
  "message": "Tham gia phòng nhận thông báo tòa nhà thành công"
}
```

---

#### 2. `leave_building` - Rời khỏi phòng nhận tin của Tòa Nhà
Sử dụng khi Quản trị viên đăng xuất hoặc chuyển đổi vùng giám sát.

- **Payload gửi lên**:
```json
{
  "buildingId": "6a978676c4f29c7ea2913b13"
}
```

---

#### 3. `join_resident` - Tham gia phòng cá nhân của Cư Dân
Dành cho ứng dụng di động của cư dân lắng nghe kết quả hồ sơ hoặc mã nhận đồ cá nhân.

- **Payload gửi lên**:
```json
{
  "residentId": "6543210fedcba98765432101"
}
```

---

### 4.2. Sự Kiện Từ Server Phát Xuống Client (Outbound Events)

#### 1. `NEW_PENDING_RESIDENT` - Thông báo hồ sơ cư dân mới chờ duyệt
- **Thời điểm kích hoạt**: Khi cư dân hoàn tất gọi API `POST /auth/register/resident`.
- **Kênh phát**: Toàn bộ socket client nằm trong phòng `building_{buildingId}`.
- **Cấu trúc Payload**:
```json
{
  "type": "NEW_PENDING_RESIDENT",
  "title": "Hồ sơ cư dân mới chờ duyệt",
  "message": "Cư dân Trần Xuân Phát (Căn hộ: A1204) vừa hoàn tất đăng ký",
  "resident": {
    "id": "6a982931a789123bca012984",
    "name": "Trần Xuân Phát",
    "phone": "0987654321",
    "email": "resident@gmail.com",
    "apartment": "A1204",
    "buildingId": "6a978676c4f29c7ea2913b13",
    "createdAt": "2026-09-02T03:25:19.000Z"
  },
  "timestamp": "2026-09-02T03:25:19.012Z"
}
```

---

#### 2. `RESIDENT_APPROVAL_RESULT` - Kết quả xét duyệt hồ sơ cư dân
- **Thời điểm kích hoạt**: Khi Ban Quản Lý gọi `PATCH /users/:id/approve` hoặc `PATCH /users/:id/reject`.
- **Kênh phát**: Phòng `building_{buildingId}` (để cập nhật bảng danh sách trên Web Admin) và phòng `resident_{residentId}` (để mở khóa màn hình trên Mobile App).
- **Cấu trúc Payload**:
```json
{
  "type": "RESIDENT_APPROVAL_RESULT",
  "residentId": "6a982931a789123bca012984",
  "status": "ACTIVE",
  "apartment": "A1204",
  "reason": null,
  "timestamp": "2026-09-02T03:30:00.000Z"
}
```
*Trường hợp bị từ chối (`REJECTED`):*
```json
{
  "type": "RESIDENT_APPROVAL_RESULT",
  "residentId": "6a982931a789123bca012984",
  "status": "REJECTED",
  "apartment": "A1204",
  "reason": "Thông tin hợp đồng thuê chưa trùng khớp với số CCCD.",
  "timestamp": "2026-09-02T03:30:00.000Z"
}
```

---

## 5. Hướng Dẫn Tích Hợp Phía Client (Client Integration Guide)

### 5.1. Dành Cho Web Admin (`Smart-Locker-Admin` - React / Vite)

Cài đặt thư viện:
```bash
npm install socket.io-client
```

Khởi tạo kết nối và lắng nghe trong Hook hoặc Component Dashboard:
```typescript
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const useAdminNotifications = (buildingId?: string) => {
  useEffect(() => {
    if (!buildingId) return;

    // 1. Kết nối tới namespace /notifications
    socket = io('http://localhost:5005/notifications', {
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      console.log('Đã kết nối tới máy chủ Socket thông báo:', socket?.id);
      // 2. Gia nhập phòng của tòa nhà
      socket?.emit('join_building', { buildingId });
    });

    // 3. Lắng nghe thông báo cư dân đăng ký mới
    socket.on('NEW_PENDING_RESIDENT', (data) => {
      console.log('Có cư dân mới:', data);
      // Gọi hàm hiển thị thông báo Toast và cập nhật lại danh sách PENDING
    });

    // 4. Lắng nghe kết quả cập nhật trạng thái duyệt
    socket.on('RESIDENT_APPROVAL_RESULT', (data) => {
      console.log('Cập nhật trạng thái duyệt:', data);
    });

    return () => {
      if (socket) {
        socket.emit('leave_building', { buildingId });
        socket.disconnect();
      }
    };
  }, [buildingId]);
};
```

---

### 5.2. Dành Cho Ứng Dụng Di Động (`Smart-Locker-Mobile` - React Native / Expo)

```typescript
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export const useResidentSocket = (residentId?: string) => {
  useEffect(() => {
    if (!residentId) return;

    const socket: Socket = io('http://192.168.1.x:5005/notifications', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('join_resident', { residentId });
    });

    socket.on('RESIDENT_APPROVAL_RESULT', (payload) => {
      if (payload.status === 'ACTIVE') {
        // Tự động chuyển hướng màn hình hoặc thông báo thành công
      } else {
        // Hiển thị thông báo từ chối kèm lý do
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [residentId]);
};
```

---

## 6. Dịch Vụ Gửi Email Thông Báo (Email Notification Service)

Bên cạnh kênh truyền thời gian thực qua WebSocket, hệ thống tích hợp dịch vụ gửi Email thông báo qua giao thức SMTP (`MailService` sử dụng thư viện `nodemailer`) nhằm phục vụ lưu trữ văn bản chính thức và thông báo ngoại tuyến (Offline Notification) cho Ban Quản Lý và Cư Dân.

### 6.1. Chiến Lược Điều Phối Người Nhận 2 Tầng (2-Tier Email Routing)

Để đảm bảo email thông báo luôn đến đúng người phụ trách trực tiếp và không gửi thư rác tới Quản trị viên hệ thống:

```mermaid
graph TD
    A["Cư Dân Đăng Ký Tài Khoản"] --> B{"Tầng 1: Tòa nhà đã có tài khoản BUILDING_ADMIN hoạt động chưa?"}
    B -- "CÓ (1 hoặc nhiều Admin)" --> C["Gửi thư tới danh sách Email của các BUILDING_ADMIN này"]
    B -- "CHƯA CÓ" --> D{"Tầng 2: Tòa nhà có cấu hình managementEmail không?"}
    D -- "CÓ" --> E["Fallback: Gửi thư tới hòm thư chung của Tòa Nhà (managementEmail)"]
    D -- "KHÔNG" --> F["Ghi nhận log cảnh báo và dừng lại (Không phát sinh gửi email)"]
```

---

### 6.2. Danh Sách Các Mẫu Email Thông Báo (Email Templates)

#### 1. Thông Báo Tiếp Nhận Hồ Sơ Cư Dân Mới (Gửi Ban Quản Lý)
- **Mục đích**: Thông báo cho BQL tòa nhà khi có cư dân đăng ký căn hộ mới để vào xét duyệt.
- **Tiêu đề thư**: `[SMART LOCKER] Yêu cầu phê duyệt cư dân mới - Căn hộ <số căn hộ>`
- **Nội dung hiển thị**: Bảng thông tin định danh (*Họ tên, SĐT, Căn hộ, Tòa nhà, Email cá nhân*) kèm nút bấm chuyển hướng trực tiếp: `[ TRUY CẬP BẢNG QUẢN TRỊ XÉT DUYỆT ]` trỏ tới `${ADMIN_DASHBOARD_URL}/residents`.

#### 2. Thông Báo Phê Duyệt Hồ Sơ Thành Công (Gửi Cư Dân)
- **Mục đích**: Chúc mừng cư dân sau khi Ban Quản Lý bấm duyệt hồ sơ (`PATCH /users/:id/approve`).
- **Tiêu đề thư**: `🎉 Hồ sơ cư dân căn hộ <số căn hộ> đã được phê duyệt thành công!`
- **Nội dung hiển thị**: Banner xanh lá (`#10B981`), thông báo kích hoạt tài khoản và hướng dẫn đăng nhập ứng dụng di động Smart Locker để nhận mã OTP mở tủ.

#### 3. Thông Báo Từ Chối Hồ Sơ Cư Dân (Gửi Cư Dân)
- **Mục đích**: Giải thích rõ lý do hồ sơ bị từ chối (`PATCH /users/:id/reject`) để cư dân liên hệ BQL điều chỉnh.
- **Tiêu đề thư**: `Thông báo về hồ sơ đăng ký cư dân tại <tên tòa nhà>`
- **Nội dung hiển thị**: Banner đỏ (`#EF4444`), khối cảnh báo hiển thị chính xác lý do do BQL nhập và hotline liên hệ sảnh tòa nhà.

---

### 6.3. Cấu Hình Biến Môi Trường (.env Parameters)

Các biến cấu hình bắt buộc để kích hoạt tính năng gửi email trong tệp `server/.env`:

```env
# Địa chỉ máy chủ SMTP
MAIL_HOST=smtp.gmail.com

# Cổng kết nối SMTP (587 cho TLS hoặc 465 cho SSL)
MAIL_PORT=587

# Tài khoản Gmail gửi thư
MAIL_USER=bql.smartlocker@gmail.com

# Mật khẩu ứng dụng 16 ký tự của Google (Google App Password)
MAIL_PASS=xxxx xxxx xxxx xxxx

# Tên hiển thị thương hiệu của người gửi
MAIL_FROM="Smart Locker System <no-reply@smartlocker.vn>"

# Địa chỉ Web Admin để gắn vào nút bấm điều hướng trong email
ADMIN_DASHBOARD_URL=http://localhost:5173
```

---

## 7. Xử Lý Ngoại Lệ & Độ Tin Cậy Hệ Thống (Reliability & Fault Tolerance)

1. **Thực Thi Bất Đồng Bộ Không Gây Nghẽn (Non-blocking Execution)**:
   - Quá trình gửi email qua SMTP thường mất từ 2 đến 6 giây do độ trễ mạng của máy chủ bưu chính. Toàn bộ logic gửi thư trong `AuthService` và `UsersService` được thực thi dưới dạng **Promise không block (`.catch()`)**, đảm bảo API HTTP phản hồi mã `201 Created` ngay lập tức cho ứng dụng di động mà không phải chờ gửi mail xong.
2. **Chế Độ Mô Phỏng An Toàn (Mock Simulation Mode)**:
   - Khi chạy dưới môi trường phát triển (Local Development) hoặc khi chưa điền thông số `MAIL_USER`/`MAIL_PASS`, `MailService` tự động phát hiện và chuyển sang chế độ mô phỏng, xuất nội dung thư ra console terminal thay vì ném ngoại lệ làm sập server.
3. **Bọc Lỗi Tách Biệt (Isolated Error Boundaries)**:
   - Mọi thao tác phát sự kiện từ `NotificationsService` và gửi email từ `MailService` được cô lập riêng biệt. Sự cố rớt mạng của một kênh thông báo không bao giờ làm gián đoạn kênh còn lại hoặc ảnh hưởng đến dữ liệu đã lưu trong MongoDB.
4. **Mở Rộng Quy Mô (Future Scaling)**:
   - Đối với WebSocket: Sẵn sàng cấu hình Redis Adapter (`@socket.io/redis-adapter`) khi nhân rộng nhiều cụm server chạy sau Nginx Load Balancer.
   - Đối với Email: Sẵn sàng chuyển đổi phương thức `sendMail` sang REST API của các nhà cung cấp như Resend hoặc SendGrid mà không làm thay đổi giao diện gọi hàm của các service nghiệp vụ.
