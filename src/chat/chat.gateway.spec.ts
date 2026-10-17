import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let jwtService: JwtService;
  let chatService: ChatService;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockChatService = {
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    jwtService = module.get<JwtService>(JwtService);
    chatService = module.get<ChatService>(ChatService);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should authenticate client with auth.token and store socket mapping', async () => {
      const mockClient: any = {
        id: 'socket-123',
        handshake: {
          auth: { token: 'valid-jwt-token' },
          headers: {},
        },
        data: {},
        disconnect: jest.fn(),
      };

      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(mockClient.data.user).toEqual({ sub: 'user-1' });
    });

    it('should authenticate client with authorization header', async () => {
      const mockClient: any = {
        id: 'socket-456',
        handshake: {
          headers: { authorization: 'Bearer header-jwt-token' },
        },
        data: {},
        disconnect: jest.fn(),
      };

      mockJwtService.verify.mockReturnValue({ sub: 'user-2' });

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verify).toHaveBeenCalledWith('header-jwt-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate client with cookie header', async () => {
      const mockClient: any = {
        id: 'socket-789',
        handshake: {
          headers: { cookie: 'access_token=cookie-jwt-token; other=value' },
        },
        data: {},
        disconnect: jest.fn(),
      };

      mockJwtService.verify.mockReturnValue({ sub: 'user-3' });

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verify).toHaveBeenCalledWith('cookie-jwt-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client if no token is provided', async () => {
      const mockClient: any = {
        id: 'socket-none',
        handshake: {
          headers: {},
        },
        data: {},
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client if jwt verification fails', async () => {
      const mockClient: any = {
        id: 'socket-invalid',
        handshake: {
          auth: { token: 'invalid-token' },
          headers: {},
        },
        data: {},
        disconnect: jest.fn(),
      };

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleSendMessage', () => {
    it('should call chatService.sendMessage and emit to receiver if online', async () => {
      // Connect receiver first
      const receiverClient: any = {
        id: 'socket-receiver',
        handshake: { auth: { token: 'recv-token' }, headers: {} },
        data: {},
        disconnect: jest.fn(),
      };
      mockJwtService.verify.mockReturnValue({ sub: 'receiver-id' });
      await gateway.handleConnection(receiverClient);

      const senderClient: any = {
        id: 'socket-sender',
        data: { user: { sub: 'sender-id' } },
      };

      const emittedMessage = {
        id: 'msg-1',
        senderId: 'sender-id',
        receiverId: 'receiver-id',
        content: 'Hello World',
      };
      mockChatService.sendMessage.mockResolvedValue(emittedMessage);

      const emitMock = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: emitMock });

      const ack = await gateway.handleSendMessage(senderClient, {
        receiverId: 'receiver-id',
        content: 'Hello World',
      });

      expect(mockChatService.sendMessage).toHaveBeenCalledWith(
        'sender-id',
        'receiver-id',
        'Hello World',
      );
      expect(gateway.server.to).toHaveBeenCalledWith('socket-receiver');
      expect(emitMock).toHaveBeenCalledWith('receive_message', emittedMessage);
      expect(ack).toEqual({ event: 'message_sent', data: emittedMessage });
    });

    it('should return error event if sendMessage throws an error', async () => {
      const senderClient: any = {
        id: 'socket-sender',
        data: { user: { sub: 'sender-id' } },
      };

      mockChatService.sendMessage.mockRejectedValue(
        new Error('You can only message matched profiles.'),
      );

      const ack = await gateway.handleSendMessage(senderClient, {
        receiverId: 'receiver-id',
        content: 'Hello',
      });

      expect(ack).toEqual({
        event: 'error',
        data: 'You can only message matched profiles.',
      });
    });
  });
});
