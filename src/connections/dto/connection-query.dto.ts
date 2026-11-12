import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export const DEFAULT_CONNECTION_LIMIT = 50;
export const MAX_CONNECTION_LIMIT = 100;

export class ConnectionQueryDto {
  @ApiPropertyOptional({
    description: `Page number (default 1)`,
    default: 1,
    minimum: 1,
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
      return num;
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) return value;
      if (value < 1) return value;
      return value;
    }
    return value;
  })
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number;

  @ApiPropertyOptional({
    description: `Number of connections to return (default ${DEFAULT_CONNECTION_LIMIT}, max ${MAX_CONNECTION_LIMIT})`,
    default: DEFAULT_CONNECTION_LIMIT,
    minimum: 1,
    maximum: MAX_CONNECTION_LIMIT,
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
      return Math.min(MAX_CONNECTION_LIMIT, num);
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) return value;
      if (value < 1) return value;
      return Math.min(MAX_CONNECTION_LIMIT, value);
    }
    return value;
  })
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  limit?: number;
}
