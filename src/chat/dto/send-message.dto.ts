import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'Target receiver user UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('all', { message: 'receiverId must be a valid UUID' })
  receiverId!: string;

  @ApiProperty({
    description: 'Text content of the message',
    maxLength: 2000,
    example: 'Hello! Nice to connect with you.',
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content cannot be empty' })
  @MaxLength(2000, { message: 'content cannot exceed 2000 characters' })
  content!: string;
}
