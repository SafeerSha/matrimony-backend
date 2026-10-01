import { IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateIf } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsNumber()
  @Min(18)
  @Max(100)
  minAge?: number;

  @IsOptional()
  @IsNumber()
  @Min(18)
  @Max(100)
  @ValidateIf((o) => o.minAge !== undefined && o.maxAge !== undefined)
  maxAge?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  minHeight?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxHeight?: number;

  @IsOptional()
  @IsString()
  religions?: string; // Stored as comma-separated or JSON string

  @IsOptional()
  @IsString()
  maritalStatuses?: string; // Stored as comma-separated or JSON string
}
