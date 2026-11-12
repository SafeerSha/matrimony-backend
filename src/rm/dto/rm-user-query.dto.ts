import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const CATEGORY_VALUES = ['ALL', 'Marriage', 'Friendship', 'Live-In'] as const;
const PLAN_VALUES = ['ALL', 'BASIC', 'PAID'] as const;
const STATUS_VALUES = ['ALL', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DEACTIVATED', 'DELETED'] as const;
const VERIFIED_VALUES = ['ALL', 'VERIFIED', 'UNVERIFIED'] as const;
const GENDER_VALUES = ['ALL', 'Male', 'Female', 'Other'] as const;

export type RmCategoryFilter = (typeof CATEGORY_VALUES)[number];
export type RmPlanFilter = (typeof PLAN_VALUES)[number];
export type RmStatusFilter = (typeof STATUS_VALUES)[number];
export type RmVerifiedFilter = (typeof VERIFIED_VALUES)[number];
export type RmGenderFilter = (typeof GENDER_VALUES)[number];

export class RmUserQueryDto {
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
  @IsIn(CATEGORY_VALUES, { message: `category must be one of: ${CATEGORY_VALUES.join(', ')}` })
  category?: RmCategoryFilter = 'ALL';

  @IsOptional()
  @IsIn(PLAN_VALUES, { message: `plan must be one of: ${PLAN_VALUES.join(', ')}` })
  plan?: RmPlanFilter = 'ALL';

  @IsOptional()
  @IsIn(STATUS_VALUES, { message: `status must be one of: ${STATUS_VALUES.join(', ')}` })
  status?: RmStatusFilter = 'ALL';

  @IsOptional()
  @IsIn(VERIFIED_VALUES, { message: `verified must be one of: ${VERIFIED_VALUES.join(', ')}` })
  verified?: RmVerifiedFilter = 'ALL';

  @IsOptional()
  @IsIn(GENDER_VALUES, { message: `gender must be one of: ${GENDER_VALUES.join(', ')}` })
  gender?: RmGenderFilter = 'ALL';
}

