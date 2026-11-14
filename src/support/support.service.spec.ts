import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';

jest.unstable_mockModule('../mail/mail.service', () => ({
  MailService: class MockMailService {
    sendSupportNotification = jest.fn().mockImplementation(() => Promise.resolve(true));
  },
}));

const { SupportService } = await import('./support.service');
const { SupportController } = await import('./support.controller');

describe('SupportService', () => {
  let service: any;
  let prisma: any;
  let mailService: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn() as any,
      },
      supportInquiry: {
        create: jest.fn() as any,
        findMany: jest.fn() as any,
        findUnique: jest.fn() as any,
        update: jest.fn() as any,
      },
      feedback: {
        create: jest.fn() as any,
        findFirst: jest.fn() as any,
        findMany: jest.fn() as any,
      },
    };

    mailService = {
      sendSupportNotification: jest.fn().mockImplementation(() => Promise.resolve(true)) as any,
    };

    service = new SupportService(prisma, mailService);
  });

  it('should create inquiry with referenceNumber and notify mail service', async () => {
    prisma.supportInquiry.create.mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      topic: 'Billing & Premium',
      name: 'Test User',
      email: 'test@example.com',
      message: 'Need help with renewal',
      status: 'OPEN',
    });

    const res = await service.createInquiry(
      {
        name: 'Test User',
        email: 'test@example.com',
        topic: 'Billing & Premium',
        message: 'Need help with renewal',
      },
      'user-1',
    );

    expect(res.success).toBe(true);
    expect(res.referenceNumber).toContain('INQ-');
    expect(mailService.sendSupportNotification).toHaveBeenCalled();
  });

  it('should prevent user from rating more than once', async () => {
    prisma.feedback.findFirst.mockResolvedValue({
      id: 'fb-1',
      rating: 5,
      type: 'general',
      message: 'Awesome service',
    });

    await expect(
      service.createFeedback(
        {
          rating: 4,
          type: 'general',
          message: 'trying to rate again',
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should retrieve existing rating for user', async () => {
    prisma.feedback.findFirst.mockResolvedValue({
      id: 'fb-1',
      rating: 4,
      type: 'general',
      message: 'Great app',
      createdAt: new Date(),
    });

    const res = await service.getUserRating('user-1');
    expect(res.hasRated).toBe(true);
    expect(res.rating).toBe(4);
  });

  it('should fetch ONLY support inquiries in requests (no ratings/feedback)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user1@example.com' });
    prisma.supportInquiry.findMany.mockResolvedValue([
      {
        id: 'inq-1',
        topic: 'Billing & Premium',
        message: 'How do I cancel my subscription?',
        status: 'OPEN',
        response: null,
        resolvedAt: null,
        createdAt: new Date('2026-11-14T10:00:00Z'),
        updatedAt: new Date('2026-11-14T10:00:00Z'),
      },
    ]);

    const res = await service.getUserRequests('user-1');

    expect(res.success).toBe(true);
    expect(res.summary.total).toBe(1);
    expect(res.requests.length).toBe(1);
    expect(res.requests[0].id).toBe('inq-1');
    expect(res.requests[0].type).toBe('INQUIRY');
    // Verify prisma.feedback was NOT queried in getUserRequests
    expect(prisma.feedback.findMany).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException if userId is missing', async () => {
    await expect(service.getUserRequests('')).rejects.toThrow(UnauthorizedException);
  });

  it('should prevent unauthorized users from closing requests belonging to others (IDOR check)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-attacker', email: 'attacker@example.com' });
    prisma.supportInquiry.findUnique.mockResolvedValue({
      id: 'inq-victim',
      userId: 'user-victim',
      email: 'victim@example.com',
      status: 'OPEN',
    });

    await expect(service.closeUserInquiry('user-attacker', 'inq-victim')).rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to close their own request', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-owner', email: 'owner@example.com' });
    prisma.supportInquiry.findUnique.mockResolvedValue({
      id: 'inq-100',
      userId: 'user-owner',
      email: 'owner@example.com',
      status: 'OPEN',
    });
    prisma.supportInquiry.update.mockResolvedValue({
      id: 'inq-100',
      status: 'CLOSED',
    });

    const res = await service.closeUserInquiry('user-owner', 'inq-100');
    expect(res.success).toBe(true);
    expect(prisma.supportInquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inq-100' },
        data: expect.objectContaining({ status: 'CLOSED' }),
      }),
    );
  });
});

describe('SupportController', () => {
  let controller: any;
  let service: any;

  beforeEach(() => {
    service = {
      createInquiry: jest.fn() as any,
      createFeedback: jest.fn() as any,
      getUserRequests: jest.fn() as any,
      getUserRating: jest.fn() as any,
      closeUserInquiry: jest.fn() as any,
    };

    controller = new SupportController(service);
  });

  it('should require authentication for getMyRequests', async () => {
    await expect(controller.getMyRequests(null)).rejects.toThrow(UnauthorizedException);
  });

  it('should delegate getMyRating to service for authenticated user', async () => {
    service.getUserRating.mockResolvedValue({ hasRated: true, rating: 5 });
    const res = await controller.getMyRating({ sub: 'user-123' });
    expect(res.hasRated).toBe(true);
    expect(service.getUserRating).toHaveBeenCalledWith('user-123');
  });

  it('should delegate getMyRequests to service for authenticated user', async () => {
    service.getUserRequests.mockResolvedValue({ success: true, requests: [] });
    const res = await controller.getMyRequests({ sub: 'user-123' });
    expect(res.success).toBe(true);
    expect(service.getUserRequests).toHaveBeenCalledWith('user-123');
  });

  it('should delegate closeMyInquiry to service for authenticated user', async () => {
    service.closeUserInquiry.mockResolvedValue({ success: true });
    const res = await controller.closeMyInquiry('inq-1', { sub: 'user-123' });
    expect(res.success).toBe(true);
    expect(service.closeUserInquiry).toHaveBeenCalledWith('user-123', 'inq-1');
  });
});
