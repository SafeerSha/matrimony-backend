import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';

export const RM_FEEDBACK_STATUSES = [
  'SUBMITTED',
  'IN_REVIEW',
  'REVIEWED',
  'PLANNED',
  'RESOLVED',
  'ACTIONED',
  'DISMISSED',
] as const;

export const RM_FEEDBACK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type RmFeedbackStatus = (typeof RM_FEEDBACK_STATUSES)[number];
export type RmFeedbackPriority = (typeof RM_FEEDBACK_PRIORITIES)[number];

export class UpdateRmFeedbackDto {
  @IsOptional()
  @IsIn(RM_FEEDBACK_STATUSES, {
    message: `status must be one of: ${RM_FEEDBACK_STATUSES.join(', ')}`,
  })
  status?: RmFeedbackStatus;

  @IsOptional()
  @IsIn(RM_FEEDBACK_PRIORITIES, {
    message: `priority must be one of: ${RM_FEEDBACK_PRIORITIES.join(', ')}`,
  })
  priority?: RmFeedbackPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rmNotes?: string;
}

