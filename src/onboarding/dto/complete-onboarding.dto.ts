import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteOnboardingDto {
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  email?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gender?: string;

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
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
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
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fatherName?: string;

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
  @MaxLength(100)
  annualIncome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  height?: string;

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

  @IsOptional()
  @IsBoolean()
  skipPhotoCheck?: boolean;
}
