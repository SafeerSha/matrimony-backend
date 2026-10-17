import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;

  const mockPrisma = {
    connection: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
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
      mockPrisma.message.create.mockResolvedValue({
        id: 'm1',
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'hello',
        createdAt: new Date(),
      });

      const result = await service.sendMessage('user-1', 'user-2', 'hello');

      expect(result.id).toBe('m1');
      expect(mockNotifications.createNotification).toHaveBeenCalledWith(
        'user-2',
        'NEW_MESSAGE',
        'You have a new message!',
        'm1',
      );
    });

    it('should throw ForbiddenException if not connected', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      await expect(service.sendMessage('user-1', 'user-2', 'hello')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if senderId equals receiverId', async () => {
      await expect(service.sendMessage('user-1', 'user-1', 'hello')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if content is empty or whitespace only', async () => {
      await expect(service.sendMessage('user-1', 'user-2', '   ')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getChatHistory', () => {
    it('should return chat history if connected', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue({ id: 'c1' });
      mockPrisma.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          senderId: 'user-1',
          receiverId: 'user-2',
          content: 'hi',
          isRead: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.getChatHistory('user-1', 'user-2');
      expect(result.length).toBe(1);
      expect(result[0].content).toBe('hi');
    });

    it('should throw ForbiddenException if mutual connection does not exist', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      await expect(service.getChatHistory('user-1', 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark unread messages as read and return success: true', async () => {
      mockPrisma.message.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAsRead('user-1', 'user-2');
      expect(result).toEqual({ success: true });
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          receiverId: 'user-1',
          senderId: 'user-2',
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });
    });
  });

  describe('getConversations', () => {
    it('should return conversations with partner profile, lastMessage, and unreadCount', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          senderId: 'user-1',
          receiverId: 'user-2',
          status: 'ACCEPTED',
          updatedAt: new Date('2026-01-01'),
          receiver: {
            id: 'user-2',
            firstName: 'Priya',
            lastName: 'Sharma',
            isPhoneVerified: true,
            isEmailVerified: true,
            status: 'ACTIVE',
            profile: {
              id: 'prof-2',
              firstName: 'Priya',
              lastName: 'Sharma',
              city: 'Mumbai',
              occupation: 'Software Engineer',
            },
            photos: [
              {
                id: 'photo-1',
                url: 'https://example.com/p1.jpg',
                isPrimary: true,
                isVerified: true,
                createdAt: new Date(),
              },
            ],
          },
        },
      ];

      mockPrisma.connection.findMany.mockResolvedValue(mockConnections);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-2',
        receiverId: 'user-1',
        content: 'Hi there!',
        isRead: false,
        createdAt: new Date('2026-01-02T10:00:00Z'),
        updatedAt: new Date('2026-01-02T10:00:00Z'),
      });
      mockPrisma.message.count.mockResolvedValue(1);

      const conversations = await service.getConversations('user-1');

      expect(conversations.length).toBe(1);
      const conv = conversations[0];
      expect(conv.id).toBe('user-2');
      expect(conv.participantId).toBe('user-2');
      expect(conv.participant.firstName).toBe('Priya');
      expect(conv.participant.city).toBe('Mumbai');
      expect(conv.participant.isVerified).toBe(true);
      expect(conv.lastMessage?.content).toBe('Hi there!');
      expect(conv.unreadCount).toBe(1);
      expect(conv.updatedAt).toEqual(new Date('2026-01-02T10:00:00Z'));
    });
  });

  describe('initiateChat', () => {
    it('should successfully initialize chat when mutual match exists', async () => {
      const mockConn = {
        id: 'conn-1',
        senderId: 'user-1',
        receiverId: 'user-2',
        status: 'ACCEPTED',
        createdAt: new Date(),
        sender: { id: 'user-1', firstName: 'John', lastName: 'Doe', profile: {} },
        receiver: {
          id: 'user-2',
          firstName: 'Jane',
          lastName: 'Smith',
          photos: [{ url: 'https://test.com/photo.jpg', isPrimary: true }],
          profile: { city: 'Mumbai', occupation: 'Designer' },
        },
      };

      mockPrisma.connection.findFirst.mockResolvedValue(mockConn);
      mockPrisma.message.findFirst.mockResolvedValue(null);

      const result = await service.initiateChat('user-1', 'user-2');
      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-user-2');
      expect(result.contactId).toBe('user-2');
      expect(result.partner.name).toBe('Jane Smith');
      expect(result.partner.photo).toBe('https://test.com/photo.jpg');
    });

    it('should throw ForbiddenException if users are not matched', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      await expect(service.initiateChat('user-1', 'user-unmatched')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if initiating chat with oneself', async () => {
      await expect(service.initiateChat('user-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getConversations', () => {
    it('should return list of conversations for accepted matches', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          senderId: 'user-1',
          receiverId: 'user-2',
          status: 'ACCEPTED',
          updatedAt: new Date(),
          sender: { id: 'user-1', firstName: 'John' },
          receiver: {
            id: 'user-2',
            firstName: 'Jane',
            lastName: 'Smith',
            profile: { city: 'Delhi' },
            photos: [{ url: 'https://test.com/jane.jpg' }],
          },
        },
      ];

      mockPrisma.connection.findMany.mockResolvedValue(mockConnections);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-2',
        receiverId: 'user-1',
        content: 'Hi there!',
        createdAt: new Date(),
        isRead: false,
      });
      mockPrisma.message.count.mockResolvedValue(1);

      const convos = await service.getConversations('user-1');
      expect(convos).toHaveLength(1);
      expect(convos[0].id).toBe('conv-user-2');
      expect(convos[0].participant.name).toBe('Jane Smith');
      expect(convos[0].unreadCount).toBe(1);
      expect(convos[0].lastMessage?.content).toBe('Hi there!');
    });
  });
});

