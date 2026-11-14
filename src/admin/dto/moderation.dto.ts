import {
  IsArray,
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

export class PhotoModerationQueryDto {
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
  limit?: number = 24;

  @IsOptional()
  @IsIn(['unverified', 'verified', 'all'], {
    message: 'status must be unverified, verified, or all',
  })
  status?: 'unverified' | 'verified' | 'all' = 'unverified';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class BatchVerifyPhotoDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'photoIds array cannot be empty' })
  photoIds!: string[];

  @IsIn(['approved', 'rejected'], {
    message: 'status must be approved or rejected',
  })
  status!: 'approved' | 'rejected';
}

export class RejectProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @MaxLength(500)
  reason!: string;
}

export class PendingProfileQueryDto {
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
  @MaxLength(50)
  status?: string = 'PENDING_VERIFICATION';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class AssignClientsToRmDto {
  @IsString()
  @IsNotEmpty({ message: 'rmId is required' })
  rmId!: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'clientUserIds must contain at least one user ID' })
  clientUserIds!: string[];
}

export class UnassignClientsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'clientUserIds must contain at least one user ID' })
  clientUserIds!: string[];
}
