# Module Quản Lý Bưu Kiện & Giao Nhận (Packages Module)

## 1. Tổng Quan Module

Module `Packages` là trái tim nghiệp vụ của hệ thống Smart Locker, điều phối toàn bộ chu trình xử lý bưu phẩm từ khi hàng tới chung cư cho đến khi đến tay cư dân:
- **Tài xế giao hàng không cần tài khoản (No-Auth Guest Shipper)**: Cho phép tài xế của mọi đơn vị vận chuyển (Shopee Xpress, GHTK, GHN, Viettel Post, GrabExpress...) quét mã QR trên thân tủ để gửi hàng mà không cần cài ứng dụng hay đăng ký tài khoản.
- **Hệ thống sinh mã kép (Dual Retrieval Methods)**: Sinh đồng thời mã OTP 6 số bảo mật (dùng nhập trên bàn phím/màn hình Kiosk) và mã QR Token động (dùng quét trước camera của trạm tủ).
- **Thông báo thời gian thực (Real-time Notifications)**: Ngay khi shipper hoàn tất đóng tủ, hệ thống tự động phát sự kiện WebSocket tới phòng riêng của cư dân (`resident_{residentId}`) để gửi thông báo tức thì lên điện thoại.
- **Tác vụ nền tự động hóa (Automated Cronjobs)**: Tự động rà soát bưu kiện theo từng giờ bằng `@nestjs/schedule`, chuyển trạng thái các đơn quá 48 giờ chưa lấy sang `OVERDUE` để Ban Quản Lý có kế hoạch xử lý.
- **Ghi vết kiểm toán (Audit Trail)**: Mọi thao tác gửi hàng, lấy hàng bằng OTP/QR đều được lưu vết sang bảng `LockerLog` phục vụ giải quyết khiếu nại.

---

## 2. Mô Hình Dữ Liệu (Package Schema Definition)

Bảng dữ liệu `packages` trong MongoDB:

| Trường Dữ Liệu | Kiểu Dữ Liệu | Ràng Buộc | Ý Nghĩa Nghiệp Vụ & Thiết Kế |
| :--- | :--- | :--- | :--- |
| `_id` | `Types.ObjectId` | Tự động sinh | Khóa chính duy nhất của bưu kiện |
| `trackingNumber` | `String` | `required, uppercase, trim, index` | Mã vận đơn của nhà vận chuyển (ví dụ: `SPX839201948`) |
| `lockerId` | `Types.ObjectId` | `ref: 'Locker', required, index` | Trạm tủ đang lưu giữ bưu phẩm |
| `boxId` | `Types.ObjectId` | `ref: 'Box', required, index` | Ngăn tủ con cụ thể chứa bưu phẩm |
| `boxNumber` | `Number` | `required, min: 1` | Số thứ tự ngăn tủ (in trên mặt ngoài cánh tủ) |
| `boxSize` | `String (Enum)` | `enum: BoxSize, required` | Phân loại cỡ ngăn tủ (`SMALL`, `MEDIUM`, `LARGE`) |
| `buildingId` | `Types.ObjectId` | `ref: 'Building', required, index` | Tòa nhà của cư dân thụ hưởng |
| `residentId` | `Types.ObjectId` | `ref: 'User', required, index` | Tài khoản cư dân (dùng để phân quyền truy cập) |
| `receiverPhone` | `String` | `required, trim` | **Snapshot**: SĐT người nhận tại thời điểm gửi hàng |
| `receiverName` | `String` | `required, trim` | **Snapshot**: Họ tên người nhận tại thời điểm gửi hàng |
| `apartment` | `String` | `required, trim` | **Snapshot**: Số căn hộ người nhận tại thời điểm gửi hàng |
| `shipperPhone` | `String` | `required, trim, index` | Số điện thoại của tài xế thực hiện gửi hàng |
| `shipperName` | `String` | `optional, trim` | Tên của tài xế (nếu có cung cấp) |
| `carrierName` | `String` | `required, trim` | Đơn vị vận chuyển (ví dụ: *Shopee Xpress, GHTK*) |
| `pinCode` | `String` | `required, index, trim` | Mã OTP nhận hàng gồm 6 số ngẫu nhiên duy nhất trong trạm |
| `qrCodeToken` | `String` | `required, unique, index` | Chuỗi token bảo mật 32 ký tự hex render mã QR động |
| `failedAttempts` | `Number` | `default: 0` | Số lần nhập sai mã OTP liên tiếp tại trạm tủ |
| `lockedUntil` | `Date` | `optional` | Thời điểm mở khóa nếu bị tạm khóa do nhập sai quá 5 lần |
| `status` | `String (Enum)` | `enum: PackageStatus, default: WAITING_FOR_PICKUP` | Trạng thái: `WAITING_FOR_PICKUP`, `PICKED_UP`, `OVERDUE`, `RETURNED` |
| `droppedOffAt` | `Date` | `required, default: Date.now` | Thời điểm tài xế gửi hàng vào ngăn tủ thành công |
| `pickedUpAt` | `Date` | `optional` | Thời điểm cư dân mở tủ lấy hàng ra |
| `expiredAt` | `Date` | `required` | Hạn chót lấy hàng (mặc định = `droppedOffAt` + 48 giờ) |
| `note` | `String` | `optional, trim` | Ghi chú thêm về kiện hàng (ví dụ: *Hàng dễ vỡ*) |

> **Thiết kế Snapshotting (Extended Reference Pattern):**
> Ba trường `receiverPhone`, `receiverName`, `apartment` được lưu snapshot trực tiếp bên cạnh `residentId` nhằm đảm bảo **tính toàn vẹn lịch sử bất biến**. Nếu sau này cư dân chuyển căn hộ hoặc xóa tài khoản, lịch sử bưu kiện trong quá khứ vẫn giữ nguyên thông tin đúng với thời điểm giao hàng mà không bị sai lệch hay trả về `null`.

### Chỉ Mục Cơ Sở Dữ Liệu Tối Ưu (Indexes):
- `{ lockerId: 1, pinCode: 1, status: 1 }`: **Compound Index** (Cư dân bấm OTP tại Kiosk $\rightarrow$ Tìm kiếm bản ghi trong < 2ms).
- `{ residentId: 1, status: 1 }`: **Compound Index** (Tối ưu truy vấn danh sách kiện hàng đang chờ của cư dân trên Mobile App).
- `{ status: 1, expiredAt: 1 }`: **Compound Index** (Tối ưu tác vụ Cronjob rà soát các đơn hàng hết hạn sau 48h).

---

## 3. Các Trạng Thái Vòng Đời Bưu Kiện (`PackageStatus`)

```mermaid
stateDiagram-v2
    [*] --> WAITING_FOR_PICKUP: Shipper gửi hàng vào ngăn tủ (drop-off)
    WAITING_FOR_PICKUP --> PICKED_UP: Cư dân nhập đúng OTP hoặc quét QR
    WAITING_FOR_PICKUP --> OVERDUE: Quá hạn 48 giờ chưa lấy (Cronjob)
    OVERDUE --> PICKED_UP: Cư dân vẫn có thể lấy nếu BQL chưa thu hồi
    OVERDUE --> RETURNED: Ban Quản Lý thu hồi về kho hoặc hoàn trả đơn vị vận chuyển
    PICKED_UP --> [*]
    RETURNED --> [*]
```

---

## 4. Danh Sách API & Ma Trận Phân Quyền (RBAC Matrix)

| Endpoint | Method | Quyền Hạn | Chức Năng Nghiệp Vụ |
| :--- | :---: | :---: | :--- |
| `/packages/drop-off` | `POST` | **Public (Guest)** | Tài xế gửi hàng vào ngăn tủ, khóa Box, sinh OTP 6 số |
| `/packages/pickup/otp` | `POST` | **Public / Kiosk** | Cư dân nhập OTP 6 số tại màn hình trạm tủ để mở chốt |
| `/packages/pickup/qr` | `POST` | **Public / Kiosk** | Quét mã QR token trước camera trạm tủ để mở chốt |
| `/packages/my-packages`| `GET` | `RESIDENT` *(JWT)* | Cư dân xem danh sách các kiện hàng của chính mình |
| `/packages/:id` | `GET` | `RESIDENT` *(JWT)* | Xem chi tiết bưu kiện, ngăn chứa, hạn lấy |
| `/packages/:id/qr-token`| `GET`| `RESIDENT` *(JWT)* | Lấy mã QR Token động hiển thị trên ứng dụng di động |

---

## 5. Các Luồng Nghiệp Vụ Cốt Lõi

### 5.1. Luồng Tài Xế Gửi Hàng (`POST /packages/drop-off`)
```mermaid
sequenceDiagram
    autonumber
    actor Shipper as Tài Xế (Guest)
    participant API as Packages API
    participant DB as MongoDB
    actor Resident as Cư Dân (App)

    Shipper->>API: Gửi thông tin (lockerCode, boxNumber, receiverPhone, trackingNumber, carrierName)
    API->>DB: Kiểm tra ngăn tủ boxNumber có AVAILABLE không
    API->>DB: Kiểm tra SĐT cư dân có hợp lệ trong tòa nhà không
    API->>API: Sinh ngẫu nhiên mã OTP 6 số (chống trùng lặp trong trạm tủ)
    API->>API: Sinh ngẫu nhiên mã QR Token 32 ký tự hex
    API->>DB: Tạo bản ghi Package (status: WAITING_FOR_PICKUP, expiredAt = now + 48h)
    API->>DB: Đổi Box sang OCCUPIED, doorStatus = OPEN, hasItem = true
    API->>DB: Ghi nhật ký LockerLog (action: DROP_OFF, status: SUCCESS)
    API->>Resident: Bắn sự kiện WebSocket (PACKAGE_NEW) kèm OTP & số ngăn
    API-->>Shipper: Trả về kết quả thành công kèm lệnh kích hoạt mở cửa ngăn tủ
```

### 5.2. Luồng Nhận Hàng Bằng Mã OTP Tại Màn Hình Kiosk (`POST /packages/pickup/otp`)
```mermaid
sequenceDiagram
    autonumber
    actor Resident as Cư Dân
    participant Kiosk as Màn Hình Kiosk Tủ
    participant API as Packages API
    participant DB as MongoDB

    Resident->>Kiosk: Bấm số ngăn và nhập mã OTP 6 chữ số
    Kiosk->>API: Gửi lockerCode & pinCode
    API->>DB: Tìm Package theo lockerCode, pinCode, status=WAITING_FOR_PICKUP
    alt Đúng mã OTP và không bị tạm khóa
        API->>DB: Đổi Package sang PICKED_UP, pickedUpAt = now
        API->>DB: Giải phóng Box sang AVAILABLE, doorStatus = OPEN, hasItem = false
        API->>DB: Ghi nhật ký LockerLog (action: PICKUP_OTP, status: SUCCESS)
        API-->>Kiosk: 200 OK -> Mở chốt Solenoid ngăn tủ cho cư dân lấy đồ
    else Sai mã OTP
        API-->>Kiosk: 400 BadRequestException (Thông báo mã OTP không hợp lệ)
    end
```

---

## 6. Cơ Chế Bảo Mật & Chống Gian Lận (Security Rules)

1. **Chống Xung Đột Mã OTP (PIN Collision Avoidance)**:
   - Hệ thống đảm bảo tại một thời điểm, **không bao giờ có 2 bưu kiện khác nhau trong cùng một trạm tủ sở hữu chung mã OTP 6 số**. Thuật toán tạo mã có vòng lặp đối soát với cơ sở dữ liệu trước khi cấp phát.
2. **Chống Tấn Công Dò Mã (Brute-force Protection)**:
   - Mỗi bưu kiện ghi nhận số lần nhập sai liên tiếp (`failedAttempts`). Nếu nhập sai quá 5 lần, ngăn tủ sẽ tự động kích hoạt thời gian khóa tạm thời (`lockedUntil: +15 phút`) để ngăn chặn việc dò mã tại bàn phím Kiosk.
3. **Mã QR Động 32 Ký Tự Hex**:
   - Thay vì dùng ID đơn hàng cố định dễ bị đoán, mã QR Token được mã hóa từ nguồn ngẫu nhiên `crypto.randomBytes(16).toString('hex')`, chỉ có giá trị khi đơn hàng đang ở trạng thái `WAITING_FOR_PICKUP`.
