import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['today', '7d', '30d', '90d', 'custom'], {
    message: 'Preset must be one of: today, 7d, 30d, 90d, custom',
  })
  preset?: 'today' | '7d' | '30d' | '90d' | 'custom' = '30d';

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

export class AnalyticsTimeSeriesQueryDto extends AnalyticsQueryDto {
  @IsIn(['active_users', 'new_signups', 'revenue', 'churn_rate'], {
    message: 'Metric must be one of: active_users, new_signups, revenue, churn_rate',
  })
  metric!: 'active_users' | 'new_signups' | 'revenue' | 'churn_rate';
}
