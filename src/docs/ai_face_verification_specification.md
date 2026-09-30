# Đặc Tả Kỹ Thuật Hệ Thống Nhận Diện Khuôn Mặt AI (AI Face Verification & Anti-Spoofing Specification)

> **Dự án:** Smart Locker System (Hệ thống Tủ đồ Thông minh)  
> **Module:** AI Biometric Verification (Xác thực Sinh trắc học Khuôn mặt Kiosk & Mobile)  
> **Phần cứng:** ESP32 Controller chính + ESP32-CAM (OV2640) + Màn hình cảm ứng LCD TFT 320x240  
> **Tài liệu tham chiếu:** `delivery_retrieval_system.md`, `smart_locker_master_plan.md`, `smart-locker-iot/`  
> **Phiên bản:** 2.4.0 — Tích hợp YuNet 2023mar Landmark Alignment, MiniFASNet V2 Anti-Spoofing & ArcFace 512-d

---

## 1. TỔNG QUAN & MỤC TIÊU HỆ THỐNG

### 1.1. Mục Tiêu Nghiệp Vụ
1. **Lấy hàng rảnh tay không cần điện thoại (Phone-less Kiosk Touchless Pickup):** Cư dân đi tập thể dục, dắt thú cưng, để quên điện thoại ở nhà hoặc điện thoại hết pin vẫn có thể lấy hàng bằng cách chạm chọn "FACE ID" trên màn hình LCD trạm tủ và nhìn vào camera ESP32-CAM.
2. **Linh hoạt đa phương thức (Dual-Channel Verification):** Hỗ trợ nhận diện khuôn mặt qua cả 2 kênh:
   - **Kênh Kiosk vật lý:** Camera nhúng ESP32-CAM tại trạm tủ kết hợp màn hình LCD cảm ứng.
   - **Kênh Di động (Mobile App):** Camera trước của smartphone thông qua ứng dụng React Native.
3. **Bảo vệ bưu phẩm giá trị cao (High-Value Parcels KYC):** Đối với các bưu kiện đắt tiền, hệ thống bắt buộc xác thực sinh trắc học để ký nhận điện tử và lưu vết bằng chứng đối soát (`Audit Log`), loại bỏ 100% rủi ro chối bỏ nhận hàng.
4. **Phòng chống gian lận đa dạng (Anti-Spoofing):** Phát hiện và từ chối các hành vi dùng ảnh in màu, video quay lại từ màn hình điện thoại/tablet (Replay Attack) hoặc mặt nạ silicon để qua mặt hệ thống.
5. **Thu thập mẫu khuôn mặt chuẩn & Hỗ trợ eKYC (Mobile Biometric Enrollment & eKYC):** Cư dân đăng ký khuôn mặt mẫu đối chứng (Ground Truth) thông qua camera selfie của điện thoại với cơ chế linh hoạt (cho phép bỏ qua lúc tạo tài khoản và thiết lập sau trong cài đặt bảo mật), đồng thời hỗ trợ Ban Quản Lý (BQL) xem xét ảnh chân dung thực tế khi duyệt cư dân vào tòa nhà.
6. **Điểm nhấn học thuật đồ án (Academic AIoT Value):** Kết hợp trọn vẹn 3 trụ cột: **IoT nhúng (ESP32 + ESP32-CAM + LCD)**, **Điện toán đám mây (NestJS + MQTT)** và **Trí tuệ nhân tạo (Mô hình MiniFASNet V2 Anti-Spoofing + YuNet Landmark Alignment + MobileFaceNet ArcFace 512-d)** với độ trễ phản hồi toàn trình dưới 1.0 giây và tiết kiệm tối đa bộ nhớ RAM.

---

## 2. KIẾN TRÚC MÔ HÌNH AI (AI PIPELINE ARCHITECTURE)

Pipeline nhận diện khuôn mặt gồm **4 tầng xử lý liên hoàn (Sequential Pipeline)** chạy trên Server NestJS thông qua `onnxruntime-node`:

```mermaid
graph TD
    A["Ảnh JPEG từ ESP32-CAM (Kiosk) hoặc Mobile App"] --> B["BƯỚC 1: Face Detection & 5-Landmark Alignment<br/>(YuNet 2023mar ONNX - 232 KB)"]
    
    B -->|Bounding Box & Tỷ lệ mở rộng Scale 2.7 (80x80)| C["BƯỚC 2: Face Anti-Spoofing<br/>(MiniFASNet V2 ONNX - 3.0 MB)"]
    
    C -->|Liveness Score < 0.75| D["🛑 TỪ CHỐI MỞ TỦ (SPOOF DETECTED)<br/>Phát hiện ảnh in / màn hình điện thoại giả mạo"]
    
    C -->|Liveness Score >= 0.75| E["BƯỚC 3: Feature Extraction<br/>(MobileFaceNet ArcFace ONNX -> 512-d Vector)"]
    B -->|Ảnh 112x112 căn chỉnh ngang trục mắt| E
    
    E --> F["BƯỚC 4: 1:N Local Scope Matching<br/>(Cosine Similarity với cư dân có đơn tại trạm tủ này)"]
    
    F -->|Cosine Score < 0.48| G["❌ KHÔNG TRÙNG KHỚP<br/>Báo lỗi trên LCD Kiosk & Yêu cầu nhập PIN"]
    F -->|Cosine Score >= 0.48| H["✅ XÁC THỰC THÀNH CÔNG<br/>Gửi lệnh MQTT mở rơ-le Solenoid đúng ngăn tủ"]
```

### Danh Sách Trọng Số Mô Hình Trong Bộ Nhớ RAM (`server/src/ai/models/`):
| STT | Tên File Mô Hình | Kiến Trúc Mạng | Dung Lượng | Chức Năng Chính |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `face_detection_yunet_2023mar.onnx` | YuNet (Libfacedetection) | 232 KB | Phát hiện khuôn mặt và trích xuất 5 điểm mốc (Landmarks) |
| 2 | `minifasnet_v2.onnx` | MiniFASNet V2 (Silent-Face-Anti-Spoofing) | 3.0 MB | Kiểm tra độ sống/chân thực, chống tấn công màn hình/ảnh in |
| 3 | `mobilefacenet_arcface.onnx` | MobileFaceNet ArcFace | 13.6 MB | Trích xuất vector đặc trưng khuôn mặt không gian 512 chiều |

---

## 3. CHI TIẾT KỸ THUẬT TỪNG TẦNG AI

### 3.1. Tầng 1: Phát Hiện & Căn Chỉnh Trục Mắt (Face Detection & 5-Landmark Alignment)
* **Nhiệm vụ:** Phát hiện vùng mặt, trích xuất chính xác 5 điểm mốc đặc trưng, xoay ảnh để trục 2 mắt nằm ngang tuyệt đối và chuẩn bị tọa độ hộp cắt cho Anti-Spoofing.
* **Mô hình:** **YuNet 2023mar (`face_detection_yunet_2023mar.onnx`)** với cấu trúc FPN siêu nhẹ:
  - 3 tầng Feature Map Strides: $S \in \{8, 16, 32\}$.
  - 4 đầu ra (Heads): `cls_S` (phân loại mặt), `obj_S` (độ tin cậy objectness), `bbox_S` (hộp giới hạn), `kps_S` (5 tọa độ điểm mốc).
  - Điểm số tự tin: $\text{score} = \sqrt{\text{clamp}(\text{cls}, 0, 1) \times \text{clamp}(\text{obj}, 0, 1)}$.
* **5 Điểm mốc (Facial Landmarks):**
  1. Mắt phải của người ($n=0$, bên trái ảnh)
  2. Mắt trái của người ($n=1$, bên phải ảnh)
  3. Chóp mũi ($n=2$)
  4. Khóe miệng phải ($n=3$)
  5. Khóe miệng trái ($n=4$)
* **Kỹ thuật Căn Chỉnh Hình Học (Affine Similarity Alignment cho ArcFace):**
  - Góc nghiêng trục mắt: $\theta = \operatorname{atan2}(\Delta y, \Delta x) = \operatorname{atan2}(y_{\text{left}} - y_{\text{right}}, x_{\text{left}} - x_{\text{right}})$.
  - Xoay ảnh góc $-\theta$ quanh tâm ảnh để 2 mắt nằm ngang tuyệt đối.
  - Tỷ lệ co giãn: Dựa theo khoảng cách chuẩn của ArcFace trong ảnh $112 \times 112$ là $d_{\text{target}} \approx 35.2372\text{px}$.
  - Tọa độ tâm mắt chuẩn trong ảnh $112 \times 112$: $(x_{\text{center}}, y_{\text{center}}) = (55.91\text{px}, 51.60\text{px})$.
  - Cắt vùng mặt và đệm biên an toàn (Black Padding) tránh lỗi tràn viền khi mặt sát mép khung hình.

---

### 3.2. Tầng 2: Kiểm Tra Mặt Thật / Mặt Giả (Face Anti-Spoofing - MiniFASNet V2)
* **Bản chất bài toán:** Phân loại 3 lớp theo chuẩn kiến trúc *Silent-Face-Anti-Spoofing*:
  - Lớp 0: `Background / Non-face`
  - Lớp 1: `Real Face (Mặt người thật)`
  - Lớp 2: `Spoof Attack (Ảnh in 2D, màn hình điện thoại/laptop, mặt nạ 3D)`
* **Kiến trúc mạng:** **MiniFASNet V2** (File ONNX ~3.0 MB, suy luận siêu tốc ~15ms trên CPU).
* **Cơ chế Crop tỷ lệ mở rộng (Multi-scale Context Patching):**
  - Thay vì resize cả khung hình camera (vốn dễ bị phán đoán nhầm do cảm biến ESP32-CAM có nhiều nhiễu nền), hệ thống sử dụng Bounding Box từ YuNet và mở rộng theo tỷ lệ scale chuẩn $s = 2.7$:
    $$\text{Scale} = \min\left(\frac{H_{\text{src}} - 1}{\text{box}_h}, \frac{W_{\text{src}} - 1}{\text{box}_w}, 2.7\right)$$
  - Việc mở rộng $2.7\times$ giúp mô hình quan sát được cả đường viền màn hình điện thoại, tay cầm hoặc mép tờ giấy in.
* **Đầu vào:** Vùng ảnh crop mở rộng được resize về $80 \times 80 \times 3$, dữ liệu pixel raw RGB với dải giá trị $[0, 255]$ theo chuẩn định dạng Tensor NCHW `[1, 3, 80, 80]`.
* **Đầu ra:** Điểm tin cậy người thật qua hàm Softmax:
  $$\text{livenessScore} = P(\text{class}=1) = \frac{e^{\text{logit}_1}}{\sum_{j=0}^{2} e^{\text{logit}_j}}$$
* **Ngưỡng quyết định:** $\text{Liveness Score} \ge 0.75$ (75%) được xác nhận là người thật.

---

### 3.3. Tầng 3: Trích Xuất Vector Đặc Trưng (Face Embedding)
* **Mô hình:** **MobileFaceNet ArcFace (`mobilefacenet_arcface.onnx`)**.
* **Đầu vào:** Ảnh $112 \times 112 \times 3$ đã qua bước căn chỉnh 5 điểm mốc của YuNet, chuẩn hóa pixel về $[-1, 1]$ qua công thức:
  $$\text{pixel}_{\text{norm}} = \frac{\text{pixel} - 127.5}{128.0}$$
* **Đầu ra:** Vector đặc trưng không gian **512 chiều (512-dimensional float vector)**.
* **Chuẩn hóa L2 Norm:**
  $$\mathbf{e}_{\text{norm}} = \frac{\mathbf{e}}{\|\mathbf{e}\|_2} = \frac{\mathbf{e}}{\sqrt{\sum_{i=1}^{512} e_i^2}}$$

---

### 3.4. Tầng 4: Thuật Toán So Khớp Phạm Vi Cục Bộ (1:N Local Scope Matching)
Để loại bỏ nguy cơ nhận diện nhầm (False Acceptance) khi hệ thống có hàng ngàn cư dân, hệ thống áp dụng cơ chế **Phạm vi Cục bộ (Local Scope)**:
1. Khi nhận được ảnh từ trạm tủ `lockerCode` (ví dụ `LK-S101-01`), server chỉ truy vấn danh sách các bưu phẩm đang nằm tại trạm tủ này:
   ```typescript
   const activePackages = await packageModel.find({
     lockerId: locker._id,
     status: PackageStatus.WAITING_FOR_PICKUP,
   }).populate({
     path: 'residentId',
     select: '+faceAuth.embedding faceAuth.enabled name phone apartment avatar',
   });
   ```
2. Hệ thống tính độ tương đồng Cosine giữa vector khuôn mặt camera $\mathbf{u}$ với $N$ cư dân đang có đơn hàng chờ nhận ($N \approx 5 - 20$ người):
   $$\text{Cosine Similarity}(\mathbf{u}, \mathbf{v}_k) = \mathbf{u} \cdot \mathbf{v}_k = \sum_{i=1}^{512} u_i \cdot v_{k,i}$$
3. **Ngưỡng chấp nhận trùng khớp:** $\text{Score} \ge 0.48$ (48.0% đối với không gian vector ArcFace 512 chiều).
   - Với quy trình căn chỉnh Landmark và lọc Anti-Spoofing mới, ảnh chụp từ ESP32-CAM của cùng một người đạt độ tương đồng từ **`71% - 85%`**, vượt xa ngưỡng an toàn $0.48$.

---

## 4. THIẾT KẾ CƠ SỞ DỮ LIỆU & SCHEMA DATABASE (MONGODB)

### 4.1. Cập Nhật Thực Thể `User` (`users` collection)
Lưu trữ vector sinh trắc học 512 chiều và trạng thái Face ID trong trường lồng nhau `faceAuth`:
```typescript
// server/src/users/schemas/user.schema.ts
@Prop({
  type: {
    enabled: { type: Boolean, default: false },
    embedding: { type: [Number], select: false, default: [] }, // Vector 512 số float, ẩn khỏi query thông thường
    enrolledAt: { type: Date, default: null },
  },
  _id: false,
  default: () => ({ enabled: false, embedding: [] }),
})
faceAuth: {
  enabled: boolean;
  embedding?: number[];
  enrolledAt?: Date;
};
```

---

## 5. QUY TRÌNH NGHIỆP VỤ & SEQUENCE DIAGRAM KIOSK FACE ID

```mermaid
sequenceDiagram
    autonumber
    actor Resident as Cư Dân
    participant LCD as Màn Hình LCD TFT 320x240
    participant MainESP as ESP32 Controller Chính
    participant CamESP as ESP32-CAM (AI-Thinker)
    participant Nest as NestJS Server (AI Engine)
    participant MQTT as Mosquitto MQTT Broker
    participant Solenoid as Khóa Solenoid Ngăn Tủ

    Resident->>LCD: 1. Chạm nút "FACE ID" trên màn hình Home
    LCD->>MainESP: 2. Sự kiện chạm cảm ứng
    MainESP->>LCD: 3. Chuyển sang STATE_FACE_SCAN ("Looking at camera...")
    MainESP->>CamESP: 4. Kích hoạt chân Trigger GPIO 21 -> HIGH
    
    CamESP->>CamESP: 5. Bật Flash LED (GPIO 4) & Chụp ảnh JPEG
    CamESP->>Nest: 6. HTTP POST /packages/pickup/face { lockerCode, file / imageBase64 }
    
    Note over Nest: 7. Tầng 1: YuNet phát hiện khuôn mặt & Bounding Box & 5 điểm mốc
    Note over Nest: 8. Tầng 2: Anti-Spoofing MiniFASNet V2 (Crop Scale 2.7 -> 80x80)
    alt Phát hiện dùng ảnh in / màn hình điện thoại giả mạo (Liveness < 0.75)
        Nest-->>CamESP: 403 Forbidden: SPOOF_DETECTED
        CamESP-->>MainESP: Phản hồi UART báo lỗi giả mạo
        MainESP->>LCD: Hiển thị STATE_ERROR ("SPOOF DETECTED! USE PIN")
    else Là mặt người thật (Liveness >= 0.75)
        Note over Nest: 9. Tầng 3: Căn chỉnh xoay ngang mắt 112x112 -> MobileFaceNet trích xuất 512-d
        Note over Nest: 10. Tầng 4: So khớp Cosine 1:N với các đơn hàng tại trạm tủ
        alt Không tìm thấy đơn hàng nào khớp với khuôn mặt (Score < 0.48)
            Nest-->>CamESP: 401 Unauthorized: NO_MATCH_FOUND
            MainESP->>LCD: Hiển thị STATE_ERROR ("NO PARCEL FOUND FOR YOU")
        else Khớp thành công Cư dân A (Score >= 0.48, Ngăn tủ số 04)
            Nest->>MQTT: Publish topic `smartlocker/LK-S101-01/control` { boxNumber: 4, cmd: "UNLOCK" }
            MQTT->>MainESP: Nhận lệnh UNLOCK Box #04
            MainESP->>Solenoid: Kích rơ-le 12V nhả chốt khóa ngăn số 04
            MainESP->>LCD: Hiển thị STATE_SUCCESS ("HELLO NGUYEN VAN A - BOX #04 OPENED")
            Note over Resident, Solenoid: Cửa ngăn 04 bật mở -> Cư dân lấy hàng và đóng cửa tủ.
        end
    end
```

---

## 6. ĐẶC TẢ API GIAO TIẾP HỆ THỐNG (API CONTRACT)

### 6.1. Nhận Diện Khuôn Mặt Mở Khóa Tủ Tại Kiosk (`POST /packages/pickup/face`)
Dành riêng cho camera Kiosk trạm tủ gửi ảnh nhận diện mở khóa ngăn tủ.

#### Request Headers:
```http
Content-Type: multipart/form-data hoặc application/json
x-api-key: <LOCKER_SECRET_KEY> (hoặc Authorization: Bearer <TOKEN>)
```

#### Request Body (Multipart hoặc JSON):
```json
{
  "lockerCode": "LK-S101-01",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..." 
}
```

#### Response Thành Công (`200 OK`):
```json
{
  "message": "Xác thực khuôn mặt thành công. Cửa ngăn tủ số 4 đã mở!",
  "package": {
    "trackingNumber": "SPX839201948",
    "receiverName": "Nguyễn Văn A",
    "receiverPhone": "0987654321",
    "apartment": "P.1204 - Tháp A"
  },
  "boxNumber": 4,
  "action": "OPEN_DOOR",
  "matchScore": 0.765,
  "livenessScore": 0.819,
  "inferenceTimeMs": 185
}
```

---

### 6.2. Kiểm Tra Liveness Độc Lập Cho Postman/Swagger (`POST /ai/check-liveness`)
Endpoint độc lập, không yêu cầu API Key/Token, phục vụ kiểm tra đo kiểm độ chính xác thật/giả của mô hình Anti-Spoofing.

#### Request Headers:
```http
Content-Type: multipart/form-data
```

#### Request Body (form-data):
- `file`: File ảnh cần kiểm tra (`image/jpeg` hoặc `image/png`).
- `threshold`: `0.75` (Tùy chọn, mặc định 0.75).

#### Response Thành Công (`200 OK`):
```json
{
  "statusCode": 200,
  "message": "Kiểm tra tính chân thực khuôn mặt thành công",
  "data": {
    "isReal": true,
    "livenessScore": 0.8185,
    "spoofScore": 0.1815,
    "inferenceTimeMs": 58,
    "verdict": "REAL"
  }
}
```

---

### 6.3. API Kiểm Thử So Khớp Độc Lập Dry-Run (`POST /ai/verify-match`)
Endpoint phục vụ kiểm thử đối soát 1:N độc lập trên Postman/Swagger mà **không thực hiện mở tủ thật**.

#### Request Body (form-data):
- `file`: File ảnh test.
- `lockerCode`: Mã tủ đối soát (ví dụ `LK-S101-01`).
- `includeCroppedFace`: `true` (Tùy chọn: trả về ảnh Base64 112x112 đã căn chỉnh).

#### Response Thành Công (`200 OK`):
```json
{
  "statusCode": 200,
  "message": "Xác thực khớp với cư dân Nguyễn Văn A - Ô tủ số 4",
  "data": {
    "isMatch": true,
    "isReal": true,
    "matchScore": 0.765,
    "livenessScore": 0.819,
    "threshold": 0.48,
    "candidateCount": 1,
    "faceDetection": {
      "detected": true,
      "confidence": 0.917,
      "box": { "x1": 0.302, "y1": 0.293, "x2": 0.607, "y2": 0.842 },
      "landmarks": {
        "rightEye": { "x": 258.1, "y": 247.1 },
        "leftEye": { "x": 344.9, "y": 246.9 },
        "noseTip": { "x": 307.2, "y": 299.6 },
        "rightMouth": { "x": 266.1, "y": 339.0 },
        "leftMouth": { "x": 337.3, "y": 339.4 }
      },
      "cropApplied": true
    },
    "croppedFaceBase64": "data:image/jpeg;base64,...",
    "matchedResident": {
      "userId": "6701a9b8c2d3e4f5a6b7c8d9",
      "name": "Nguyễn Văn A",
      "phone": "0987654321",
      "apartment": "P.1204 - Tháp A"
    },
    "inferenceTimeMs": 192,
    "dryRun": true
  }
}
```

---

### 6.4. Đăng Ký Sinh Trắc Học Khuôn Mặt Cư Dân (`POST /users/enroll-face`)
Dành cho cư dân đăng ký hoặc cập nhật khuôn mặt qua ứng dụng Mobile.

#### Request Headers:
```http
Authorization: Bearer <RESIDENT_JWT_TOKEN>
Content-Type: multipart/form-data
```

#### Request Body:
- `files`: File ảnh chân dung (hoặc `files` mảng nhiều góc).

#### Response Thành Công (`200 OK`):
```json
{
  "statusCode": 200,
  "message": "Đăng ký khuôn mặt thành công",
  "data": {
    "success": true,
    "livenessScore": 0.852,
    "enrolledAt": "2026-09-26T14:50:00.000Z",
    "enrolledPosesCount": 1
  }
}
```

---

### 6.5. API Trạng Thái Các Mô Hình AI (`GET /ai/status`)
Kiểm tra tình trạng sẵn sàng của các mô hình trong RAM.

#### Response (`200 OK`):
```json
{
  "statusCode": 200,
  "message": "Lấy thông tin trạng thái mô hình AI thành công",
  "data": {
    "antiSpoofing": {
      "isReady": true,
      "modelArchitecture": "MiniFASNetV2",
      "inputSize": 80,
      "defaultThreshold": 0.75
    },
    "faceDetector": {
      "isReady": true,
      "modelArchitecture": "YuNet 2023mar",
      "inputSize": "640x640"
    },
    "faceRecognition": {
      "isReady": true,
      "modelArchitecture": "MobileFaceNet ArcFace",
      "embeddingDimension": 512,
      "threshold": 0.48
    }
  }
}
```

