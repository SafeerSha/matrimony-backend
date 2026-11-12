import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const CATEGORY_VALUES = ['ALL', 'Marriage', 'Friendship', 'Live-In'] as const;
const MARRIAGE_SUB_CATEGORY_VALUES = ['Kerala', 'Telugu', 'Bharat'] as const;
const PLAN_VALUES = ['ALL', 'BASIC', 'PAID'] as const;
const STATUS_VALUES = ['ALL', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DEACTIVATED', 'DELETED'] as const;
const VERIFIED_VALUES = ['ALL', 'VERIFIED', 'UNVERIFIED'] as const;
const GENDER_VALUES = ['ALL', 'Male', 'Female', 'Other'] as const;

export type RmCategoryFilter = (typeof CATEGORY_VALUES)[number];
export type RmMarriageSubCategory = (typeof MARRIAGE_SUB_CATEGORY_VALUES)[number];
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
  @Transform(({ value }) => {
    const rawList = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : [];
    const cleaned = rawList.map((v) => String(v).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  })
  @IsArray()
  @IsIn(MARRIAGE_SUB_CATEGORY_VALUES, {
    each: true,
    message: `subCategories must contain only: ${MARRIAGE_SUB_CATEGORY_VALUES.join(', ')}`,
  })
  subCategories?: RmMarriageSubCategory[];

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

