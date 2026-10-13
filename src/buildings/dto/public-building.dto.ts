import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BuildingStatus } from '../enums/building-status.enum';

// DTO thông tin Tòa Nhà công khai: tuyệt đối không chứa tài khoản ngân hàng, biểu phí hay email quản lý
export class PublicBuildingResponseDto {
  @ApiProperty({ example: '6a95091f1e23b42475f441d3' })
  _id: string;

  @ApiProperty({ example: 'Tecco Tower Linh Đông' })
  name: string;

  @ApiProperty({ example: 'TECCO-LD' })
  code: string;

  @ApiProperty({ example: '1 Đường số 8, Linh Đông, Thủ Đức' })
  address: string;

  @ApiProperty({ example: 25 })
  totalFloors: number;

  @ApiProperty({ example: 400 })
  totalApartments: number;

  @ApiPropertyOptional({ example: '1900 1234' })
  hotline?: string;

  @ApiProperty({ enum: BuildingStatus, example: BuildingStatus.ACTIVE })
  status: BuildingStatus;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Tọa độ GeoJSON Point theo thứ tự [kinh độ, vĩ độ]',
    example: { type: 'Point', coordinates: [106.84025, 10.84231] },
  })
  location?: {
    type: string;
    coordinates: [number, number];
  };

  @ApiPropertyOptional({
    description: 'Khoảng cách tới vị trí tìm kiếm (mét), chỉ có ở API nearby',
    example: 350.5,
  })
  distance?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
