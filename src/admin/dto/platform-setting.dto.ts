import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCoolingPeriodSettingDto {
  @ApiProperty({
    description: 'Whether deleted user accounts must undergo a cooling-off period before re-registering',
    example: true,
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    description: 'Duration in days for the cooling-off period',
    example: 30,
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  days?: number;
}
