import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyRegistrationDto {
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  phoneOtp?: string;

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  emailOtp?: string;
}
