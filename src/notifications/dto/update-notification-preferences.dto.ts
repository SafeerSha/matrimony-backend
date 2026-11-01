import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Receive alerts when someone sends an interest' })
  @IsBoolean()
  @IsOptional()
  notifyInterests?: boolean;

  @ApiPropertyOptional({ description: 'Receive alerts when you get a chat message' })
  @IsBoolean()
  @IsOptional()
  notifyMessages?: boolean;

  @ApiPropertyOptional({ description: 'Receive weekly match recommendation digests' })
  @IsBoolean()
  @IsOptional()
  notifyMatches?: boolean;

  @ApiPropertyOptional({ description: 'Receive membership offers and promotion news' })
  @IsBoolean()
  @IsOptional()
  notifyMarketing?: boolean;
}

