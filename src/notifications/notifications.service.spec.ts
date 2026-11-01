import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const mockPrisma: any = {
    notification: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.profile.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create a notification', async () => {
    mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
    const result = await service.createNotification('1', 'TEST', 'Test message');
    expect(result?.id).toBe('n1');
    expect(mockPrisma.notification.create).toHaveBeenCalled();
  });

  it('should suppress interest notification if user disabled notifyInterests', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({
      preferences: {
        notificationPreferences: { notifyInterests: false },
      },
    });
    const result = await service.createNotification('1', 'NEW_INTEREST', 'Someone liked your profile');
    expect(result).toBeNull();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('should upsert a message notification by updating existing if present', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing-1' });
    mockPrisma.notification.update.mockResolvedValue({ id: 'existing-1', content: 'Shahdiya: hi' });
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.upsertMessageNotification('rec-1', 'send-1', 'Shahdiya', 'hi');
    expect(result?.id).toBe('existing-1');
    expect(mockPrisma.notification.update).toHaveBeenCalled();
  });

  it('should suppress message notification if recipient disabled notifyMessages', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({
      preferences: {
        notificationPreferences: { notifyMessages: false },
      },
    });

    const result = await service.upsertMessageNotification('rec-1', 'send-1', 'Shahdiya', 'hi');
    expect(result).toBeNull();
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('should get default notification preferences when none set', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue(null);
    const prefs = await service.getPreferences('u1');
    expect(prefs).toEqual({
      notifyInterests: true,
      notifyMessages: true,
      notifyMatches: true,
      notifyMarketing: false,
    });
  });

  it('should update and persist notification preferences', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue({
      preferences: {
        minAge: 21,
        notificationPreferences: { notifyInterests: true },
      },
    });
    mockPrisma.profile.upsert.mockResolvedValue({});

    const updated = await service.updatePreferences('u1', {
      notifyInterests: false,
      notifyMarketing: true,
    });

    expect(updated).toEqual({
      notifyInterests: false,
      notifyMessages: true,
      notifyMatches: true,
      notifyMarketing: true,
    });
    expect(mockPrisma.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
      })
    );
  });

  it('should get user notifications', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([{ id: 'n1' }]);
    const result = await service.getUserNotifications('1');
    expect(result.length).toBe(1);
  });

  it('should mark all as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });
    const result = await service.markAllAsRead('1');
    expect(result.count).toBe(5);
  });
});
