import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class SearchQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  minAge?: string;

  @IsOptional()
  @IsNumberString()
  maxAge?: string;

  @IsOptional()
  @IsString()
  religion?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  education?: string;

  @IsOptional()
  @IsString()
  educationLevel?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  caste?: string;

  @IsOptional()
  @IsString()
  diet?: string;

  @IsOptional()
  @IsString()
  minHeight?: string;

  @IsOptional()
  @IsString()
  maxHeight?: string;

  @IsOptional()
  @IsString()
  income?: string;

  @IsOptional()
  @IsString()
  annualIncome?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  motherTongue?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;
}
