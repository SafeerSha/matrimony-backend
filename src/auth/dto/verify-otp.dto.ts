import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  email?: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  phoneOtp?: string;

  @IsOptional()
  @IsString()
  emailOtp?: string;
}
