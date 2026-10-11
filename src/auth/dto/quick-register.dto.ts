import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class QuickRegisterDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  email?: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  profileFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  createdBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lookingIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  community?: string;
}
