# Module Quản Lý Người Dùng (Users Module)

## 1. Tổng Quan Module

Module `Users` chịu trách nhiệm lưu trữ, quản lý dữ liệu tài khoản và điều phối toàn bộ vòng đời của người dùng trong hệ thống Smart Locker:
- Cung cấp thông tin hồ sơ tài khoản cá nhân (`profile`) cho người dùng đang đăng nhập.
- Cung cấp quy trình xét duyệt hồ sơ cư dân (`pending-residents`, `approve`, `reject`) cho Ban Quản Lý Tòa Nhà.
- Cung cấp các tác vụ quản trị hệ thống (`findAll`, `findOne`, `remove`) cho Quản trị viên cấp cao (`SYSTEM_ADMIN`).
- Cung cấp tầng truy xuất dữ liệu (Data Access Layer) qua `UsersService` cho các module `Auth`, `Lockers`, `Boxes`, `Packages`, `Notifications`.

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
| `buildingId` | `Types.ObjectId` | `ref: 'Building', required: false, index: true` | Liên kết đến Tòa nhà cư dân sinh sống hoặc quản lý |
| `apartment` | `String` | `required: false, trim: true` | Số căn hộ của cư dân (ví dụ: `A1204`, `15B`) |
| `approvalStatus` | `String (Enum)` | `enum: ApprovalStatus, default: PENDING` | Trạng thái hồ sơ: `PENDING`, `ACTIVE`, `REJECTED` |
| `rejectedReason` | `String` | `required: false, trim: true` | Lý do từ chối hồ sơ nếu trạng thái là `REJECTED` |
| `approvedAt` | `Date` | `required: false` | Thời điểm Ban Quản Lý phê duyệt hồ sơ |
| `approvedBy` | `Types.ObjectId` | `ref: 'User', required: false` | Mã định danh của Quản trị viên đã thực hiện phê duyệt |
| `carrierName` | `String` | `required: false, trim: true` | Tên đơn vị vận chuyển đối với tài xế (ví dụ: `Shopee Xpress`) |
| `devicePushToken` | `String` | `required: false, trim: true` | Push token từ thiết bị di động (Expo Push Token) để nhận thông báo |
| `createdAt` | `Date` | `timestamps: true` | Thời gian tạo tài khoản |
| `updatedAt` | `Date` | `timestamps: true` | Thời gian cập nhật tài khoản gần nhất |

---

## 3. Ma Trận Phân Quyền (RBAC Matrix)

| Chức Năng / API | Endpoint | SYSTEM_ADMIN | BUILDING_ADMIN | RESIDENT | SHIPPER |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Xem thông tin cá nhân | `GET /users/profile` | ✅ | ✅ | ✅ | ✅ |
| Xem danh sách cư dân chờ duyệt | `GET /users/pending-residents` | ✅ | ✅ | ❌ | ❌ |
| Phê duyệt hồ sơ cư dân | `PATCH /users/:id/approve` | ✅ | ✅ | ❌ | ❌ |
| Từ chối hồ sơ cư dân | `PATCH /users/:id/reject` | ✅ | ✅ | ❌ | ❌ |
| Lấy danh sách tất cả tài khoản | `GET /users` | ✅ | ❌ | ❌ | ❌ |
| Xem chi tiết một tài khoản | `GET /users/:id` | ✅ | ✅ | ❌ | ❌ |
| Xóa tài khoản người dùng | `DELETE /users/:id` | ✅ | ❌ | ❌ | ❌ |

---

## 4. Danh Sách Chi Tiết API (API Specifications)

### 4.1. Lấy Thông Tin Cá Nhân Đang Đăng Nhập
- **Endpoint**: `GET /users/profile`
- **Quyền truy cập**: `Bearer Token` (Tất cả các Role)
- **Header**: `Authorization: Bearer <accessToken>`
- **Response (200 OK)**:
```json
{
  "_id": "67890fedcba9876543210fed",
  "name": "Nguyễn Văn A",
  "email": "nguyenvana@gmail.com",
  "phone": "0912345678",
  "role": "RESIDENT",
  "buildingId": "6543210fedcba9876543210f",
  "apartment": "A1204",
  "approvalStatus": "ACTIVE",
  "createdAt": "2026-08-30T09:10:00.000Z",
  "updatedAt": "2026-08-30T09:15:00.000Z"
}
```

---

### 4.2. Lấy Danh Sách Cư Dân Chờ Duyệt Thuộc Tòa Nhà
- **Endpoint**: `GET /users/pending-residents`
- **Quyền truy cập**: `BUILDING_ADMIN`, `SYSTEM_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Response (200 OK)**: Danh sách mảng các đối tượng cư dân có `approvalStatus: "PENDING"` thuộc tòa nhà của Admin.

---

### 4.3. Phê Duyệt Hồ Sơ Cư Dân
- **Endpoint**: `PATCH /users/:id/approve`
- **Quyền truy cập**: `BUILDING_ADMIN`, `SYSTEM_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của Cư Dân cần duyệt
- **Response (200 OK)**: Đối tượng User đã được cập nhật `approvalStatus: "ACTIVE"`, `approvedBy` và `approvedAt`.

---

### 4.4. Từ Chối Hồ Sơ Cư Dân
- **Endpoint**: `PATCH /users/:id/reject`
- **Quyền truy cập**: `BUILDING_ADMIN`, `SYSTEM_ADMIN`
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

### 4.5. Lấy Danh Sách Tất Cả Người Dùng (Admin Tổng)
- **Endpoint**: `GET /users`
- **Quyền truy cập**: `SYSTEM_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Response (200 OK)**: Danh sách toàn bộ tài khoản trong hệ thống (đã loại bỏ `password`).

---

### 4.6. Lấy Chi Tiết Một Người Dùng Theo ID
- **Endpoint**: `GET /users/:id`
- **Quyền truy cập**: `SYSTEM_ADMIN`, `BUILDING_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của người dùng cần xem
- **Response (200 OK)**: Thông tin chi tiết của người dùng.

---

### 4.7. Xóa Tài Khoản Người Dùng
- **Endpoint**: `DELETE /users/:id`
- **Quyền truy cập**: `SYSTEM_ADMIN`
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của người dùng cần xóa
- **Response (200 OK)**: Đối tượng User đã bị xóa.

---

## 5. Tiêu Chuẩn Bảo Mật & Best Practices

1. **Thứ tự định tuyến (Routing Order)**:
   - Các route tĩnh (`GET /users/profile`, `GET /users/pending-residents`) luôn được khai báo trước các route động (`GET /users/:id`, `PATCH /users/:id/approve`) để tránh lỗi MongoDB CastError.
2. **Ẩn mật khẩu tuyệt đối**:
   - Tất cả các phương thức truy vấn (`findById`, `findAll`, `findPendingResidentsByBuilding`, `updateApprovalStatus`) đều gắn `.select('-password')`.
3. **Đánh chỉ mục (Indexing)**:
   - `email` và `phone` được đánh unique index.
   - `buildingId` được đánh index để tối ưu hóa truy vấn cư dân theo từng tòa nhà.
