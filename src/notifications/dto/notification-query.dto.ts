import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const DEFAULT_NOTIFICATION_LIMIT = 50;
export const MAX_NOTIFICATION_LIMIT = 100;

export class NotificationQueryDto {
  @ApiPropertyOptional({
    description: 'Notification ID cursor for keyset pagination',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(128)
  cursor?: string;

  @ApiPropertyOptional({
    description: `Number of notifications to return (default ${DEFAULT_NOTIFICATION_LIMIT}, max ${MAX_NOTIFICATION_LIMIT})`,
    default: DEFAULT_NOTIFICATION_LIMIT,
    minimum: 1,
    maximum: MAX_NOTIFICATION_LIMIT,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return undefined;
      const num = Number(trimmed);
      if (!Number.isInteger(num)) return value;
      if (num < 1) return num;
      return Math.min(MAX_NOTIFICATION_LIMIT, num);
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) return value;
      if (value < 1) return value;
      return Math.min(MAX_NOTIFICATION_LIMIT, value);
    }
    return value;
  })
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Pagination direction relative to cursor',
    enum: ['before', 'after'],
    default: 'before',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsIn(['before', 'after'], { message: 'direction must be either "before" or "after"' })
  direction?: 'before' | 'after';
}
