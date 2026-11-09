import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Subscription plan code (e.g. BASIC, STANDARD, PLUS, ELITE)',
    example: 'STANDARD',
  })
  @IsNotEmpty()
  @IsString()
  planCode!: string;
}
