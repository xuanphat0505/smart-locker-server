import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PackageStatus } from '../enums';

// Truy vấn danh sách bưu kiện dành cho trang quản trị
export class QueryAdminPackagesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PackageStatus })
  @IsOptional()
  @IsEnum(PackageStatus, { message: 'Trạng thái bưu kiện không hợp lệ' })
  status?: PackageStatus;

  @ApiPropertyOptional({ description: 'Mã trạm tủ' })
  @IsOptional()
  @IsMongoId({ message: 'Mã trạm tủ không hợp lệ' })
  lockerId?: string;

  @ApiPropertyOptional({
    description:
      'Mã tòa nhà (chỉ System Admin; Building Admin luôn bị ép về tòa của mình)',
  })
  @IsOptional()
  @IsMongoId({ message: 'Mã tòa nhà không hợp lệ' })
  buildingId?: string;

  @ApiPropertyOptional({
    description:
      'Từ khóa theo mã vận đơn, SĐT người nhận hoặc tài xế, hoặc tên người nhận',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;
}

// Dữ liệu thu hồi một bưu kiện quá hạn về kho Ban Quản Lý
export class ReturnPackageDto {
  @ApiPropertyOptional({ example: 'Quá hạn 48 giờ, chuyển về kho BQL' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

// Thông tin trạm tủ rút gọn trong dữ liệu bưu kiện cho admin
export class AdminPackageLockerDto {
  @ApiProperty() _id: string;
  @ApiProperty({ example: 'LK-S101-01' }) code: string;
  @ApiProperty() name: string;
}

// Thông tin tòa nhà rút gọn trong dữ liệu bưu kiện cho admin
export class AdminPackageBuildingDto {
  @ApiProperty() _id: string;
  @ApiProperty() name: string;
}

// Bưu kiện hiển thị cho admin: tuyệt đối không chứa pinCode, qrCodeToken, failedAttempts, lockedUntil
export class AdminPackageItemDto {
  @ApiProperty() _id: string;
  @ApiProperty({ example: 'SPX839201948' }) trackingNumber: string;
  @ApiProperty({ enum: PackageStatus }) status: PackageStatus;
  @ApiProperty() boxNumber: number;
  @ApiProperty({ example: 'MEDIUM' }) boxSize: string;
  @ApiProperty() carrierName: string;
  @ApiProperty() receiverName: string;
  @ApiProperty() receiverPhone: string;
  @ApiProperty() apartment: string;
  @ApiPropertyOptional() shipperName?: string;
  @ApiProperty() shipperPhone: string;
  @ApiPropertyOptional({ type: () => AdminPackageLockerDto })
  locker?: AdminPackageLockerDto;
  @ApiPropertyOptional({ type: () => AdminPackageBuildingDto })
  building?: AdminPackageBuildingDto;
  @ApiProperty() droppedOffAt: Date;
  @ApiProperty() expiredAt: Date;
  @ApiPropertyOptional() pickedUpAt?: Date;
  @ApiPropertyOptional() paidUntil?: Date;
  @ApiProperty() totalFeePaid: number;
  @ApiPropertyOptional() note?: string;
  @ApiProperty() isShipperVerified: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
