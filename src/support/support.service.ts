import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async createInquiry(dto: CreateInquiryDto, userId?: string) {
    const inquiry = await this.prisma.supportInquiry.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        topic: dto.topic.trim(),
        message: dto.message.trim(),
        userId: userId || null,
        status: 'OPEN',
      },
    });

    this.logger.log(`Support inquiry created: #${inquiry.id} - ${dto.topic} by ${dto.name}`);

    // Fire email notification asynchronously (never blocks response)
    this.mailService
      .sendSupportNotification({
        name: dto.name,
        email: dto.email,
        topic: dto.topic,
        message: dto.message,
        userId,
      })
      .catch((err) => {
        this.logger.warn(`Failed to dispatch support inquiry email for #${inquiry.id}: ${err.message}`);
      });

    return {
      success: true,
      message: 'Your inquiry has been received. Our team will review it and get back to you within 24 hours.',
      inquiryId: inquiry.id,
    };
  }

  async createFeedback(dto: CreateFeedbackDto, userId?: string) {
    const feedback = await this.prisma.feedback.create({
      data: {
        rating: dto.rating,
        type: dto.type,
        message: dto.message.trim(),
        userId: userId || null,
        status: 'SUBMITTED',
      },
    });

    this.logger.log(`Feedback created: #${feedback.id} - ${dto.rating} stars [${dto.type}] by user ${userId || 'anonymous'}`);

    return {
      success: true,
      message: 'Thank you for your valuable feedback! We deeply appreciate your time and review.',
      feedbackId: feedback.id,
    };
  }
}

