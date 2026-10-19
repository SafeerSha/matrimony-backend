import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
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
    expect(result.id).toBe('n1');
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('should upsert a message notification by updating existing if present', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'existing-1' });
    mockPrisma.notification.update.mockResolvedValue({ id: 'existing-1', content: 'Shahdiya: hi' });

    const result = await service.upsertMessageNotification('rec-1', 'send-1', 'Shahdiya', 'hi');
    expect(result.id).toBe('existing-1');
    expect(mockPrisma.notification.update).toHaveBeenCalled();
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
