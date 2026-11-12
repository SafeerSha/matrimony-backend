import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SubscriptionService } from '../subscription/subscription.service';

describe('ChatController', () => {
  let controller: ChatController;

  const mockChatService = {
    getConversations: jest.fn<any>(),
    getChatHistory: jest.fn<any>(),
    initiateChat: jest.fn<any>(),
    markAsRead: jest.fn<any>(),
    sendMessage: jest.fn<any>(),
  };

  const mockSubscriptionService = {
    hasActiveChatPermit: jest.fn<any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: mockChatService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getConversations', () => {
    it('should call chatService.getConversations with user.sub', async () => {
      mockChatService.getConversations.mockResolvedValue([]);
      const result = await controller.getConversations({ sub: 'user-1' });
      expect(result).toEqual([]);
      expect(mockChatService.getConversations).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getHistory', () => {
    it('should call chatService.getChatHistory with user.sub, contactId, and pagination query', async () => {
      const paginated = {
        data: [],
        meta: { limit: 50, count: 0, hasMore: false, nextCursor: null, prevCursor: null },
      };
      mockChatService.getChatHistory.mockResolvedValue(paginated);

      const result = await controller.getHistory({ sub: 'user-1' }, 'contact-1');
      expect(result).toEqual(paginated);
      expect(mockChatService.getChatHistory).toHaveBeenCalledWith('user-1', 'contact-1', {});
    });

    it('should forward cursor, limit, and direction query params', async () => {
      const paginated = {
        data: [{ id: 'm1' }],
        meta: { limit: 25, count: 1, hasMore: true, nextCursor: 'm1', prevCursor: 'm1' },
      };
      mockChatService.getChatHistory.mockResolvedValue(paginated);

      const query = { cursor: 'm26', limit: 25, direction: 'before' as const };
      const result = await controller.getHistory({ sub: 'user-1' }, 'contact-1', query);
      expect(result).toEqual(paginated);
      expect(mockChatService.getChatHistory).toHaveBeenCalledWith('user-1', 'contact-1', query);
    });
  });

  describe('getConversationMessages', () => {
    it('should strip conv- prefix and forward pagination query to getChatHistory', async () => {
      const paginated = {
        data: [{ id: 'm10' }],
        meta: { limit: 50, count: 1, hasMore: false, nextCursor: null, prevCursor: null },
      };
      mockChatService.getChatHistory.mockResolvedValue(paginated);

      const query = { limit: 50 };
      const result = await controller.getConversationMessages(
        { sub: 'user-1' },
        'conv-contact-1',
        query,
      );

      expect(result).toEqual(paginated);
      expect(mockChatService.getChatHistory).toHaveBeenCalledWith('user-1', 'contact-1', query);
    });
  });

  describe('markAsRead', () => {
    it('should call chatService.markAsRead with user.sub and contactId', async () => {
      mockChatService.markAsRead.mockResolvedValue({ success: true });
      const result = await controller.markAsRead({ sub: 'user-1' }, 'contact-1');
      expect(result).toEqual({ success: true });
      expect(mockChatService.markAsRead).toHaveBeenCalledWith('user-1', 'contact-1');
    });
  });

  describe('sendMessageHttp', () => {
    it('should call chatService.sendMessage with body parameters', async () => {
      const message = { id: 'm1', content: 'hello' };
      mockChatService.sendMessage.mockResolvedValue(message);
      const result = await controller.sendMessageHttp(
        { sub: 'user-1' },
        { receiverId: 'user-2', content: 'hello' },
      );
      expect(result).toBe(message);
      expect(mockChatService.sendMessage).toHaveBeenCalledWith('user-1', 'user-2', 'hello');
    });
  });
});
