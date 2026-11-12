import {
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export const REPORT_REASON_VALUES = [
  'spam',
  'harassment',
  'fake_profile',
  'inappropriate_content',
  'other',
] as const;

export const REPORT_STATUS_VALUES = [
  'PENDING',
  'REVIEWED',
  'RESOLVED',
  'DISMISSED',
] as const;

export type ReportReasonType = typeof REPORT_REASON_VALUES[number];
export type ReportStatusType = typeof REPORT_STATUS_VALUES[number];

export class BlockUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateReportDto {
  @IsString()
  @IsIn(REPORT_REASON_VALUES, {
    message: `reason must be one of: ${REPORT_REASON_VALUES.join(', ')}`,
  })
  reason!: ReportReasonType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class AdminReportQueryDto {
  @IsOptional()
  @IsIn(['ALL', ...REPORT_STATUS_VALUES], {
    message: `status must be one of: ALL, ${REPORT_STATUS_VALUES.join(', ')}`,
  })
  status?: 'ALL' | ReportStatusType = 'ALL';

  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid ISO 8601 date string' })
  fromDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid ISO 8601 date string' })
  toDate?: string;

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
}

export class UpdateReportStatusDto {
  @IsIn(REPORT_STATUS_VALUES, {
    message: `status must be one of: ${REPORT_STATUS_VALUES.join(', ')}`,
  })
  status!: ReportStatusType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

