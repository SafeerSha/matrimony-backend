import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  onboardingStep?: number;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  emailOtp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  profileFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lookingIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  community?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  about?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  religion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  caste?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  education?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  profession?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  employmentStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  annualIncome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  income?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null ? String(value).trim() : undefined))
  @IsString()
  @MaxLength(50)
  height?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  motherTongue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  family?: string;

  @IsOptional()
  lifestyle?: any;

  @IsOptional()
  interests?: any;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  lookingFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  permanentAddress?: string;

  @IsOptional()
  @IsBoolean()
  fatherAlive?: boolean;

  @IsOptional()
  @IsBoolean()
  motherAlive?: boolean;

  @IsOptional()
  brothersCount?: number;

  @IsOptional()
  brothersMarried?: number;

  @IsOptional()
  sistersCount?: number;

  @IsOptional()
  sistersMarried?: number;

  @IsOptional()
  familyDetails?: any;
}
