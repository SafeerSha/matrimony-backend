import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const RM_INTERACTION_CHANNELS = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'MEETING',
  'NOTE',
] as const;

export const RM_INTERACTION_STATUSES = [
  'CONNECTED',
  'ATTEMPTED',
  'VOICEMAIL',
  'SCHEDULED',
  'RESOLVED',
] as const;

export const CLIENT_STAGES = [
  'NEW_LEAD',
  'ONBOARDED',
  'EXPLORING',
  'SHORTLISTS_SENT',
  'MEETING_ARRANGED',
  'PROPOSAL_SENT',
  'MATCHED',
  'INACTIVE',
] as const;

export const FOLLOW_UP_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const FOLLOW_UP_STATUSES = [
  'PENDING',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
] as const;

export class CreateShortlistDto {
  @IsString()
  @IsNotEmpty({ message: 'Candidate ID is required' })
  candidateId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateInteractionDto {
  @IsIn(RM_INTERACTION_CHANNELS, {
    message: `channel must be one of: ${RM_INTERACTION_CHANNELS.join(', ')}`,
  })
  channel!: (typeof RM_INTERACTION_CHANNELS)[number];

  @IsOptional()
  @IsIn(RM_INTERACTION_STATUSES, {
    message: `status must be one of: ${RM_INTERACTION_STATUSES.join(', ')}`,
  })
  status?: (typeof RM_INTERACTION_STATUSES)[number] = 'CONNECTED';

  @IsOptional()
  @IsIn(CLIENT_STAGES, {
    message: `clientStage must be one of: ${CLIENT_STAGES.join(', ')}`,
  })
  clientStage?: (typeof CLIENT_STAGES)[number];

  @IsString()
  @IsNotEmpty({ message: 'Interaction summary is required' })
  @MaxLength(300)
  summary!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;

  @IsOptional()
  @IsString()
  interactionAt?: string;
}

export class CreateFollowUpDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty({ message: 'Scheduled date/time is required' })
  scheduledAt!: string;

  @IsOptional()
  @IsIn(FOLLOW_UP_PRIORITIES, {
    message: `priority must be one of: ${FOLLOW_UP_PRIORITIES.join(', ')}`,
  })
  priority?: (typeof FOLLOW_UP_PRIORITIES)[number] = 'MEDIUM';
}

export class UpdateFollowUpDto {
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUSES, {
    message: `status must be one of: ${FOLLOW_UP_STATUSES.join(', ')}`,
  })
  status?: (typeof FOLLOW_UP_STATUSES)[number];

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  completionNotes?: string;
}

export class UpdateClientStageDto {
  @IsIn(CLIENT_STAGES, {
    message: `clientStage must be one of: ${CLIENT_STAGES.join(', ')}`,
  })
  clientStage!: (typeof CLIENT_STAGES)[number];
}

export class RmCandidateSearchQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  minAge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  maxAge?: number;

  @IsOptional()
  @IsString()
  community?: string;

  @IsOptional()
  @IsString()
  religion?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  education?: string;

  @IsOptional()
  @IsString()
  occupation?: string;
}

export class RmFollowUpQueryDto {
  @IsOptional()
  @IsIn(['today', 'upcoming', 'overdue', 'all', 'completed'], {
    message: 'filter must be today, upcoming, overdue, all, or completed',
  })
  filter?: 'today' | 'upcoming' | 'overdue' | 'all' | 'completed' = 'upcoming';

  @IsOptional()
  @IsString()
  clientId?: string;
}
