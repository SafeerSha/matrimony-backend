import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const FEEDBACK_TYPE_VALUES = ['ALL', 'general', 'feature', 'bug'] as const;
const FEEDBACK_STATUS_VALUES = [
  'ALL',
  'SUBMITTED',
  'IN_REVIEW',
  'REVIEWED',
  'PLANNED',
  'RESOLVED',
  'ACTIONED',
  'DISMISSED',
] as const;
const FEEDBACK_PRIORITY_VALUES = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type RmFeedbackTypeFilter = (typeof FEEDBACK_TYPE_VALUES)[number];
export type RmFeedbackStatusFilter = (typeof FEEDBACK_STATUS_VALUES)[number];
export type RmFeedbackPriorityFilter = (typeof FEEDBACK_PRIORITY_VALUES)[number];

export class RmFeedbackQueryDto {
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
  @IsIn(FEEDBACK_TYPE_VALUES, { message: `type must be one of: ${FEEDBACK_TYPE_VALUES.join(', ')}` })
  type?: RmFeedbackTypeFilter = 'ALL';

  @IsOptional()
  @IsIn(FEEDBACK_STATUS_VALUES, { message: `status must be one of: ${FEEDBACK_STATUS_VALUES.join(', ')}` })
  status?: RmFeedbackStatusFilter = 'ALL';

  @IsOptional()
  @IsIn(FEEDBACK_PRIORITY_VALUES, { message: `priority must be one of: ${FEEDBACK_PRIORITY_VALUES.join(', ')}` })
  priority?: RmFeedbackPriorityFilter = 'ALL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

