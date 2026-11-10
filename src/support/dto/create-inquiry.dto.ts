import { IsString, IsNotEmpty, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInquiryDto {
  @ApiProperty({ example: 'Safeer Sha' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'safeer@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'General Inquiry' })
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @ApiProperty({ example: 'I have a question about my profile...' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}

