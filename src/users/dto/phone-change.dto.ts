import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { trimString } from './update-profile.dto';

const VN_PHONE_REGEX = /^(0|\+84)[35789][0-9]{8}$/;

// Yêu cầu gửi mã OTP SMS tới số điện thoại mới muốn đổi sang
export class RequestPhoneChangeDto {
  @ApiProperty({ example: '0912345678' })
  @Transform(trimString)
  @Matches(VN_PHONE_REGEX, {
    message: 'Số điện thoại không đúng định dạng Việt Nam',
  })
  phone: string;
}

// Xác nhận đổi số điện thoại bằng mã OTP đã gửi tới số mới
export class VerifyPhoneChangeDto extends RequestPhoneChangeDto {
  @ApiProperty({ example: '123456' })
  @Transform(trimString)
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @Length(6, 6, { message: 'Mã OTP gồm 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ gồm chữ số' })
  otp: string;
}
