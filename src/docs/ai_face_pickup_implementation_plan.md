# Kế Hoạch Triển Khai Chi Tiết: Nhận Diện Khuôn Mặt AI Với ESP32-CAM (Phase 2)

> **Dự án:** Hệ Thống Tủ Đồ Thông Minh (Smart Locker System)  
> **Giai đoạn:** Phase 2 — Nhận Diện Khuôn Mặt AI & Mở Tủ Rảnh Tay (Touchless AI Face Pickup)  
> **Thiết bị:** ESP32-CAM (AI-Thinker OV2640) + ESP32 DevKit V1 (Main Controller TFT LCD) + NestJS Backend  
> **Tài liệu tham chiếu:** [ai_face_verification_specification.md](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/server/src/docs/ai_face_verification_specification.md), [packages.controller.ts](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/server/src/packages/packages.controller.ts)

---

## 1. TỔNG QUAN MỤC TIÊU & NGHIỆP VỤ

### 1.1. Mục Tiêu Giai Đoạn 2
Triển khai hoàn chỉnh tính năng lấy hàng rảnh tay (Phone-less Kiosk Pickup):
1. Cư dân không cần mang theo điện thoại, chỉ cần chạm chọn nút **"FACE ID"** trên màn hình cảm ứng LCD của Kiosk.
2. ESP32 Main kích hoạt ESP32-CAM qua chân Trigger GPIO và chuyển LCD sang màn hình hướng dẫn.
3. ESP32-CAM bật đèn Flash trợ sáng, chụp ảnh khuôn mặt JPEG độ phân giải VGA (640x480) và gửi HTTP POST đến NestJS Backend.
4. NestJS chạy pipeline AI 4 tầng:
   - **Tầng 1 (YuNet 2023mar):** Phát hiện mặt & 5 điểm mốc (landmarks), xoay ngang trục mắt và căn chỉnh chuẩn 112x112.
   - **Tầng 2 (MobileNetV2 Liveness):** Kiểm tra chống giả mạo (Anti-Spoofing, ngưỡng $\ge 0.70$).
   - **Tầng 3 (MobileFaceNet ArcFace):** Trích xuất vector đặc trưng 512 chiều.
   - **Tầng 4 (1:N Local Scope Matching):** So khớp Cosine Similarity với danh sách cư dân đang có đơn hàng chờ lấy (`WAITING_FOR_PICKUP`) tại trạm tủ hiện tại (ngưỡng $\ge 0.48$).
5. **Khi xác thực thành công:**
   - Server cập nhật trạng thái bưu kiện sang `PICKED_UP`, giải phóng ô tủ sang `AVAILABLE`.
   - Server ghi nhật ký hệ thống `LockerLog` (`PICKUP_FACE_ID`).
   - Server publish lệnh MQTT `smartlocker/{lockerCode}/control` với payload `{ command: "UNLOCK", boxNumber: X }`.
   - ESP32 Main nhận bản tin MQTT, kích hoạt rơ-le mở chốt khóa Solenoid 12V và cập nhật LCD sang `STATE_SUCCESS` hiển thị tên cư dân và số ô tủ.
6. **Khi xác thực thất bại:**
   - Server trả mã lỗi tương ứng (403: Giả mạo màn hình/ảnh in; 401: Không tìm thấy đơn hàng khớp).
   - ESP32-CAM phản hồi về ESP32 Main hoặc ESP32 Main đếm Timeout 8 giây $\rightarrow$ hiển thị thông báo lỗi thân thiện trên LCD và đề xuất nhập mã PIN dự phòng.

---

## 2. KIẾN TRÚC PHẦN CỨNG & SƠ ĐỒ ĐẤU NỐI (PINOUT MAPPING)

### 2.1. Phân Bổ Chân GPIO Giữa ESP32 Main & ESP32-CAM

```
+------------------------------------+           +------------------------------------+
|        ESP32 DevKit V1             |           |       AI-Thinker ESP32-CAM         |
|        (Main Controller)           |           |          (Camera Kiosk)            |
|                                    |           |                                    |
|   GPIO 22 (CAM_TRIGGER_OUT) ------>|==========>| GPIO 13 (TRIGGER_INPUT)            |
|   GPIO 25 (CAM_STATUS_IN) <--------|<==========| GPIO 12 (STATUS_FEEDBACK_OUT)      |
|   GND                              |-----------| GND (Chung mass hệ thống)          |
+------------------------------------+           +------------------------------------+
```

| Chân trên ESP32 Main | Chân trên ESP32-CAM | Loại tín hiệu | Vai trò & Trạng thái logic |
| :--- | :--- | :--- | :--- |
| **GPIO 22** | **GPIO 13** | Xung kích hoạt (Trigger) | Mặc định `LOW`. Khi cư dân bấm "FACE ID", Main kéo lên `HIGH` (100ms) để Cam chụp ảnh. |
| **GPIO 25** | **GPIO 12** | Phản hồi lỗi (Optional Feedback) | Mặc định `LOW`. Nếu Cam gặp lỗi HTTP 401/403 từ server, Cam kéo lên `HIGH` để Main báo lỗi ngay không cần chờ timeout. |
| **GND** | **GND** | Mass chung | **Bắt buộc nối chung GND** giữa 2 board để tham chiếu mức logic chính xác. |

> [!NOTE]
> - Trên ESP32-CAM, chân `GPIO 13` và `GPIO 12` là các chân header ngoại vi (HS2_DATA của SD Card slot), hoàn toàn an toàn khi không lắp thẻ nhớ MicroSD.
> - Trên ESP32 Main, các chân TFT SPI (18, 19, 23, 15, 2, 4, 21), Relay (13), Reed (14), IR (27) đã được sử dụng. Chân `GPIO 22` và `GPIO 25` hoàn toàn còn trống.

---

## 3. CHI TIẾT TỪNG MODULE CẦN TRIỂN KHAI

### 3.1. Module Firmware ESP32-CAM (`smart-locker-cam`)

Tổ chức lại thư mục theo cấu trúc chuẩn:
```
smart-locker-cam/
├── include/
│   └── CameraPins.h
├── src/
│   ├── config/
│   │   └── CamConfig.h        // WiFi credentials, Backend API URL, Locker Code, Pins
│   ├── network/
│   │   ├── CamNetwork.h       // Quản lý kết nối WiFi tự động phục hồi
│   │   └── CamNetwork.cpp
│   ├── camera/
│   │   ├── CameraManager.h    // Khởi tạo OV2640, chụp ảnh, quản lý Flash LED
│   │   └── CameraManager.cpp
│   ├── api/
│   │   ├── CamApiClient.h     // Đóng gói HTTP POST gửi ảnh và nhận diện
│   │   └── CamApiClient.cpp
│   └── main.cpp               // Vòng lặp chính, lắng nghe chân Trigger
└── platformio.ini
```

### 3.1. Module Firmware ESP32-CAM AI Vision Node (`smart-locker-cam`) - [ĐÃ HOÀN THÀNH]

#### Các Chức Năng Cốt Lõi:
1. **[CamConfig.h](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-cam/include/CamConfig.h)**:
   - `WIFI_SSID`, `WIFI_PASSWORD` (Đồng bộ với hệ thống mạng của trạm tủ).
   - `API_BASE_URL`: `http://10.225.249.145:5005`.
   - `PICKUP_FACE_ENDPOINT`: `/packages/pickup/face`.
   - `LOCKER_CODE`: `LK-TECCO-01`.
   - `LOCKER_API_KEY`: `secret-key-lk-tecco-01`.
   - `TRIGGER_PIN`: 13 (`INPUT_PULLDOWN`, nhận xung từ chân GPIO 26 của ESP32-Main).
   - `FEEDBACK_PIN`: 12 (`OUTPUT`, gửi xung báo lỗi về chân 25 của ESP32-Main).
2. **[CameraManager](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-cam/src/camera/CameraManager.cpp)**:
   - Khởi tạo camera OV2640 với độ phân giải `FRAMESIZE_VGA` (640x480), chất lượng JPEG `10` (PSRAM).
   - Cấu hình kích hoạt Auto Exposure (`AEC`), Auto White Balance (`AWB`), Auto Gain (`AGC`) và cân bằng độ tương phản để chụp rõ nét trong điều kiện ánh sáng tự nhiên.
   - Hàm `capturePhoto()`: Tắt hoàn toàn Flash LED (`GPIO 4`), tự động xả bỏ khung hình tĩnh cũ trong DMA buffer (`stale buffer flush`), sau đó lấy khung hình mới nhất tức thời tại thời điểm vừa đếm ngược xong.
3. **[ApiClient](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-cam/src/api/ApiClient.cpp)**:
   - Gửi yêu cầu HTTP POST dạng `multipart/form-data`:
     - Header: `x-api-key: secret-key-lk-tecco-01`
     - Header: `x-locker-code: LK-TECCO-01`
     - Query: `?lockerCode=LK-TECCO-01`
     - Body: File ảnh JPEG nhị phân (`name="file"`, dung lượng ~30-45KB).
   - Đọc kết quả HTTP status code:
     - `200 OK`: Xác thực thành công (Server gửi lệnh MQTT mở tủ tới ESP32-Main, ESP32-CAM nháy LED onboard 3 lần).
     - `400 / 401 / 403 / 500`: Thất bại.
4. **[main.cpp](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-cam/src/main.cpp)**:
   - Kiểm tra kết nối WiFi trước khi chụp, xả ảnh và truyền tải.
   - Hàm `sendErrorFeedback()`: Kích hoạt xung `HIGH` trong 200ms trên `FEEDBACK_PIN 12` về ESP32-Main trong mọi tình huống lỗi (mất WiFi, lỗi camera, phản hồi thất bại từ Server) để màn hình Kiosk cập nhật lỗi tức thì.

---

### 3.2. Module Firmware ESP32 Main Controller (`smart-locker-iot`) - [ĐÃ HOÀN THÀNH]

#### 1. Cấu Hình Phần Cứng ([Config.h](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-iot/src/config/Config.h)):
- Chân kích hoạt ESP32-CAM: `CAM_TRIGGER_PIN 26` (Output, tích cực `HIGH` trong 80ms khi đếm ngược về 0).
- Chân nhận phản hồi trạng thái từ ESP32-CAM: `CAM_STATUS_PIN 25` (Input pull-down, nhận báo lỗi từ Cam nếu HTTP request thất bại).
- Thời gian đếm ngược: `FACE_COUNTDOWN_SECONDS 3` (3 giây).
- Thời gian chờ tối đa: `FACE_VERIFY_TIMEOUT_MS 15000` (15 giây).

#### 2. Nâng Cấp Giao Diện Màn Hình Kiosk ([DisplayManager.h](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-iot/src/display/DisplayManager.h) & [DisplayManager.cpp](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-iot/src/display/DisplayManager.cpp)):
- **Tái bố cục màn hình Home (`STATE_IDLE`):** Bố trí 3 thẻ cảm ứng kích thước đều (rộng 94px, cao 152px):
  - Thẻ 1: **"MÃ PIN"** (Chuyển sang bàn phím cảm ứng nhập OTP).
  - Thẻ 2: **"QUÉT QR"** (Chuyển sang màn hình hiển thị mã QR động 60s).
  - Thẻ 3: **"FACE ID"** (Viền và nút màu tím công nghệ `#9333EA`, chuyển sang màn hình đếm ngược).
- **Trạng thái đếm ngược (`STATE_FACE_COUNTDOWN`):**
  - Khung ngắm khuôn mặt ở trung tâm với 4 góc viền Neon Cyan.
  - Số đếm ngược hiển thị to (Font 7 số 7 đoạn cao 48px) đếm từ 3 -> 2 -> 1 mỗi giây mà không gây giật màn hình.
  - Hướng dẫn trực quan: `"NHÌN VÀO CAMERA BÊN CẠNH ->"` kèm ghi chú `"Giữ thẳng mặt & không che mặt, đeo kính đen"`.
  - Nút `"< HỦY"` ở góc trên bên trái giúp người dùng có thể quay lại trang chủ bất cứ lúc nào.
- **Hiệu ứng màn trập giả lập flash (`triggerScreenFlashEffect`):**
  - Khi đếm ngược về 0, LCD chớp trắng 80ms giả lập màn trập máy ảnh để người dùng nhận biết ảnh đã được chụp mà không cần bật đèn flash chói mắt trên ESP32-CAM.
  - Đồng thời gọi callback `faceTriggerCallback()` kích hoạt xung `HIGH` trên `CAM_TRIGGER_PIN`.
- **Trạng thái đang xác thực (`STATE_FACE_PROCESSING`):**
  - Thông báo `"ĐÃ CHỤP XONG!"` (màu xanh lá) và `"Đang kiểm tra AI Anti-Spoofing & Face Match"`.
  - Hiệu ứng chấm loading `"Vui lòng đợi trong giây lát . .. ..."` mỗi 500ms.
  - Xử lý timeout 15 giây tự động quay về màn hình lỗi nếu không nhận được kết quả.

#### 3. Điều Phối Luồng Điều Khiển ([main.cpp](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-iot/src/main.cpp)):
- Khởi tạo chân `CAM_TRIGGER_PIN` (OUTPUT, LOW) và `CAM_STATUS_PIN` (INPUT_PULLDOWN).
- Đăng ký `setOnFaceTrigger`: phát xung `HIGH` trong 80ms cho ESP32-CAM.
- Vòng lặp `loop()`: Lắng nghe chân `CAM_STATUS_PIN` khi ở trạng thái `STATE_FACE_PROCESSING` để kịp thời báo lỗi nếu camera báo thất bại.
- Khi Server nhận diện khớp khuôn mặt, Server gửi lệnh MQTT `UNLOCK` tới topic `smartlocker/{lockerCode}/control` $\rightarrow$ [MqttManager.cpp](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/smart-locker-iot/src/mqtt/MqttManager.cpp) tự động điều khiển rơ-le mở khóa ngăn tủ và hiển thị màn hình mở tủ thành công `showSuccess(boxNumber)`.

---

### 3.3. Module Server Backend NestJS (`server`)

#### Cập Nhật [PickupAuthGuard](file:///c:/Users/Admin/Desktop/studyspace/DATN/smart-locker/server/src/auth/guards/pickup-auth.guard.ts):
- Đảm bảo `lockerCode` được trích xuất an toàn từ:
  ```typescript
  const lockerCode =
    request.headers['x-locker-code'] ||
    request.body?.lockerCode ||
    request.query?.lockerCode;
  ```
- Việc này giúp các thiết bị nhúng như ESP32-CAM truyền qua HTTP Header mà không gặp lỗi parse body khi upload `multipart/form-data`.

#### Cập Nhật Dữ Liệu Kiểm Thử (Seed Test Data):
1. **Tài khoản Cư Dân (Resident User):**
   - Đảm bảo cư dân có `faceAuth.enabled: true`.
   - Trường `faceAuth.embedding` chứa vector 512 số float được trích xuất từ ảnh mẫu thật của người kiểm thử (qua API `POST /users/enroll-face` hoặc script sinh mẫu).
2. **Kiện Hàng (Package):**
   - Tạo 1 bưu phẩm với `lockerId: LK-TECCO-01`, `boxNumber: 1`, `status: WAITING_FOR_PICKUP`, gắn với `residentId` của tài khoản trên.
3. **Trạm Tủ & Ngăn Tủ (Locker & Box):**
   - `code: LK-TECCO-01`, `apiKey: secret-key-lk-tecco-01`.
   - `boxNumber: 1` có `status: OCCUPIED`.

---

## 4. MA TRẬN KỊCH BẢN KIỂM THỬ (TEST SCENARIOS)

| STT | Kịch bản kiểm thử | Hành động thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **TC-01** | **Xác thực thành công (Happy Path)** | Cư dân đã đăng ký Face ID đứng trước camera và bấm "FACE ID" trên LCD. | - Flash LED bật sáng, chụp ảnh.<br>- Backend trả về 200 OK với matchScore $\ge 0.48$.<br>- MQTT bắn lệnh `UNLOCK` Ngăn #1.<br>- Solenoid mở chốt khóa 12V.<br>- LCD hiển thị "HELLO [Tên Cư Dân] - BOX #01 OPENED". |
| **TC-02** | **Chống giả mạo ảnh in (Anti-Spoofing Print)** | Đưa ảnh chân dung in màu trên giấy A4 trước camera ESP32-CAM và bấm "FACE ID". | - Backend phát hiện Liveness Score $< 0.70$.<br>- Backend trả mã `403 Forbidden: SPOOF_DETECTED`.<br>- Không gửi lệnh mở khóa MQTT.<br>- LCD Kiosk báo lỗi "PHÁT HIỆN GIẢ MẠO! VUI LÒNG DÙNG MÃ PIN". |
| **TC-03** | **Chống giả mạo video màn hình (Replay Attack)** | Mở video/ảnh selfie trên màn hình smartphone đưa trước camera. | - Backend phát hiện ánh sáng phản chiếu màn hình (Liveness $< 0.70$).<br>- Backend từ chối mở tủ.<br>- Không có sự cố mở sai ngăn. |
| **TC-04** | **Người lạ không có đơn hàng (No Match)** | Người chưa từng đăng ký hoặc không có kiện hàng nào tại trạm tủ đứng trước camera. | - Backend phát hiện mặt thật (Liveness $\ge 0.70$) nhưng Cosine Score $< 0.48$.<br>- Backend trả về `401 Unauthorized`.<br>- LCD hiển thị "KHÔNG TÌM THẤY ĐƠN HÀNG NÀO CHO BẠN". |
| **TC-05** | **Bảo vệ Timeout mạng (Network Timeout)** | Rút dây mạng hoặc tắt server Backend và bấm "FACE ID". | - ESP32-CAM không kết nối được hoặc timeout HTTP.<br>- Sau 8 giây, ESP32 Main tự động chuyển về màn hình lỗi kèm hướng dẫn nhập mã PIN bàn phím. |

---

## 5. LỘ TRÌNH THỰC HIỆN TỪNG BƯỚC (STEP-BY-STEP CHECKLIST)

- [ ] **Bước 1 (Backend Guard & Test Data):**
  - Cập nhật `PickupAuthGuard` hỗ trợ header `x-locker-code`.
  - Đăng ký khuôn mặt mẫu thật của tester vào database qua API `/users/enroll-face`.
  - Tạo đơn hàng chờ nhận `WAITING_FOR_PICKUP` tại ô tủ #1 trạm `LK-TECCO-01`.
- [ ] **Bước 2 (Firmware ESP32-CAM):**
  - Viết cấu trúc module hóa cho `smart-locker-cam`: WiFi connection, Flash control, HTTP client upload.
  - Lập trình bắt xung kích hoạt trên chân `GPIO 13`.
  - Test chụp ảnh và gửi trực tiếp lên Backend bằng Serial Monitor.
- [ ] **Bước 3 (Firmware ESP32 Main):**
  - Bổ sung nút bấm "FACE ID" trên màn hình Home của `DisplayManager`.
  - Thêm giao diện `STATE_FACE_SCAN`.
  - Cấu hình chân `GPIO 22` xuất xung trigger khi chạm nút Face ID.
  - Tích hợp timeout an toàn 8 giây.
- [ ] **Bước 4 (Đấu nối phần cứng & Chạy thử End-to-End):**
  - Nối dây `GPIO 22` (Main) sang `GPIO 13` (Cam), nối chung dây `GND`.
  - Chạy thử nghiệm thực tế toàn bộ 5 kịch bản kiểm thử.
  - Tinh chỉnh góc camera, độ sáng đèn Flash và ngưỡng tương đồng nếu cần thiết.
