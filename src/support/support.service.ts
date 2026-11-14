import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
      referenceNumber: `INQ-${inquiry.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    };
  }

  /**
   * One-time rating and feedback submission per user.
   */
  async createFeedback(dto: CreateFeedbackDto, userId?: string) {
    if (userId) {
      const existing = await this.prisma.feedback.findFirst({
        where: { userId },
      });
      if (existing) {
        throw new BadRequestException('You have already submitted a rating. Ratings are limited to once per account.');
      }
    }

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
      referenceNumber: `FBK-${feedback.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    };
  }

  /**
   * Checks if the authenticated user has already submitted a rating.
   */
  async getUserRating(userId: string) {
    if (!userId) {
      return { hasRated: false, rating: null, feedback: null };
    }

    const existing = await this.prisma.feedback.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rating: true,
        type: true,
        message: true,
        createdAt: true,
      },
    });

    if (!existing) {
      return { hasRated: false, rating: null, feedback: null };
    }

    return {
      hasRated: true,
      rating: existing.rating,
      feedback: existing,
    };
  }

  /**
   * Retrieves all customer support inquiries submitted by the authenticated user.
   * Feedback/ratings are excluded because ratings are not support requests.
   */
  async getUserRequests(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required to view your support requests');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    const inquiries = await this.prisma.supportInquiry.findMany({
      where: {
        OR: [
          { userId },
          ...(user?.email ? [{ email: { equals: user.email, mode: 'insensitive' as const } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const formattedInquiries = inquiries.map((inq) => {
      const statusUpper = inq.status?.toUpperCase() || 'OPEN';
      let statusLabel = 'Submitted';
      let statusBadgeVariant: 'amber' | 'blue' | 'emerald' | 'gray' = 'amber';
      let statusCategory: 'pending' | 'in_progress' | 'resolved' | 'closed' = 'pending';

      if (statusUpper === 'IN_PROGRESS') {
        statusLabel = 'In Progress';
        statusBadgeVariant = 'blue';
        statusCategory = 'in_progress';
      } else if (statusUpper === 'RESOLVED') {
        statusLabel = 'Resolved';
        statusBadgeVariant = 'emerald';
        statusCategory = 'resolved';
      } else if (statusUpper === 'CLOSED') {
        statusLabel = 'Closed';
        statusBadgeVariant = 'gray';
        statusCategory = 'closed';
      }

      return {
        id: inq.id,
        referenceNumber: `INQ-${inq.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        type: 'INQUIRY' as const,
        category: inq.topic || 'General Inquiry',
        subject: inq.topic || 'Support Inquiry',
        message: inq.message,
        status: statusUpper,
        statusLabel,
        statusBadgeVariant,
        statusCategory,
        response: inq.response || null,
        resolvedAt: inq.resolvedAt || null,
        createdAt: inq.createdAt,
        updatedAt: inq.updatedAt,
      };
    });

    const activeCount = formattedInquiries.filter(
      (r) => r.statusCategory === 'pending' || r.statusCategory === 'in_progress',
    ).length;
    const resolvedCount = formattedInquiries.filter(
      (r) => r.statusCategory === 'resolved' || r.statusCategory === 'closed',
    ).length;

    return {
      success: true,
      summary: {
        total: formattedInquiries.length,
        active: activeCount,
        resolved: resolvedCount,
      },
      requests: formattedInquiries,
    };
  }

  /**
   * Safely closes an inquiry initiated by the authenticated user.
   */
  async closeUserInquiry(userId: string, inquiryId: string) {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    const inquiry = await this.prisma.supportInquiry.findUnique({
      where: { id: inquiryId },
    });

    if (!inquiry) {
      throw new NotFoundException('Support request not found');
    }

    const isOwner =
      inquiry.userId === userId ||
      (user?.email && inquiry.email.toLowerCase() === user.email.toLowerCase());

    if (!isOwner) {
      throw new ForbiddenException('You do not have permission to modify this request');
    }

    if (inquiry.status === 'CLOSED') {
      return {
        success: true,
        message: 'Request is already closed',
        inquiry,
      };
    }

    const updated = await this.prisma.supportInquiry.update({
      where: { id: inquiryId },
      data: {
        status: 'CLOSED',
        resolvedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Support request closed successfully',
      inquiry: updated,
    };
  }
}
