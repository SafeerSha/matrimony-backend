import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const PLAN_VALUES = ['ALL', 'BASIC', 'PAID'] as const;
const STATUS_VALUES = ['ALL', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DEACTIVATED', 'DELETED'] as const;

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

export class UpdateStatusBodyDto {
  @IsIn(['ACTIVE', 'BLOCKED', 'SUSPENDED', 'DEACTIVATED'], {
    message: 'status must be ACTIVE, BLOCKED, SUSPENDED, or DEACTIVATED',
  })
  status!: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'DEACTIVATED';
}

export class UpdateTierBodyDto {
  @IsString()
  tier!: string;
}

export class AssignPlanBodyDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  customDurationDays?: number;

  @IsOptional()
  @IsIn(['apply', 'revoke'])
  action?: 'apply' | 'revoke' = 'apply';
}

export class VerifyPhotoBodyDto {
  @IsIn(['approved', 'rejected'], { message: 'status must be approved or rejected' })
  status!: 'approved' | 'rejected';
}
