import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ReactMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Emoji is required' })
  @MinLength(1, { message: 'Emoji cannot be empty' })
  @MaxLength(16, { message: 'Emoji is too long' })
  emoji!: string;
}

