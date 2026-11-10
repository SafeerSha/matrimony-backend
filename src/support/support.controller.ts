import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('inquiry')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Submit a customer support inquiry' })
  @ApiResponse({ status: 201, description: 'Support inquiry created and stored in database' })
  async createInquiry(
    @Body() dto: CreateInquiryDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?.sub || undefined;
    return this.supportService.createInquiry(dto, userId);
  }

  @Post('contact')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Alias for submit inquiry' })
  async createContact(
    @Body() dto: CreateInquiryDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?.sub || undefined;
    return this.supportService.createInquiry(dto, userId);
  }

  @Post('feedback')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Submit user feedback, rating, bug report, or feature suggestion' })
  @ApiResponse({ status: 201, description: 'Feedback stored in database' })
  async createFeedback(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: any,
  ) {
    const userId = user?.id || user?.sub || undefined;
    return this.supportService.createFeedback(dto, userId);
  }
}

