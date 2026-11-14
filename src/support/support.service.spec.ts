import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';

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

  it('should fetch unified user requests belonging strictly to the user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user1@example.com' });
    prisma.supportInquiry.findMany.mockResolvedValue([
      {
        id: 'inq-1',
        topic: 'General Inquiry',
        message: 'How do I change my city?',
        status: 'OPEN',
        response: null,
        resolvedAt: null,
        createdAt: new Date('2026-11-14T10:00:00Z'),
        updatedAt: new Date('2026-11-14T10:00:00Z'),
      },
    ]);
    prisma.feedback.findMany.mockResolvedValue([
      {
        id: 'fb-1',
        type: 'bug',
        rating: 4,
        message: 'Found a small display glitch on profile view',
        status: 'IN_REVIEW',
        priority: 'MEDIUM',
        rmNotes: 'Investigating with engineering team',
        reviewedAt: new Date('2026-11-14T12:00:00Z'),
        createdAt: new Date('2026-11-14T11:00:00Z'),
        updatedAt: new Date('2026-11-14T12:00:00Z'),
      },
    ]);

    const res = await service.getUserRequests('user-1');

    expect(res.success).toBe(true);
    expect(res.summary.total).toBe(2);
    expect(res.summary.active).toBe(2);
    expect(res.requests.length).toBe(2);
    expect(res.requests[0].id).toBe('fb-1'); // newer first
    expect(res.requests[0].response).toBe('Investigating with engineering team');
    expect(res.requests[1].id).toBe('inq-1');
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
      closeUserInquiry: jest.fn() as any,
    };

    controller = new SupportController(service);
  });

  it('should require authentication for getMyRequests', async () => {
    await expect(controller.getMyRequests(null)).rejects.toThrow(UnauthorizedException);
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
