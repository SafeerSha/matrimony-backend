import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export const transformToStringOrCsv = ({ value }: { value: any }) => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value).trim();
};

export const transformHeightString = ({ value }: { value: any }) => {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
};

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
  @Transform(transformHeightString)
  minHeight?: any;

  @IsOptional()
  @Transform(transformHeightString)
  maxHeight?: any;

  @IsOptional()
  religions?: any;

  @IsOptional()
  religion?: any;

  @IsOptional()
  maritalStatuses?: any;

  @IsOptional()
  maritalStatus?: any;

  @IsOptional()
  education?: any;

  @IsOptional()
  occupations?: any;

  @IsOptional()
  professions?: any;

  @IsOptional()
  employmentStatuses?: any;

  @IsOptional()
  location?: any;

  @IsOptional()
  locations?: any;

  @IsOptional()
  diet?: any;

  @IsOptional()
  gender?: any;

  @IsOptional()
  caste?: any;

  @IsOptional()
  income?: any;

  @IsOptional()
  intent?: any;

  @IsOptional()
  language?: any;
}
