# Kế Hoạch Triển Khai Tính Năng Quản Lý Mật Khẩu (Password Management Plan)

## 1. Tổng Quan Kế Hoạch (Executive Summary)

Tài liệu này đặc tả kế hoạch kỹ thuật chi tiết để triển khai hệ thống quản lý mật khẩu toàn diện cho nền tảng Smart Locker, giải quyết các bài toán cốt lõi:
1. **Đổi mật khẩu chủ động (Change Password):** Cho phép người dùng đang đăng nhập đổi mật khẩu cá nhân thông qua sub-resource `/me/password`.
2. **Khôi phục mật khẩu qua liên kết xác thực (Forgot & Reset Password via Reset Link):** Cho phép người dùng chưa đăng nhập lấy lại quyền truy cập tài khoản thông qua một đường dẫn liên kết bảo mật (Reset Link) chứa mã Token ngẫu nhiên độ an toàn cao (256-bit cryptographically secure token) gửi về email SMTP.
3. **Ban Quản Lý hỗ trợ cư dân (Admin Reset Password):** Cho phép BQL đặt lại mật khẩu tạm cho cư dân tòa nhà mình quản lý thông qua action endpoint `POST /users/:id/password-reset`.

---

## 2. Phân Tích Phạm Vi & Kiến Trúc (Architecture & Scope)

### 2.1. Phân định trách nhiệm Module (Separation of Concerns)

Thiết kế theo **Resource-Oriented Design** — URL biểu diễn tài nguyên, HTTP method biểu diễn hành động. Không dùng verb trong URL.

- **`UsersModule` (Quản lý tài khoản có JWT Guard):**
  - `PATCH /users/me/password`: User tự đổi mật khẩu cá nhân. `/me` là resource (user hiện tại), `/password` là sub-resource. Không có rủi ro collision với route động `/:id`.
  - `POST /users/:id/password-reset`: Admin thực thi hành động cấp lại mật khẩu tạm cho cư dân thuộc tòa nhà mình. Dùng `POST` vì đây là privileged action (sinh mật khẩu tạm, hash, invalidate session...) chứ không chỉ là partial update.
- **`AuthModule` (Xác thực công khai không cần JWT):**
  - `POST /auth/forgot-password`: Tiếp nhận yêu cầu quên mật khẩu, sinh token bảo mật 256-bit, lưu bản băm SHA-256 vào database và gửi email chứa Reset Link.
  - `GET /auth/verify-reset-token`: Kiểm tra tính hợp lệ và thời hạn của token trước khi người dùng nhập mật khẩu mới trên giao diện.
  - `POST /auth/reset-password`: Xác thực token và cập nhật mật khẩu mới.
- **`MailModule` (Dịch vụ gửi thông báo):**
  - Tích hợp template email hiện đại chứa nút bấm **"Đặt Lại Mật Khẩu"** dẫn trực tiếp đến trang đổi mật khẩu kèm token bảo mật.

---

## 3. Lộ Trình Triển Khai Chi Tiết (Phased Implementation Roadmap)

### Phase 1: Tính Năng Đổi Mật Khẩu Cá Nhân (`PATCH /users/me/password`) - [ĐÃ HOÀN THÀNH]
- **Mục tiêu:** Cho phép người dùng đã đăng nhập thay đổi mật khẩu hiện tại thông qua sub-resource `/me/password`.
- **Các bước thực hiện:**
  1. **DTO:** Tạo `ChangePasswordDto` trong `server/src/users/dto/user.dto.ts` với validate:
     - `currentPassword`: Chuỗi ký tự, không được để trống.
     - `newPassword`: Chuỗi ký tự, tối thiểu 8 ký tự, không trùng `currentPassword`.
  2. **Service:** Viết hàm `changePassword(userId: string, dto: ChangePasswordDto)` trong `server/src/users/users.service.ts`:
     - Truy vấn user kèm trường `password`.
     - So khớp `currentPassword` bằng `bcrypt.compare`. Nếu sai, ném `BadRequestException("Mật khẩu hiện tại không chính xác")`.
     - Kiểm tra `newPassword !== currentPassword`. Nếu trùng, ném `BadRequestException("Mật khẩu mới không được trùng với mật khẩu cũ")`.
     - Hash mật khẩu mới bằng `bcrypt.hash(dto.newPassword, 10)`.
     - Cập nhật database và hủy bỏ `refreshTokenHash = null` để vô hiệu hóa toàn bộ phiên đăng nhập cũ trên các thiết bị khác.
  3. **Controller & Swagger:**
     - Khai báo route `PATCH 'me/password'` trong `server/src/users/users.controller.ts`. Route này không có nguy cơ collision với `PATCH ':id'` vì `me` là literal segment.
     - Bổ sung Swagger decorator `ApiChangePasswordDoc()` trong `server/src/users/swagger/user.swagger.ts`.

---

### Phase 2: Nâng Cấp Schema & Dịch Vụ Email Hỗ Trợ Reset Link Token - [ĐÃ HOÀN THÀNH]
- **Mục tiêu:** Chuẩn bị hạ tầng lưu trữ token băm an toàn theo chuẩn OWASP và thiết kế email chứa link reset.
- **Các bước thực hiện:**
  1. **User Schema (`user.schema.ts`):**
     - Bổ sung trường `resetPasswordToken?: string;` (lưu mã băm `SHA-256` của raw token để phòng ngừa rò rỉ nếu database bị tấn công).
     - Bổ sung trường `resetPasswordExpires?: Date;` (thời điểm hết hạn của link, mặc định 15 phút kể từ lúc tạo).
     - Bổ sung trường `lastResetPasswordRequestedAt?: Date;` (phục vụ rate-limit/cooldown 60 giây chống spam gửi mail).
  2. **Biến môi trường (`.env`):**
     - Bổ sung `RESET_PASSWORD_URL=mobile://reset-password` (Deep Link mở trực tiếp màn hình reset-password trong app mobile).
  3. **Mail Service (`mail.service.ts`):**
     - Bổ sung hàm `sendResetPasswordLink(email: string, name: string, resetLink: string): Promise<boolean>`.
     - Xây dựng template HTML email hiện đại với tone màu cam thương hiệu Smart Locker, nổi bật nút bấm CTA **"ĐẶT LẠI MẬT KHẨU"** và hiển thị đường link dự phòng nếu không click được nút.

---

### Phase 3: Luồng Quên & Đặt Lại Mật Khẩu Bằng Token (`AuthModule`) - [ĐÃ HOÀN THÀNH]
- **Mục tiêu:** Cung cấp API công khai cho người dùng khôi phục tài khoản qua liên kết email.
- **Cơ chế Token an toàn (Chuẩn OWASP):**
  - **Tạo Token:** Dùng module `crypto` sinh chuỗi ngẫu nhiên 32 bytes (64 ký tự hex):
    ```typescript
    const rawToken = crypto.randomBytes(32).toString('hex');
    ```
  - **Lưu Database:** Băm `rawToken` bằng thuật toán một chiều `SHA-256`:
    ```typescript
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    ```
  - **Tạo Link gửi Email:** `${RESET_PASSWORD_URL}?token=${rawToken}`.
  - Khi xác thực: Server lấy `token` gửi lên từ client, băm `SHA-256` rồi tìm user có `resetPasswordToken == hashedToken` và `resetPasswordExpires > new Date()`.
- **Các bước thực hiện:**
  1. **DTOs:**
     - `ForgotPasswordDto`: `{ email: string }`.
     - `ResetPasswordDto`: `{ token: string, newPassword: string }`.
  2. **Auth Service (`auth.service.ts`):**
     - `forgotPassword(dto: ForgotPasswordDto)`:
       - Tìm user theo email. Nếu không tìm thấy, vẫn trả về 200 OK chung chung để chống tấn công dò quét email (Email Enumeration).
       - Kiểm tra cooldown 60s từ `lastResetPasswordRequestedAt`.
       - Sinh `rawToken` (32 bytes hex), băm `SHA-256` và lưu vào `resetPasswordToken`.
       - Thiết lập thời hạn 15 phút (`resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000)`).
       - Tạo đường dẫn `${RESET_PASSWORD_URL}?token=${rawToken}` và gửi qua `mailService.sendResetPasswordLink(...)`.
     - `verifyResetToken(token: string)`:
       - Băm token bằng `SHA-256` và kiểm tra xem có user nào khớp và chưa hết hạn hay không, trả về trạng thái hợp lệ.
     - `resetPassword(dto: ResetPasswordDto)`:
       - Băm `dto.token` bằng `SHA-256`, tìm user hợp lệ chưa hết hạn.
       - Băm `newPassword` bằng `bcrypt.hash(dto.newPassword, 10)`.
       - Cập nhật mật khẩu mới, xóa sạch `resetPasswordToken` và `resetPasswordExpires`.
       - Hủy `refreshTokenHash = null` để đăng xuất các phiên cũ.
  3. **Auth Controller (`auth.controller.ts`):**
     - `POST /auth/forgot-password`
     - `GET /auth/verify-reset-token?token=...`
     - `POST /auth/reset-password`
     - Khai báo Swagger tài liệu đầy đủ trong `auth.swagger.ts`.

---

### Phase 4: Ban Quản Lý Hỗ Trợ Đặt Lại Mật Khẩu (`POST /users/:id/password-reset`)
- **Mục tiêu:** Cho phép Ban Quản Lý hoặc System Admin can thiệp khi cư dân gặp sự cố khẩn cấp.
- **Lý do dùng `POST`:** Đây là privileged action (sinh mật khẩu tạm, hash bcrypt, invalidate toàn bộ session, ghi log...), không chỉ là partial update một field. `POST` biểu đạt đúng ngữ nghĩa "thực thi hành động" theo Controller pattern trong REST.
- **Các bước thực hiện:**
  1. **DTO:** Tạo `AdminResetPasswordDto` (`temporaryPassword?: string`).
  2. **Service:** `adminResetPassword(targetUserId: string, currentUser: AuthenticatedUser, dto: AdminResetPasswordDto)`:
     - Validate `targetUserId` là ObjectId hợp lệ trước khi query DB.
     - Kiểm tra quyền Tenant: BQL chỉ được reset cho cư dân thuộc tòa nhà mình (`buildingId`).
     - Tự động sinh mật khẩu tạm ngẫu nhiên nếu không truyền vào.
     - Hash mật khẩu tạm và cập nhật DB.
     - Xóa `refreshTokenHash`.
  3. **Controller:** Route `POST ':id/password-reset'` trong `users.controller.ts` gắn quyền `@Roles(Role.SYSTEM_ADMIN, Role.BUILDING_ADMIN)`.

---

### Phase 5: Kiểm Thử Toàn Diện & Cập Nhật Tài Liệu
- Chạy kiểm tra tĩnh linter: `npm run lint` đạt 0 error.
- Chạy kiểm tra bản dựng: `npm run build` đạt kết quả biên dịch thành công.
- Cập nhật tài liệu kỹ thuật tại `server/src/users/user.md` và `server/src/auth/auth.md`.

---

## 4. Đặc Tả Dữ Liệu API (API Specifications)

### 4.1. Đổi Mật Khẩu Cá Nhân
- **Method & Path:** `PATCH /users/me/password`
- **Auth:** `Bearer Token` (Tất cả các Role)
- **Body:**
```json
{
  "currentPassword": "OldPassword@123",
  "newPassword": "NewSecurePassword@456"
}
```
- **Response (200 OK):**
```json
{
  "statusCode": 200,
  "message": "Đổi mật khẩu thành công. Vui lòng đăng nhập lại trên các thiết bị khác."
}
```

### 4.2. Yêu Cầu Gửi Liên Kết Đặt Lại Mật Khẩu
- **Method & Path:** `POST /auth/forgot-password`
- **Auth:** `None` (Public)
- **Body:**
```json
{
  "email": "cudan.a1204@vinhomes.vn"
}
```
- **Response (200 OK):**
```json
{
  "statusCode": 200,
  "message": "Nếu email tồn tại trên hệ thống, liên kết đặt lại mật khẩu đã được gửi đến hộp thư của bạn."
}
```

### 4.3. Kiểm Tra Tính Hợp Lệ Của Token Đặt Lại Mật Khẩu
- **Method & Path:** `GET /auth/verify-reset-token?token=a8f9c4e2b1d3...`
- **Auth:** `None` (Public)
- **Response (200 OK):**
```json
{
  "statusCode": 200,
  "isValid": true,
  "email": "cudan.a1204@vinhomes.vn"
}
```

### 4.4. Đặt Lại Mật Khẩu Mới Bằng Token
- **Method & Path:** `POST /auth/reset-password`
- **Auth:** `None` (Public)
- **Body:**
```json
{
  "token": "a8f9c4e2b1d3789a456c012ef893241bcdae87216543210fedcba9876543210f",
  "newPassword": "NewStrongPassword@789"
}
```
- **Response (200 OK):**
```json
{
  "statusCode": 200,
  "message": "Đặt lại mật khẩu thành công. Bạn đã có thể đăng nhập bằng mật khẩu mới."
}
```

---

## 5. Kế Hoạch Quản Trị Rủi Ro (Risk & Mitigation)

| Rủi ro kỹ thuật | Mức độ | Biện pháp giảm thiểu |
| :--- | :---: | :--- |
| Route collision `PATCH /users/me/password` với `PATCH /users/:id` | **Không xảy ra** | `me` là literal segment — NestJS luôn match trước `:id`. Không cần workaround thứ tự khai báo. |
| `POST /users/:id/password-reset` nhận `id` không hợp lệ | **Trung bình** | Validate `id` là ObjectId hợp lệ ngay tại Controller/Pipe trước khi đến Service, tránh Mongoose CastError. |
| Rò rỉ mã Token nếu cơ sở dữ liệu bị lộ | **Cao** | **Tuyệt đối không lưu raw token vào DB**. Chỉ lưu mã băm `SHA-256` của token. Khi nhận token từ người dùng, server băm lại rồi mới so sánh. |
| Tấn công Brute-force token | **Không thể** | Token được sinh bằng `crypto.randomBytes(32)` có độ dài 64 ký tự hex (256-bit entropy), xác suất đoán trúng là $1 / 2^{256}$ (bất khả thi về mặt tính toán). |
| Token bị sử dụng lại (Replay Attack) | **Cao** | Ngay sau khi đổi mật khẩu thành công, xóa sạch trường `resetPasswordToken` và `resetPasswordExpires` khỏi bản ghi người dùng. |
| Session Hijacking (phiên cũ vẫn dùng được sau khi đổi mật khẩu) | **Cao** | Bắt buộc gán `refreshTokenHash = null` ngay khi mật khẩu thay đổi thành công. |
| Spam gửi email liên tục | **Trung bình** | Áp dụng Cooldown 60 giây giữa 2 lần yêu cầu liên tiếp qua trường `lastResetPasswordRequestedAt`. |
