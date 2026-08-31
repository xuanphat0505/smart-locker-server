# Module Quản Lý Tòa Nhà (Buildings Module)

## 1. Tổng Quan Module

Module `Buildings` đóng vai trò là **Thực thể Neo (Root Tenant Entity)** trong toàn bộ hệ sinh thái Smart Locker:
- Cung cấp danh mục các Tòa Nhà / Chung Cư đối tác đang lắp đặt và vận hành hệ thống tủ thông minh.
- Cung cấp API công khai (`GET /buildings`) để ứng dụng di động (Mobile App) tải danh sách tòa nhà cho cư dân lựa chọn khi đăng ký tài khoản.
- Cung cấp các tác vụ quản trị trọn đời (`CRUD`) cho Quản trị viên cấp cao (`SYSTEM_ADMIN`) khi ký kết hợp đồng và lắp đặt tủ tại các dự án chung cư mới.

---

## 2. Mô Hình Dữ Liệu (Building Schema Definition)

Bảng dưới đây mô tả chi tiết từng thuộc tính trong thực thể `Building` (`buildings` collection trong MongoDB):

| Trường Dữ Liệu | Kiểu Dữ Liệu | Ràng Buộc (Constraints) | Mô Tả & Ý Nghĩa Nghiệp Vụ |
| :--- | :--- | :--- | :--- |
| `_id` | `Types.ObjectId` | Tự động sinh (Primary Key) | Mã định danh duy nhất của Tòa Nhà |
| `name` | `String` | `required: true, trim: true` | Tên hiển thị của Tòa Nhà (ví dụ: `Tòa S1.01`) |
| `code` | `String` | `required: true, unique: true, uppercase: true, index: true` | Mã viết tắt duy nhất (ví dụ: `S1.01`, `VIN-S101`) |
| `address` | `String` | `required: true, trim: true` | Địa chỉ chi tiết (Đường, Phường, Quận, Tỉnh/TP) |
| `totalFloors` | `Number` | `required: true, min: 1` | Tổng số tầng của Tòa Nhà (ví dụ: `25`) |
| `totalApartments` | `Number` | `required: true, min: 1` | Ước tính tổng số căn hộ trong tòa (ví dụ: `500`) |
| `hotline` | `String` | `required: false, trim: true` | Số điện thoại lễ tân / hotline BQL tòa nhà |
| `status` | `String (Enum)` | `enum: BuildingStatus, default: ACTIVE, index: true` | Trạng thái: `ACTIVE` (Hoạt động), `INACTIVE` (Tạm ngưng) |
| `description` | `String` | `required: false, trim: true` | Mô tả vị trí đặt tủ (ví dụ: `Sảnh chính tầng 1 gần thang máy A`) |
| `createdAt` | `Date` | `timestamps: true` | Thời gian tạo tòa nhà |
| `updatedAt` | `Date` | `timestamps: true` | Thời gian cập nhật thông tin gần nhất |

---

## 3. Ma Trận Phân Quyền (RBAC Matrix)

| Chức Năng / API | Method & Endpoint | SYSTEM_ADMIN | BUILDING_ADMIN | RESIDENT | SHIPPER | Ghi Chú |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| Lấy danh sách Tòa Nhà | `GET /buildings` | ✅ | ✅ | ✅ | ✅ | **Public API** phục vụ Mobile App |
| Xem chi tiết Tòa Nhà | `GET /buildings/:id` | ✅ | ✅ | ✅ | ✅ | **Public / Authenticated** |
| Thêm mới Tòa Nhà | `POST /buildings` | ✅ | ❌ | ❌ | ❌ | Chỉ Super Admin thêm tòa nhà |
| Cập nhật Tòa Nhà | `PATCH /buildings/:id` | ✅ | ❌ | ❌ | ❌ | Chỉ Super Admin cập nhật thông tin |
| Xóa Tòa Nhà | `DELETE /buildings/:id` | ✅ | ❌ | ❌ | ❌ | Chặn xóa nếu đang có cư dân/BQL |

---

## 4. Danh Sách Chi Tiết API (API Specifications)

### 4.1. Lấy Danh Sách Tòa Nhà (Public)
- **Endpoint**: `GET /buildings`
- **Quyền truy cập**: Public (Không bắt buộc Bearer Token)
- **Query Params**: `status` (Tùy chọn: `ACTIVE` hoặc `INACTIVE`, mặc định là `ACTIVE`)
- **Response (200 OK)**:
```json
[
  {
    "_id": "6543210fedcba98765432101",
    "name": "Tòa S1.01",
    "code": "S1.01",
    "address": "Khu đô thị Vinhomes Grand Park, Phường Long Bình, TP. Thủ Đức, TP. Hồ Chí Minh",
    "totalFloors": 25,
    "totalApartments": 500,
    "hotline": "02812345678",
    "status": "ACTIVE",
    "description": "Sảnh chính tầng 1 gần thang máy tháp A",
    "createdAt": "2026-08-31T04:00:00.000Z",
    "updatedAt": "2026-08-31T04:00:00.000Z"
  }
]
```

---

### 4.2. Lấy Chi Tiết Một Tòa Nhà
- **Endpoint**: `GET /buildings/:id`
- **Quyền truy cập**: Public / Authenticated
- **Params**: `id` - Mã ObjectId của Tòa Nhà
- **Response (200 OK)**: Chi tiết đối tượng Tòa Nhà.

---

### 4.3. Thêm Mới Tòa Nhà
- **Endpoint**: `POST /buildings`
- **Quyền truy cập**: `Bearer Token` (`SYSTEM_ADMIN`)
- **Header**: `Authorization: Bearer <accessToken>`
- **Request Body**:
```json
{
  "name": "Tòa S1.02",
  "code": "S1.02",
  "address": "Khu đô thị Vinhomes Grand Park, Phường Long Bình, TP. Thủ Đức, TP. Hồ Chí Minh",
  "totalFloors": 26,
  "totalApartments": 520,
  "hotline": "02887654321",
  "description": "Sảnh phụ tầng 1 đối diện siêu thị mini"
}
```
- **Response (201 Created)**: Đối tượng Tòa Nhà mới được tạo.

---

### 4.4. Cập Nhật Thông Tin Tòa Nhà
- **Endpoint**: `PATCH /buildings/:id`
- **Quyền truy cập**: `Bearer Token` (`SYSTEM_ADMIN`)
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của Tòa Nhà
- **Request Body**: Các trường cần cập nhật (`name`, `address`, `totalFloors`, `hotline`, `status`, `description`).
- **Response (200 OK)**: Đối tượng Tòa Nhà sau khi cập nhật.

---

### 4.5. Xóa Tòa Nhà
- **Endpoint**: `DELETE /buildings/:id`
- **Quyền truy cập**: `Bearer Token` (`SYSTEM_ADMIN`)
- **Header**: `Authorization: Bearer <accessToken>`
- **Params**: `id` - Mã ObjectId của Tòa Nhà cần xóa
- **Ràng buộc bảo vệ dữ liệu**: Nếu tòa nhà đang có cư dân (`role: RESIDENT`) hoặc ban quản lý (`role: BUILDING_ADMIN`) liên kết, hệ thống sẽ từ chối xóa và ném lỗi `400 BadRequestException`.
- **Response (200 OK)**: Đối tượng Tòa Nhà đã bị xóa.
