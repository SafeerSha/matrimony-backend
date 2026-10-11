import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  phoneOtp?: string;
}
