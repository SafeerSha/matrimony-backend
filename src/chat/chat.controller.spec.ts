import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  let service: ChatService;

  const mockChatService = {
    getConversations: jest.fn(),
    getChatHistory: jest.fn(),
    markAsRead: jest.fn(),
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    service = module.get<ChatService>(ChatService);
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
    it('should call chatService.getChatHistory with user.sub and contactId', async () => {
      mockChatService.getChatHistory.mockResolvedValue([]);
      const result = await controller.getHistory({ sub: 'user-1' }, 'contact-1');
      expect(result).toEqual([]);
      expect(mockChatService.getChatHistory).toHaveBeenCalledWith('user-1', 'contact-1');
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

  describe('sendMessage', () => {
    it('should call chatService.sendMessage with dto parameters', async () => {
      const message = { id: 'm1', content: 'hello' };
      mockChatService.sendMessage.mockResolvedValue(message);
      const result = await controller.sendMessage(
        { sub: 'user-1' },
        { receiverId: 'user-2', content: 'hello' },
      );
      expect(result).toBe(message);
      expect(mockChatService.sendMessage).toHaveBeenCalledWith('user-1', 'user-2', 'hello');
    });
  });
});
