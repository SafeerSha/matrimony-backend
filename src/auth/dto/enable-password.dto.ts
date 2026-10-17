import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EnablePasswordDto {
  @ApiPropertyOptional({ example: 'MyStrongPassword123!', description: 'Optional new password if not previously set' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;

  @ApiPropertyOptional({ example: 'MyStrongPassword123!', description: 'Confirmation of new password' })
  @IsOptional()
  @IsString()
  confirmPassword?: string;
}
