import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;
  private readonly adminDashboardUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.fromEmail =
      this.configService.get<string>('MAIL_FROM') ||
      'Smart Locker System <no-reply@smartlocker.vn>';
    this.adminDashboardUrl =
      this.configService.get<string>('ADMIN_DASHBOARD_URL') ||
      'http://localhost:5173';

    this.initTransporter();
  }

  // Khởi tạo đối tượng gửi email qua giao thức SMTP
  private initTransporter(): void {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = this.configService.get<number>('MAIL_PORT') || 587;
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: { user, pass },
      });
      this.logger.log(`Dịch vụ gửi Email SMTP đã kết nối tới: ${host}:${port}`);
    } else {
      this.logger.warn(
        'Chưa cấu hình đầy đủ thông số MAIL_USER/MAIL_PASS trong .env. Email sẽ được mô phỏng xuất log.',
      );
    }
  }

  // Gửi email thông báo cho Ban Quản Lý khi có hồ sơ cư dân mới đăng ký
  async sendNewResidentNotification(
    recipients: string | string[],
    resident: {
      name: string;
      phone: string;
      email?: string;
      apartment?: string;
    },
    buildingName: string,
  ): Promise<boolean> {
    const recipientList = Array.isArray(recipients)
      ? recipients.filter(Boolean)
      : [recipients].filter(Boolean);

    if (recipientList.length === 0) {
      this.logger.warn(
        `Không có địa chỉ email hợp lệ để gửi thông báo cư dân mới cho tòa nhà ${buildingName}. Bỏ qua.`,
      );
      return false;
    }

    const subject = `[SMART LOCKER] Yêu cầu phê duyệt cư dân mới - Căn hộ ${resident.apartment || 'N/A'}`;
    const approvalUrl = `${this.adminDashboardUrl}/residents`;

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #14161B; border-radius: 12px; overflow: hidden; border: 1px solid #2B2F3A; color: #FFFFFF;">
        <div style="background: linear-gradient(135deg, #FF6B00 0%, #FF8533 100%); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; color: #FFFFFF; letter-spacing: 0.5px;">SMART LOCKER</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">Hệ Thống Quản Lý Tủ Đồ Thông Minh Chung Cư</p>
        </div>
        
        <div style="padding: 28px 24px;">
          <h2 style="font-size: 18px; margin-top: 0; color: #FF8533;">Thông Báo Tiếp Nhận Hồ Sơ Cư Dân Mới</h2>
          <p style="font-size: 14px; line-height: 22px; color: #A0A5B5;">
            Kính gửi <strong>Ban Quản Lý ${buildingName}</strong>,<br/>
            Hệ thống vừa tiếp nhận một hồ sơ đăng ký tài khoản cư dân đang chờ xét duyệt để kích hoạt quyền nhận bưu phẩm tại trạm tủ thông minh:
          </p>
          
          <div style="background-color: #1B1E26; border-radius: 8px; padding: 18px; margin: 20px 0; border: 1px solid #2B2F3A;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #72798E; width: 140px;">Họ và tên:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #FFFFFF;">${resident.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #72798E;">Số điện thoại:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #FF6B00;">${resident.phone}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #72798E;">Căn hộ đăng ký:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #FFFFFF;">${resident.apartment || 'Chưa cập nhật'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #72798E;">Tòa nhà / Chung cư:</td>
                <td style="padding: 6px 0; color: #FFFFFF;">${buildingName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #72798E;">Email cá nhân:</td>
                <td style="padding: 6px 0; color: #A0A5B5;">${resident.email || 'N/A'}</td>
              </tr>
            </table>
          </div>
          
          <div style="text-align: center; margin: 30px 0 10px 0;">
            <a href="${approvalUrl}" style="background-color: #FF6B00; color: #FFFFFF; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(255,107,0,0.3);">
              TRUY CẬP BẢNG QUẢN TRỊ XÉT DUYỆT
            </a>
          </div>
        </div>
        
        <div style="background-color: #0F1015; padding: 16px 24px; text-align: center; font-size: 12px; color: #72798E; border-top: 1px solid #2B2F3A;">
          Email tự động được gửi từ Hệ thống Smart Locker. Vui lòng không trả lời thư này.
        </div>
      </div>
    `;

    return this.sendMail(recipientList, subject, htmlContent);
  }

  // Gửi email thông báo kết quả phê duyệt hoặc từ chối cho Cư Dân
  async sendResidentApprovalResult(
    residentEmail: string | undefined,
    residentName: string,
    isApproved: boolean,
    apartment: string,
    buildingName: string,
    rejectReason?: string,
  ): Promise<boolean> {
    if (!residentEmail) {
      return false;
    }

    const subject = isApproved
      ? `🎉 Hồ sơ cư dân căn hộ ${apartment} đã được phê duyệt thành công!`
      : `Thông báo về hồ sơ đăng ký cư dân tại ${buildingName}`;

    const htmlContent = isApproved
      ? `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #14161B; border-radius: 12px; overflow: hidden; border: 1px solid #2B2F3A; color: #FFFFFF;">
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; color: #FFFFFF;">XÁC THỰC THÀNH CÔNG</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">Chào mừng bạn đến với Tiện ích Smart Locker</p>
        </div>
        <div style="padding: 28px 24px;">
          <p style="font-size: 15px; color: #FFFFFF;">Xin chào <strong>${residentName}</strong>,</p>
          <p style="font-size: 14px; line-height: 22px; color: #A0A5B5;">
            Ban Quản Lý <strong>${buildingName}</strong> đã phê duyệt và kích hoạt thành công hồ sơ cư dân căn hộ <strong>${apartment}</strong> của bạn.
          </p>
          <p style="font-size: 14px; line-height: 22px; color: #A0A5B5;">
            Giờ đây bạn đã có thể đăng nhập vào ứng dụng Smart Locker trên điện thoại để nhận thông báo bưu phẩm, xem mã OTP và mở khóa nhận hàng tại trạm tủ sảnh tòa nhà 24/7.
          </p>
        </div>
        <div style="background-color: #0F1015; padding: 16px 24px; text-align: center; font-size: 12px; color: #72798E; border-top: 1px solid #2B2F3A;">
          Cảm ơn bạn đã sử dụng dịch vụ tủ đồ thông minh Smart Locker!
        </div>
      </div>
    `
      : `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #14161B; border-radius: 12px; overflow: hidden; border: 1px solid #2B2F3A; color: #FFFFFF;">
        <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; color: #FFFFFF;">THÔNG BÁO XÉT DUYỆT HỒ SƠ</h1>
        </div>
        <div style="padding: 28px 24px;">
          <p style="font-size: 15px; color: #FFFFFF;">Xin chào <strong>${residentName}</strong>,</p>
          <p style="font-size: 14px; line-height: 22px; color: #A0A5B5;">
            Hồ sơ đăng ký cư dân căn hộ <strong>${apartment}</strong> tại <strong>${buildingName}</strong> chưa được Ban Quản Lý phê duyệt vì lý do sau:
          </p>
          <div style="background-color: #1B1E26; border-left: 4px solid #EF4444; padding: 14px 18px; margin: 16px 0; color: #FCA5A5; font-size: 14px;">
            ${rejectReason || 'Thông tin căn hộ không trùng khớp với hồ sơ lưu trữ tại Ban Quản Lý.'}
          </div>
          <p style="font-size: 14px; line-height: 22px; color: #A0A5B5;">
            Vui lòng liên hệ trực tiếp với Ban Quản Lý sảnh tòa nhà để được hướng dẫn và xác minh thông tin.
          </p>
        </div>
        <div style="background-color: #0F1015; padding: 16px 24px; text-align: center; font-size: 12px; color: #72798E; border-top: 1px solid #2B2F3A;">
          Hệ thống Smart Locker - Tự động hóa giao nhận chung cư
        </div>
      </div>
    `;

    return this.sendMail(residentEmail, subject, htmlContent);
  }

  // Phương thức phụ trợ thực hiện gửi thư qua Nodemailer với xử lý lỗi an toàn
  private async sendMail(
    to: string | string[],
    subject: string,
    html: string,
  ): Promise<boolean> {
    const toFormatted = Array.isArray(to) ? to.join(', ') : to;
    try {
      if (!this.transporter) {
        this.logger.log(
          `[MÔ PHỎNG EMAIL] Đã gửi tới: ${toFormatted} | Tiêu đề: "${subject}"`,
        );
        return true;
      }

      await this.transporter.sendMail({
        from: this.fromEmail,
        to: toFormatted,
        subject,
        html,
      });

      this.logger.log(
        `Đã gửi Email thành công tới: ${toFormatted} | Tiêu đề: "${subject}"`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi khi gửi email tới ${toFormatted}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
