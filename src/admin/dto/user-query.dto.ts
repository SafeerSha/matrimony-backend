import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength, IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const PLAN_VALUES = ['ALL', 'BASIC', 'PAID'] as const;
const STATUS_VALUES = ['ALL', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DEACTIVATED', 'DELETED'] as const;
const ROLE_FILTER_VALUES = ['ALL', 'USER', 'RM'] as const;

export type PlanFilter = typeof PLAN_VALUES[number];
export type StatusFilter = typeof STATUS_VALUES[number];
export type RoleFilter = typeof ROLE_FILTER_VALUES[number];

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

  @IsOptional()
  @IsIn(ROLE_FILTER_VALUES, { message: `role must be one of: ${ROLE_FILTER_VALUES.join(', ')}` })
  role?: RoleFilter = 'ALL';
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

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(100)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  password!: string;

  @IsIn(['USER', 'RM'], { message: 'role must be USER or RM' })
  role!: 'USER' | 'RM';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  password!: string;
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
