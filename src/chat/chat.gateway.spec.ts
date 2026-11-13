import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

jest.unstable_mockModule('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    verify = jest.fn();
  },
}));

const { JwtService } = await import('@nestjs/jwt');
const { ChatGateway } = await import('./chat.gateway');
const { ChatService } = await import('./chat.service');
const { PrismaService } = await import('../prisma/prisma.service');
const { SubscriptionService } = await import('../subscription/subscription.service');

describe('ChatGateway', () => {
  let gateway: InstanceType<typeof ChatGateway>;

  const mockJwtService = {
    verify: jest.fn<any>(),
  };

  const mockChatService = {
    sendMessage: jest.fn<any>(),
    markAsRead: jest.fn<any>(),
    toggleReaction: jest.fn<any>(),
  };

  const mockPrismaService = {
    user: {
      update: jest.fn<any>(),
    },
  };

  const mockSubscriptionService = {
    hasActiveChatPermit: jest.fn<any>(),
  };

  const createClient = (id: string, overrides: Record<string, any> = {}): any => ({
    id,
    handshake: {
      auth: {},
      headers: {},
      query: {},
    },
    data: {},
    disconnect: jest.fn(),
    ...overrides,
  });

  beforeEach(async () => {
    mockPrismaService.user.update.mockResolvedValue({});
    mockSubscriptionService.hasActiveChatPermit.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ChatService, useValue: mockChatService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    } as any;
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe('handleConnection & authentication', () => {
    it('should authenticate client with auth.token and store socket mapping', async () => {
      const mockClient = createClient('socket-123', {
        handshake: { auth: { token: 'valid-jwt-token' }, headers: {}, query: {} },
      });

      mockJwtService.verify.mockReturnValue({ sub: 'user-1' });

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(mockClient.data.user).toEqual({ sub: 'user-1' });
      expect(gateway.isUserOnline('user-1')).toBe(true);
      expect(gateway.getUserSocketCount('user-1')).toBe(1);
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'user_presence',
        expect.objectContaining({ userId: 'user-1', isOnline: true }),
      );
    });

    it('should authenticate client with authorization header', async () => {
      const mockClient = createClient('socket-456', {
        handshake: { headers: { authorization: 'Bearer header-jwt-token' }, auth: {}, query: {} },
      });

      mockJwtService.verify.mockReturnValue({ sub: 'user-2' });

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verify).toHaveBeenCalledWith('header-jwt-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(gateway.isUserOnline('user-2')).toBe(true);
    });

    it('should authenticate client with cookie header', async () => {
      const mockClient = createClient('socket-789', {
        handshake: {
          headers: { cookie: 'access_token=cookie-jwt-token; other=value' },
          auth: {},
          query: {},
        },
      });

      mockJwtService.verify.mockReturnValue({ sub: 'user-3' });

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verify).toHaveBeenCalledWith('cookie-jwt-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(gateway.isUserOnline('user-3')).toBe(true);
    });

    it('should disconnect client if no token is provided', async () => {
      const mockClient = createClient('socket-none');

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(gateway.isUserOnline('user-none')).toBe(false);
    });

    it('should disconnect client if jwt verification fails', async () => {
      const mockClient = createClient('socket-invalid', {
        handshake: { auth: { token: 'invalid-token' }, headers: {}, query: {} },
      });

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('multi-socket & reconnection lifecycle', () => {
    it('should support multiple sockets for one user and fan out messages to all tabs', async () => {
      const tab1 = createClient('socket-tab-1', {
        handshake: { auth: { token: 't1' }, headers: {}, query: {} },
      });
      const tab2 = createClient('socket-tab-2', {
        handshake: { auth: { token: 't2' }, headers: {}, query: {} },
      });

      mockJwtService.verify.mockReturnValue({ sub: 'user-multi' });
      await gateway.handleConnection(tab1);
      await gateway.handleConnection(tab2);

      expect(gateway.isUserOnline('user-multi')).toBe(true);
      expect(gateway.getUserSocketCount('user-multi')).toBe(2);

      const emitTab1 = jest.fn();
      const emitTab2 = jest.fn();
      (gateway.server.to as jest.Mock).mockImplementation((socketId: string) => {
        if (socketId === 'socket-tab-1') return { emit: emitTab1 };
        if (socketId === 'socket-tab-2') return { emit: emitTab2 };
        return { emit: jest.fn() };
      });

      const delivered = gateway.emitToUser('user-multi', 'receive_message', { id: 'm1', content: 'hi' });

      expect(delivered).toBe(true);
      expect(emitTab1).toHaveBeenCalledWith('receive_message', { id: 'm1', content: 'hi' });
      expect(emitTab2).toHaveBeenCalledWith('receive_message', { id: 'm1', content: 'hi' });
    });

    it('should keep user online when disconnecting one socket while another remains connected', async () => {
      const tab1 = createClient('socket-tab-1', {
        handshake: { auth: { token: 't1' }, headers: {}, query: {} },
      });
      const tab2 = createClient('socket-tab-2', {
        handshake: { auth: { token: 't2' }, headers: {}, query: {} },
      });

      mockJwtService.verify.mockReturnValue({ sub: 'user-multi' });
      await gateway.handleConnection(tab1);
      await gateway.handleConnection(tab2);

      (gateway.server.emit as jest.Mock).mockClear();
      mockPrismaService.user.update.mockClear();

      // Disconnect first socket only
      await gateway.handleDisconnect(tab1);

      expect(gateway.isUserOnline('user-multi')).toBe(true);
      expect(gateway.getUserSocketCount('user-multi')).toBe(1);
      expect(gateway.server.emit).not.toHaveBeenCalledWith(
        'user_presence',
        expect.objectContaining({ isOnline: false }),
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();

      // Second socket still receives messages
      const emitMock = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: emitMock });
      gateway.emitToUser('user-multi', 'receive_message', { id: 'm2' });
      expect(gateway.server.to).toHaveBeenCalledTimes(1);
      expect(gateway.server.to).toHaveBeenCalledWith('socket-tab-2');
      expect(emitMock).toHaveBeenCalledWith('receive_message', { id: 'm2' });

      // Now disconnect final socket
      await gateway.handleDisconnect(tab2);

      expect(gateway.isUserOnline('user-multi')).toBe(false);
      expect(gateway.getUserSocketCount('user-multi')).toBe(0);
      expect(mockPrismaService.user.update).toHaveBeenCalledTimes(1);
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'user_presence',
        expect.objectContaining({ userId: 'user-multi', isOnline: false }),
      );
    });

    it('should clean up old socket IDs on reconnection and prune stale sockets', async () => {
      const liveSockets = new Map<string, any>();
      gateway.server = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        emit: jest.fn(),
        sockets: { sockets: liveSockets },
      } as any;

      const oldSocket = createClient('socket-old', {
        handshake: { auth: { token: 'tok-old' }, headers: {}, query: {} },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-reconn' });
      liveSockets.set('socket-old', oldSocket);
      await gateway.handleConnection(oldSocket);
      expect(gateway.getUserSocketCount('user-reconn')).toBe(1);

      // Overlapping reconnect before old socket disconnects
      const newSocket = createClient('socket-new', {
        handshake: { auth: { token: 'tok-new' }, headers: {}, query: {} },
      });
      liveSockets.set('socket-new', newSocket);
      await gateway.handleConnection(newSocket);
      expect(gateway.getUserSocketCount('user-reconn')).toBe(2);

      // Old socket disconnects cleanly
      liveSockets.delete('socket-old');
      await gateway.handleDisconnect(oldSocket);

      expect(gateway.isUserOnline('user-reconn')).toBe(true);
      expect(gateway.getUserSocketCount('user-reconn')).toBe(1);

      // Simulate a stale socket left behind without disconnect event: another reconnect prunes it
      liveSockets.delete('socket-new');
      const thirdSocket = createClient('socket-third', {
        handshake: { auth: { token: 'tok-third' }, headers: {}, query: {} },
      });
      liveSockets.set('socket-third', thirdSocket);
      await gateway.handleConnection(thirdSocket);

      expect(gateway.getUserSocketCount('user-reconn')).toBe(1);

      const emitMock = jest.fn();
      (gateway.server.to as jest.Mock).mockReturnValue({ emit: emitMock });
      gateway.emitToUser('user-reconn', 'ping', { ok: true });
      expect(gateway.server.to).toHaveBeenCalledTimes(1);
      expect(gateway.server.to).toHaveBeenCalledWith('socket-third');
    });

    it('should not emit online presence if client disconnects during connection DB update', async () => {
      const slowClient = createClient('socket-race', {
        handshake: { auth: { token: 'tok-race' }, headers: {}, query: {} },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-race' });

      mockPrismaService.user.update.mockImplementation(async () => {
        slowClient.disconnected = true;
        return {};
      });

      await gateway.handleConnection(slowClient);

      expect(gateway.isUserOnline('user-race')).toBe(false);
      expect(gateway.getUserSocketCount('user-race')).toBe(0);
      expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    it('should handle duplicate handleDisconnect calls idempotently', async () => {
      const client = createClient('socket-dup', {
        handshake: { auth: { token: 'tok-dup' }, headers: {}, query: {} },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-dup' });
      await gateway.handleConnection(client);

      (gateway.server.emit as jest.Mock).mockClear();
      await gateway.handleDisconnect(client);
      await gateway.handleDisconnect(client);

      expect(gateway.server.emit).toHaveBeenCalledTimes(1);
      expect(gateway.isUserOnline('user-dup')).toBe(false);
    });
  });

  describe('handleSendMessage, mark_read, typing, heartbeat, check_online', () => {
    it('should call chatService.sendMessage and emit to all receiver sockets', async () => {
      const receiverTab1 = createClient('socket-receiver-1', {
        handshake: { auth: { token: 'recv-token-1' }, headers: {}, query: {} },
      });
      const receiverTab2 = createClient('socket-receiver-2', {
        handshake: { auth: { token: 'recv-token-2' }, headers: {}, query: {} },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'receiver-id' });
      await gateway.handleConnection(receiverTab1);
      await gateway.handleConnection(receiverTab2);

      const senderClient = createClient('socket-sender', {
        data: { user: { sub: 'sender-id' } },
      });

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
      expect(gateway.server.to).toHaveBeenCalledWith('socket-receiver-1');
      expect(gateway.server.to).toHaveBeenCalledWith('socket-receiver-2');
      expect(emitMock).toHaveBeenCalledTimes(2);
      expect(emitMock).toHaveBeenCalledWith('receive_message', emittedMessage);
      expect(ack).toEqual({ event: 'message_sent', data: emittedMessage });
    });

    it('should return structured error event if sendMessage throws an error', async () => {
      const senderClient = createClient('socket-sender', {
        data: { user: { sub: 'sender-id' } },
      });

      mockChatService.sendMessage.mockRejectedValue(
        new Error('You can only message matched profiles.'),
      );

      const ack = await gateway.handleSendMessage(senderClient, {
        receiverId: 'receiver-id',
        content: 'Hello',
      });

      expect(ack).toEqual({
        event: 'error',
        data: {
          code: 'ERROR',
          message: 'You can only message matched profiles.',
        },
      });
    });

    it('should preserve heartbeat across multiple tabs without dropping existing sockets', async () => {
      const tab1 = createClient('socket-hb-1', {
        handshake: { auth: { token: 'hb1' }, headers: {}, query: {} },
      });
      const tab2 = createClient('socket-hb-2', {
        handshake: { auth: { token: 'hb2' }, headers: {}, query: {} },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-hb' });
      await gateway.handleConnection(tab1);
      await gateway.handleConnection(tab2);

      const ack = await gateway.handleHeartbeat(tab1);
      expect(ack.event).toBe('heartbeat_ack');
      expect(ack.data.isOnline).toBe(true);
      expect(gateway.getUserSocketCount('user-hb')).toBe(2);
    });

    it('should report accurate single and batch online status in check_online', async () => {
      const client = createClient('socket-online', {
        handshake: { auth: { token: 'tok' }, headers: {}, query: {} },
      });
      mockJwtService.verify.mockReturnValue({ sub: 'user-online' });
      await gateway.handleConnection(client);

      expect(gateway.handleCheckOnline({ userId: 'user-online' })).toEqual({
        event: 'user_presence',
        data: { userId: 'user-online', isOnline: true },
      });

      expect(
        gateway.handleCheckOnline({ userIds: ['user-online', 'user-offline'] }),
      ).toEqual({
        event: 'batch_presence',
        data: { 'user-online': true, 'user-offline': false },
      });
    });
  });

  describe('react_message', () => {
    it('should return error if unauthenticated', async () => {
      const client = createClient('sock-anon');
      const res = await gateway.handleReactMessage(client, { messageId: 'm1', emoji: '❤️' });
      expect(res).toEqual({ event: 'error', data: 'Unauthorized' });
    });

    it('should toggle reaction and broadcast message_reaction event to participants', async () => {
      const client = createClient('sock-1', { data: { user: { sub: 'user-1' } } });
      jest.spyOn(gateway, 'emitToUser').mockReturnValue(true);

      mockChatService.toggleReaction.mockResolvedValue({
        messageId: 'm1',
        userId: 'user-1',
        emoji: '❤️',
        action: 'ADDED',
        reactions: [{ id: 'r1', userId: 'user-1', emoji: '❤️' }],
        senderId: 'user-1',
        receiverId: 'user-2',
      });

      const res = await gateway.handleReactMessage(client, { messageId: 'm1', emoji: '❤️' });
      expect(res.event).toBe('react_message_ack');
      expect(mockChatService.toggleReaction).toHaveBeenCalledWith('user-1', 'm1', '❤️');
      expect(gateway.emitToUser).toHaveBeenCalledWith('user-1', 'message_reaction', expect.objectContaining({
        messageId: 'm1',
        emoji: '❤️',
        action: 'ADDED',
      }));
      expect(gateway.emitToUser).toHaveBeenCalledWith('user-2', 'message_reaction', expect.objectContaining({
        messageId: 'm1',
        emoji: '❤️',
        action: 'ADDED',
      }));
    });
  });
});
