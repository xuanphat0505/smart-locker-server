# BÁO CÁO ĐỀ XUẤT TÍNH NĂNG: HỆ THỐNG THANH TOÁN PHÍ LƯU KHO QUÁ HẠN & CƠ CHẾ GIA HẠN THÔNG MINH (CHUẨN VIETQR NAPAS 247)

* **Đề tài:** Hệ Thống Tủ Nhận Hàng Thông Minh (Smart Locker) Cho Khu Chung Cư
---

## 1. Đặt Vấn Đề & Tính Cấp Thiết Thực Tiễn

### 1.1. Thực trạng vận hành trạm tủ tại các tòa nhà chung cư
* **Tài nguyên ngăn tủ có hạn:** Mỗi trạm tủ thông minh đặt tại sảnh chung cư thường chỉ có từ **12 đến 24 ngăn**, nhưng phải phục vụ cho **300 đến 1.000 căn hộ** với hàng chục lượt shipper giao hàng mỗi ngày.
* **Bản chất của Smart Locker:** Là **trạm trung chuyển bưu kiện tạm thời (Transit Hub)**, đòi hỏi tỷ lệ quay vòng ô tủ (Turnover Rate) phải cao để người sau có ngăn sử dụng. Tủ **tuyệt đối không phải là kho chứa đồ cá nhân**.

### 1.2. Vấn đề phát sinh nếu không có chế tài thanh toán quá hạn
1. **Hành vi chiếm dụng ("giam hàng"):** Cư dân đi công tác, du lịch hoặc lười xuống sảnh có xu hướng để bưu kiện trong tủ nhiều ngày.
2. **Nghẽn trạm tủ (Full Capacity):** Tủ luôn trong tình trạng hết ngăn trống. Shipper đến giao hàng mới buộc phải quay đầu hoặc để đồ bừa bãi tại bàn lễ tân, gây mất mỹ quan và thất lạc hàng hóa.
3. **Ban Quản Lý không có chế tài tự động:** BQL không thể liên tục gọi điện nhắc nhở thủ công từng căn hộ.

👉 **Kết luận:** Cần thiết phải xây dựng một **Phân hệ Quản lý Phí Lưu Kho Quá Hạn & Cơ Chế Gia Hạn Thông Minh** nhằm tự động hóa việc răn đe kinh tế, thúc đẩy cư dân lấy đồ đúng hạn và bảo vệ quyền lợi sử dụng tiện ích chung của toàn bộ cư dân.

---

## 2. Mô Hình Dòng Tiền & Tính Pháp Lý Nghiệp Vụ

### 2.1. Cư dân nộp tiền cho ai và vì mục đích gì?
* **Chủ thể thụ hưởng trực tiếp:** **Ban Quản Lý (BQL) Chung Cư** (hoặc Ban Quản Trị tòa nhà).
* **Bản chất khoản thu:** Phí phạt chiếm dụng hạ tầng tiện ích nội khu và bù đắp chi phí điện năng tiêu thụ, khấu hao thiết bị trạm tủ tại sảnh.
* **Minh bạch tài chính 100%:** Khi cư dân mở app ngân hàng quét mã QR, tên người nhận hiển thị rõ ràng là: **`BQL CHUNG CU [TÊN TÒA NHÀ]`** (ví dụ: `BQL CHUNG CU TECCO TOWER`). Tiền chảy thẳng về tài khoản ngân hàng của BQL, hoàn toàn không qua trung gian bên thứ ba, tránh triệt để nỗi lo lừa đảo.

### 2.2. Tại sao chọn chuẩn thanh toán VietQR (NAPAS 247)?
1. **Chuẩn thanh toán quốc gia:** Chuẩn VietQR do Ngân hàng Nhà nước và NAPAS ban hành, hỗ trợ 100% ứng dụng của toàn bộ các ngân hàng tại Việt Nam (Vietcombank, MB, Techcombank, VietinBank, BIDV...) và các ví điện tử (MoMo, ZaloPay, Viettel Money).
2. **Không rào cản thủ tục pháp nhân:** Các cổng thanh toán trung gian (như VNPay, MoMo Business, ZaloPay Merchant) đòi hỏi hồ sơ giấy phép kinh doanh phức tạp và phí duy trì hàng tháng. Chuẩn VietQR NAPAS hoạt động trên tài khoản thanh toán sẵn có của BQL, triển khai được ngay lập tức và hoàn toàn miễn phí giao dịch.
3. **Tự chủ biểu phí cho từng tòa nhà (Multi-Tenant):** Mỗi chung cư có tài khoản ngân hàng riêng và có thể cấu hình biểu phí linh hoạt (chung cư cao cấp cho phép miễn phí 48h, chung cư tầm trung miễn phí 24h).

---

## 3. Quy Tắc Bảo Mật Cốt Lõi: Chống Mở Tủ Từ Xa (Ghost Unlock Prevention)

Đây là **điểm sáng tạo và phòng ngừa rủi ro bảo mật quan trọng nhất** trong thiết kế kiến trúc hệ thống:

* **Rủi ro nếu thiết kế sai lầm:** Nếu hệ thống cứ nhận được tiền là tự động bung mở cửa tủ ngay lập tức, trong khi cư dân đang ở trên tầng 20 hoặc đi vắng, cửa tủ mở toang ở sảnh sẽ dẫn tới nguy cơ bưu kiện bị người lạ lấy cắp (**Ghost Unlock**).
* **Giải pháp kiến trúc:** **Tách rời tuyệt đối giữa việc "Nộp tiền gia hạn (Financial)" và việc "Mở chốt cơ khí (Mechanical Unlock)"**:
  * **Khi nộp tiền từ xa thành công:** Hệ thống chỉ cập nhật quyền gia hạn thời gian nhận hàng (`paidUntil = now + 24h`). Cửa tủ **vẫn khóa kín an toàn**.
  * **Cửa tủ chỉ bung mở:** Khi cư dân đã **có mặt thực tế trước trạm tủ** và thực hiện một trong các thao tác: bấm xác nhận mở tủ trên Mobile App khi đứng gần tủ, hoặc nhập mã OTP trên màn hình cảm ứng của trạm tủ.

---

## 4. Cơ Chế 2 Kênh Thanh Toán Linh Hoạt (Dual Channels)

Hệ thống đáp ứng trọn vẹn mọi tình huống thực tế của cư dân qua 2 kênh:

### Kênh 1: Nộp phạt / Gia hạn từ xa qua Mobile App
* **Đối tượng:** Cư dân đang bận ở căn hộ hoặc đang đi công tác xa muốn chủ động giữ đồ thêm.
* **Cách thực hiện:** Cư dân nhận thông báo quá hạn trên Mobile App $\rightarrow$ Bấm xem biểu phí $\rightarrow$ Quét mã VietQR trên app $\rightarrow$ Hệ thống gia hạn thêm 24 giờ. Cửa tủ vẫn đóng kín bảo đảm an toàn.

### Kênh 2: Thanh toán trực tiếp tại Kiosk LCD của trạm tủ
* **Đối tượng:** Cư dân không để ý điện thoại, đi thẳng xuống sảnh trạm tủ để nhận hàng.
* **Cách thực hiện:**
  1. Cư dân nhập mã OTP 6 số trên màn hình cảm ứng Kiosk.
  2. Mạch điều khiển ESP32 phát hiện đơn đã quá hạn $\rightarrow$ Tự động vẽ mã **VietQR chuẩn NAPAS trực tiếp lên màn hình màu TFT LCD** của tủ kèm số tiền phạt chính xác.
  3. Cư dân mở bất kỳ app ngân hàng nào trên điện thoại quét mã trên màn hình tủ và chuyển khoản.
  4. Ngay khi tiền vào tài khoản BQL, mạch ESP32 kích hoạt rơ-le 12V bung mở chốt cửa tủ ngay trước mắt cư dân. Người cao tuổi hoặc người thân không cài app Smart Locker vẫn nhận hàng dễ dàng.

---

## 5. Chính Sách Biểu Phí Phạt Lũy Thừa & Ngưỡng Thu Hồi Cưỡng Chế

Để giải quyết triệt để bài toán: *"Nếu phí quá rẻ (20k/ngày), cư dân có thể chấp nhận bỏ 100k - 200k để giam hàng cả tuần biến tủ chung thành kho riêng"*, hệ thống áp dụng **Mô hình Lũy thừa cơ số 2 kết hợp Ngưỡng thu hồi 6 ngày**:

### 5.1. Bảng biểu phí bậc thang lũy thừa

| Mốc thời gian lưu kho | Trạng thái bưu kiện | Phí nộp cho Block hiện tại | Tổng tiền phạt tích lũy | Ý nghĩa nghiệp vụ |
| :--- | :--- | :--- | :--- | :--- |
| **0h – 48h** (2 ngày đầu) | Lưu trữ miễn phí | **0 VNĐ** (Miễn phí 100%) | **0 VNĐ** | Thời gian tiêu chuẩn để nhận hàng |
| **48h01 – 72h** (Ngày thứ 3) | Quá hạn Block 1 | **20.000 VNĐ** | **20.000 VNĐ** | Mức phí nhân văn, thông cảm cho việc bận đột xuất |
| **72h01 – 96h** (Ngày thứ 4) | Quá hạn Block 2 | **40.000 VNĐ** (x2) | **60.000 VNĐ** | Phí tăng gấp đôi để hối thúc lấy đồ |
| **96h01 – 120h** (Ngày thứ 5) | Quá hạn Block 3 | **80.000 VNĐ** (x4) | **140.000 VNĐ** | Áp lực kinh tế mạnh; cảnh báo sắp hết hạn gia hạn |
| **120h01 – 144h** (Ngày thứ 6) | Quá hạn Block 4 | **160.000 VNĐ** (x8) | **300.000 VNĐ** | Mức phạt cao nhất; cơ hội gia hạn cuối cùng |
| **Sau 144h** (> 6 ngày) | Cưỡng chế thu hồi | **KHÓA GIA HẠN** | **300.000 VNĐ** | BQL thu hồi hàng về kho, giải phóng ngăn tủ |

### 5.2. Tính công bằng và linh hoạt trong thanh toán
* **Nếu cư dân chủ động gia hạn mỗi ngày:** Ngày 3 trả 20k, Ngày 4 trả 40k $\rightarrow$ Tổng chi phí cho 2 ngày quá hạn là **60.000 VNĐ**.
* **Nếu cư dân quên bẵng đến Ngày 4 mới ra lấy:** Hệ thống tính dồn nợ của cả 2 ngày đã qua ($20k + 40k = 60.000$ VNĐ). Cư dân quét mã VietQR đúng 1 lần với số tiền **60.000 VNĐ** là mở được tủ.
* 👉 Cả hai hình thức đều đảm bảo tính công bằng tuyệt đối: chiếm dụng tủ bao nhiêu ngày thì trả chính xác tổng tiền của bấy nhiêu ngày.

### 5.3. Ngưỡng cưỡng chế thu hồi sau 6 ngày (Hard Eviction)
* Khi vượt quá 144 giờ (6 ngày), hệ thống **khóa tính năng gia hạn**, không cho phép tiếp tục giữ ô tủ dù có trả tiền.
* Nhân viên BQL / Bảo vệ dùng quyền Quản trị kích hoạt tính năng thu hồi (`OVERDUE_RETRIEVAL`) để mở ngăn tủ, mang kiện hàng về phòng kỹ thuật / kho văn phòng BQL.
* Ngăn tủ ngay lập tức trở về trạng thái trống (`AVAILABLE`) để shipper giao bưu phẩm mới cho cư dân khác.
* Cư dân muốn nhận lại hàng phải liên hệ trực tiếp văn phòng BQL và đóng khoản phạt hành chính 300.000 VNĐ.

