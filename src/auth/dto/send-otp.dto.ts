import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendOtpDto {
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  purpose?: string;
}
