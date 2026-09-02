# Module Quản Lý Người Dùng (Users Module)

## 1. Tổng Quan Module

Module `Users` chịu trách nhiệm lưu trữ, quản lý dữ liệu tài khoản và điều phối toàn bộ vòng đời của người dùng trong hệ thống Smart Locker theo mô hình phân quyền chặt chẽ (Multi-tenant Scoped RBAC):
- Cấp phát tài khoản Ban Quản Lý Tòa Nhà (`POST /users/building-admin`) dành riêng cho `SYSTEM_ADMIN`.
- Cung cấp quy trình khởi tạo và xét duyệt hồ sơ cư dân (`resident`, `pending-residents`, `approve`, `reject`) dành riêng cho Ban Quản Lý Tòa Nhà (`BUILDING_ADMIN`).
- Cung cấp thông tin hồ sơ tài khoản cá nhân (`profile`) cho người dùng đang đăng nhập.
- Cung cấp các tác vụ tra cứu và quản trị người dùng (`findAll`, `findOne`, `remove`) được cô lập dữ liệu theo từng tòa nhà.

---

## 2. Mô Hình Dữ Liệu (User Schema Definition)

Bảng dưới đây mô tả chi tiết từng thuộc tính trong thực thể `User` (`users` collection trong MongoDB):

| Trường Dữ Liệu | Kiểu Dữ Liệu | Ràng Buộc (Constraints) | Mô Tả & Ý Nghĩa Nghiệp Vụ |
| :--- | :--- | :--- | :--- |
| `_id` | `Types.ObjectId` | Tự động sinh (Primary Key) | Mã định danh duy nhất của người dùng |
| `name` | `String` | `required: true, trim: true` | Họ và tên hiển thị của người dùng |
| `email` | `String` | `required: true, unique: true, lowercase: true` | Địa chỉ email đăng nhập duy nhất trong hệ thống |
| `phone` | `String` | `required: true, unique: true, index: true` | Số điện thoại liên hệ duy nhất (định dạng Việt Nam) |
| `password` | `String` | `required: true` | Mật khẩu đã được mã hóa một chiều bằng `bcrypt` (10 rounds) |
| `role` | `String (Enum)` | `enum: Role, default: Role.RESIDENT` | Phân quyền: `SYSTEM_ADMIN`, `BUILDING_ADMIN`, `RESIDENT`, `SHIPPER` |
| `buildingId` | `Types.ObjectId` | `ref: 'Building', required: false, index: true` | Liên kết đến Tòa nhà cư dân sinh sống hoặc BQL quản lý |
| `apartment` | `String` | `required: false, trim: true` | Số căn hộ của cư dân (ví dụ: `A1204`, `15B`) |
| `approvalStatus` | `String (Enum)` | `enum: ApprovalStatus, default: PENDING` | Trạng thái hồ sơ: `PENDING`, `ACTIVE`, `REJECTED` |
| `rejectedReason` | `String` | `required: false, trim: true` | Lý do từ chối hồ sơ nếu trạng thái là `REJECTED` |
| `approvedAt` | `Date` | `required: false` | Thời điểm Ban Quản Lý phê duyệt hồ sơ |
| `approvedBy` | `Types.ObjectId` | `ref: 'User', required: false` | Mã định danh của Quản trị viên đã thực hiện phê duyệt |
| `devicePushToken` | `String` | `required: false, trim: true` | Push token từ thiết bị di động (Expo Push Token) để nhận thông báo |
| `createdAt` | `Date` | `timestamps: true` | Thời gian tạo tài khoản |
| `updatedAt` | `Date` | `timestamps: true` | Thời gian cập nhật tài khoản gần nhất |

> **Lưu ý:** Hệ thống đã chuyển đổi sang mô hình **Tài Xế Khách Vãng Lai Không Cần Tài Khoản (No-Auth Guest Shipper)**, do đó trường `carrierName` đã được loại bỏ khỏi `User` schema và lưu trực tiếp trên bản ghi `Package`.

### Chỉ Mục Cơ Sở Dữ Liệu (Indexes):
- `email`: Single Unique Index (Xác thực đăng nhập).
- `phone`: Single Unique Index (Tra cứu theo số điện thoại).
- `buildingId`: Single Index (Tra cứu người dùng theo tòa nhà).
- `{ buildingId: 1, role: 1, approvalStatus: 1 }`: **Compound Index** (Tối ưu truy vấn danh sách cư dân `PENDING` của Ban Quản Lý).
- `{ buildingId: 1, role: 1 }`: **Compound Index** (Tối ưu tìm kiếm nhanh các tài khoản `BUILDING_ADMIN` để gửi email thông báo).

---

## 3. Ma Trận Phân Quyền (RBAC Matrix)

| Chức Năng / API | Endpoint | SYSTEM_ADMIN | BUILDING_ADMIN | RESIDENT | SHIPPER | Ghi Chú Phạm Vi |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| Tạo tài khoản Ban Quản Lý | `POST /users/building-admin` | ✅ | ❌ | ❌ | ❌ | Chỉ Super Admin cấp tài khoản BQL |
| Tạo trực tiếp tài khoản Cư Dân | `POST /users/resident` | ❌ | ✅ | ❌ | ❌ | BQL tạo cư dân cho tòa nhà của mình |
| Xem thông tin cá nhân | `GET /users/profile` | ✅ | ✅ | ✅ | ✅ | Xem profile chính mình |
| Xem danh sách cư dân chờ duyệt | `GET /users/pending-residents` | ❌ | ✅ | ❌ | ❌ | BQL xem cư dân PENDING tòa mình |
| Phê duyệt hồ sơ cư dân | `PATCH /users/:id/approve` | ❌ | ✅ | ❌ | ❌ | BQL duyệt cư dân tòa mình |
| Từ chối hồ sơ cư dân | `PATCH /users/:id/reject` | ❌ | ✅ | ❌ | ❌ | BQL từ chối cư dân kèm lý do |
| Lấy danh sách người dùng | `GET /users` | ✅ (Tất cả) | ✅ (Chỉ cư dân tòa mình) | ❌ | ❌ | Tự động phân quyền theo Scope |
| Xem chi tiết một tài khoản | `GET /users/:id` | ✅ (Tất cả) | ✅ (Chỉ cư dân tòa mình) | ❌ | ❌ | Chặn xem tài khoản tòa khác |
| Xóa tài khoản người dùng | `DELETE /users/:id` | ✅ (Tất cả) | ✅ (Chỉ cư dân tòa mình) | ❌ | ❌ | Chặn xóa tài khoản tòa khác |

---

## 4. Danh Sách Chi Tiết API (API Specifications)

### 4.1. Khởi Tạo Tài Khoản Ban Quản Lý Tòa Nhà
- **Endpoint**: `POST /users/building-admin`
- **Quyền truy cập**: `SYSTEM_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Request Body**:
```json
{
  "name": "Ban Quản Lý Tòa S1.01",
  "email": "bql.s101@vinhomes.vn",
  "phone": "0912345678",
  "password": "AdminPassword@123",
  "buildingId": "6543210fedcba98765432101"
}
```
- **Response (201 Created)**: Trả về đối tượng User của Ban Quản Lý (`role: BUILDING_ADMIN`, `approvalStatus: ACTIVE`).

---

### 4.2. Khởi Tạo Tài Khoản Cư Dân Trực Tiếp
- **Endpoint**: `POST /users/resident`
- **Quyền truy cập**: `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Request Body**:
```json
{
  "name": "Nguyễn Văn A",
  "email": "cudan.a1204@vinhomes.vn",
  "phone": "0987654321",
  "password": "CudanPassword@123",
  "apartment": "A1204"
}
```
- **Response (201 Created)**: Trả về đối tượng User Cư Dân (`role: RESIDENT`, `approvalStatus: ACTIVE`, tự động gắn `buildingId` của BQL).

---

### 4.3. Lấy Thông Tin Cá Nhân Đang Đăng Nhập
- **Endpoint**: `GET /users/profile`
- **Quyền truy cập**: `Bearer Token` (Tất cả các Role)
- **Header**: `Authorization: Bearer <accessToken>`
- **Response (200 OK)**: Trả về thông tin chi tiết đầy đủ của tài khoản đang đăng nhập.

---

### 4.4. Lấy Danh Sách Cư Dân Chờ Duyệt Thuộc Tòa Nhà
- **Endpoint**: `GET /users/pending-residents`
- **Quyền truy cập**: `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Response (200 OK)**: Danh sách mảng các đối tượng cư dân có `approvalStatus: "PENDING"` thuộc tòa nhà của Admin.

---

### 4.5. Phê Duyệt Hồ Sơ Cư Dân
- **Endpoint**: `PATCH /users/:id/approve`
- **Quyền truy cập**: `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của Cư Dân cần duyệt
- **Response (200 OK)**: Đối tượng User đã được cập nhật `approvalStatus: "ACTIVE"`, `approvedBy` và `approvedAt`.

---

### 4.6. Từ Chối Hồ Sơ Cư Dân
- **Endpoint**: `PATCH /users/:id/reject`
- **Quyền truy cập**: `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của Cư Dân cần từ chối
- **Request Body**:
```json
{
  "reason": "Số căn hộ không khớp với thông tin hợp đồng thuê/mua căn hộ tại tòa nhà"
}
```
- **Response (200 OK)**: Đối tượng User đã được cập nhật `approvalStatus: "REJECTED"` và `rejectedReason`.

---

### 4.7. Lấy Danh Sách Người Dùng (Theo Scope)
- **Endpoint**: `GET /users`
- **Quyền truy cập**: `SYSTEM_ADMIN`, `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Hành vi**:
  - `SYSTEM_ADMIN`: Trả về toàn bộ người dùng trong hệ thống.
  - `BUILDING_ADMIN`: Chỉ trả về danh sách cư dân thuộc tòa nhà do mình quản lý.

---

### 4.8. Lấy Chi Tiết Một Người Dùng Theo ID (Có Kiểm Tra Tenant)
- **Endpoint**: `GET /users/:id`
- **Quyền truy cập**: `SYSTEM_ADMIN`, `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của người dùng cần xem
- **Hành vi**:
  - `SYSTEM_ADMIN`: Xem bất kỳ tài khoản nào.
  - `BUILDING_ADMIN`: Chỉ xem được cư dân thuộc tòa nhà mình (nếu xem tài khoản khác sẽ trả về `403 Forbidden`).

---

### 4.9. Xóa Tài Khoản Người Dùng (Có Kiểm Tra Tenant)
- **Endpoint**: `DELETE /users/:id`
- **Quyền truy cập**: `SYSTEM_ADMIN`, `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của người dùng cần xóa
- **Hành vi**:
  - `SYSTEM_ADMIN`: Xóa bất kỳ tài khoản nào.
  - `BUILDING_ADMIN`: Chỉ xóa được cư dân thuộc tòa nhà mình (nếu xóa tài khoản khác sẽ trả về `403 Forbidden`).

---

## 5. Tiêu Chuẩn Bảo Mật & Best Practices

1. **Cô lập dữ liệu Tòa Nhà (Tenant Data Isolation)**:
   - Tất cả các thao tác của Ban Quản Lý đều được gắn chặt với `req.user.buildingId` trích xuất từ Token ký bảo mật, ngăn chặn tuyệt đối việc can thiệp trái phép vào dữ liệu chung cư khác.
2. **Thứ tự định tuyến (Routing Order)**:
   - Các route tĩnh (`GET /users/profile`, `GET /users/pending-residents`) luôn được khai báo trước các route động (`GET /users/:id`, `PATCH /users/:id/approve`) để tránh lỗi MongoDB CastError.
3. **Ẩn mật khẩu tuyệt đối**:
   - Tất cả các phương thức truy vấn đều gắn `.select('-password')`.
4. **Đánh chỉ mục (Indexing)**:
   - `email` và `phone` được đánh unique index.
   - `buildingId` được đánh index để tối ưu hóa truy vấn cư dân theo từng tòa nhà.
