import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ example: '1 Month Permit' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'BASIC' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Basic' })
  @IsString()
  @IsOptional()
  badge?: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'per month' })
  @IsString()
  @IsNotEmpty()
  period!: string;

  @ApiProperty({ example: 30 })
  @IsNumber()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({ example: 'Ideal for trying out the platform and exploring matches.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ['Active Premium access', 'Unlimited messaging'] })
  @IsArray()
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  contactCredits?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  dailyInterestsLimit?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  popular?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: '1 Month Permit' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'BASIC' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Basic' })
  @IsString()
  @IsOptional()
  badge?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'per month' })
  @IsString()
  @IsOptional()
  period?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ example: 'Ideal for trying out the platform.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ['Active Premium access', 'Unlimited messaging'] })
  @IsArray()
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  contactCredits?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  dailyInterestsLimit?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  popular?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}
