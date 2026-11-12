import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const REVENUE_PRESETS = ['today', '7d', '30d', '90d', 'ytd', 'all', 'custom'] as const;
export type RevenuePreset = typeof REVENUE_PRESETS[number];

export class RevenueOverviewQueryDto {
  @IsOptional()
  @IsIn(REVENUE_PRESETS, {
    message: `Preset must be one of: ${REVENUE_PRESETS.join(', ')}`,
  })
  preset?: RevenuePreset = '30d';

  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';
}

export class RevenueTimeSeriesQueryDto extends RevenueOverviewQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'auto'])
  bucket?: 'day' | 'week' | 'month' | 'auto' = 'auto';
}

export class RevenueBreakdownQueryDto extends RevenueOverviewQueryDto {}

export class RevenueTransactionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  status?: string = 'ALL';

  @IsOptional()
  @IsString()
  plan?: string = 'ALL';

  @IsOptional()
  @IsString()
  method?: string = 'ALL';

  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;

  @IsOptional()
  @IsIn(['createdAt', 'amount'])
  sortBy?: 'createdAt' | 'amount' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class RevenueExportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  status?: string = 'ALL';

  @IsOptional()
  @IsString()
  plan?: string = 'ALL';

  @IsOptional()
  @IsString()
  method?: string = 'ALL';

  @IsOptional()
  @IsISO8601({}, { message: 'from must be a valid ISO 8601 date string' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be a valid ISO 8601 date string' })
  to?: string;
}
