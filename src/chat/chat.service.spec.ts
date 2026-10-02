import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ForbiddenException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;

  const mockPrisma = {
    connection: {
      findFirst: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockNotifications = {
    createNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send a message if connection is ACCEPTED', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue({ id: 'c1' });
      mockPrisma.message.create.mockResolvedValue({ id: 'm1', content: 'hello' });

      const result = await service.sendMessage('1', '2', 'hello');
      
      expect(result.id).toBe('m1');
      expect(mockNotifications.createNotification).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if not connected', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      await expect(service.sendMessage('1', '2', 'hello')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getChatHistory', () => {
    it('should return chat history if connected', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue({ id: 'c1' });
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.getChatHistory('1', '2');
      expect(result.length).toBe(1);
    });
  });
});
