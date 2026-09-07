import { ApiProperty } from '@nestjs/swagger';

// DTO phản hồi thông tin tệp tin sau khi được tải lên thành công
export class UploadFileResponseDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/smart-locker/avatars/avatar_123.jpg',
    description:
      'Đường dẫn liên kết trực tiếp của tệp tin trên mạng phân phối nội dung',
  })
  url: string;

  @ApiProperty({
    example: 'smart-locker/avatars/avatar_123',
    description:
      'Mã định danh duy nhất của tệp tin trên dịch vụ lưu trữ đám mây',
  })
  publicId: string;

  @ApiProperty({
    example: 1048576,
    description: 'Kích thước tệp tin tính theo đơn vị byte',
    required: false,
  })
  size?: number;

  @ApiProperty({
    example: 'jpg',
    description: 'Định dạng phần mở rộng của tệp tin',
    required: false,
  })
  format?: string;
}
