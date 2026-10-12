import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({ example: 'MyStrongPassword123!', description: 'New password (min 8 characters)' })
  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @ApiPropertyOptional({ example: 'MyStrongPassword123!', description: 'Confirmation of new password' })
  @IsOptional()
  @IsString()
  confirmPassword?: string;
}
