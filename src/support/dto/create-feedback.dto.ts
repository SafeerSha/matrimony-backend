import { IsString, IsNotEmpty, IsNumber, Min, Max, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeedbackDto {
  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ example: 'general', enum: ['general', 'feature', 'bug'] })
  @IsString()
  @IsIn(['general', 'feature', 'bug'])
  type!: string;

  @ApiProperty({ example: 'The application is smooth and fast!' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}

