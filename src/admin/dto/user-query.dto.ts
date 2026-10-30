import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const PLAN_VALUES = ['ALL', 'BASIC', 'PAID'] as const;
const STATUS_VALUES = ['ALL', 'ACTIVE', 'BLOCKED', 'SUSPENDED'] as const;

export type PlanFilter = typeof PLAN_VALUES[number];
export type StatusFilter = typeof STATUS_VALUES[number];

export class AdminUserQueryDto {
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
  @MaxLength(100)
  location?: string;

  @IsOptional()
  @IsIn(PLAN_VALUES, { message: `plan must be one of: ${PLAN_VALUES.join(', ')}` })
  plan?: PlanFilter = 'ALL';

  @IsOptional()
  @IsIn(STATUS_VALUES, { message: `status must be one of: ${STATUS_VALUES.join(', ')}` })
  status?: StatusFilter = 'ALL';
}

export class UpdateTierBodyDto {
  @IsIn(['BASIC', 'PAID'], { message: 'tier must be BASIC or PAID' })
  tier!: 'BASIC' | 'PAID';
}

export class VerifyPhotoBodyDto {
  @IsIn(['approved', 'rejected'], { message: 'status must be approved or rejected' })
  status!: 'approved' | 'rejected';
}
