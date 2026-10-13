import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Tham số phân trang dùng chung cho các API danh sách của trang quản trị
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Số trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Số bản ghi mỗi trang (tối đa 100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit: number = 20;
}

// Khuôn phản hồi chung của các API danh sách có phân trang
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
