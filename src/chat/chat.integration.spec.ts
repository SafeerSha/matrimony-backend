import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

jest.unstable_mockModule('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    verify = jest.fn();
  },
}));

const { JwtService } = await import('@nestjs/jwt');
const { ChatController } = await import('./chat.controller');
const { ChatService } = await import('./chat.service');
const { ChatGateway } = await import('./chat.gateway');
const { PrismaService } = await import('../prisma/prisma.service');
const { NotificationsService } = await import('../notifications/notifications.service');
const { SubscriptionService } = await import('../subscription/subscription.service');
const { JwtAuthGuard } = await import('../auth/guards/jwt-auth.guard');
const { SubscriptionPermitGuard } = await import('../subscription/guards/subscription-permit.guard');

interface StoredMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function matchesWhere(msg: StoredMessage, where: any): boolean {
  if (!where) return true;
  if (where.id !== undefined) {
    if (typeof where.id === 'string' && msg.id !== where.id) return false;
    if (typeof where.id === 'object') {
      if (where.id.lt !== undefined && !(msg.id < where.id.lt)) return false;
      if (where.id.gt !== undefined && !(msg.id > where.id.gt)) return false;
    }
  }
  if (where.senderId !== undefined && msg.senderId !== where.senderId) return false;
  if (where.receiverId !== undefined && msg.receiverId !== where.receiverId) return false;
  if (where.createdAt !== undefined) {
    const t = msg.createdAt.getTime();
    if (where.createdAt instanceof Date) {
      if (t !== where.createdAt.getTime()) return false;
    } else if (typeof where.createdAt === 'object') {
      if (where.createdAt.lt !== undefined && !(t < where.createdAt.lt.getTime())) return false;
      if (where.createdAt.gt !== undefined && !(t > where.createdAt.gt.getTime())) return false;
    }
  }
  if (Array.isArray(where.OR) && !where.OR.some((clause: any) => matchesWhere(msg, clause))) {
    return false;
  }
  if (Array.isArray(where.AND) && !where.AND.every((clause: any) => matchesWhere(msg, clause))) {
    return false;
  }
  return true;
}

describe('Chat Phase 1 Integration (Controller + Service + Gateway)', () => {
  let app: INestApplication;
  let gateway: InstanceType<typeof ChatGateway>;
  let activeUserId = 'user-1';
  let messagesStore: StoredMessage[] = [];
  let connectionsStore: Array<{ id: string; senderId: string; receiverId: string; status: string }> = [];

  const mockJwtService = {
    verify: jest.fn<any>(),
  };

  const mockNotificationsService = {
    upsertMessageNotification: jest.fn<any>().mockResolvedValue({}),
    markMessageNotificationAsRead: jest.fn<any>().mockResolvedValue({}),
  };

  const mockSubscriptionService = {
    hasActiveChatPermit: jest.fn<any>().mockResolvedValue(true),
  };

  const inMemoryPrisma = {
    user: {
      findUnique: jest.fn<any>(async ({ where }: any) => {
        if (['user-1', 'user-2', 'user-3', 'user-4', 'user-empty', 'user-blocked'].includes(where.id)) {
          return { id: where.id, isBanned: false, firstName: where.id, lastName: 'Member', profile: null };
        }
        return null;
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    profile: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    connection: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        return (
          connectionsStore.find((c) => {
            if (where.status && c.status !== where.status) return false;
            if (Array.isArray(where.OR)) {
              return where.OR.some(
                (cond: any) => cond.senderId === c.senderId && cond.receiverId === c.receiverId,
              );
            }
            return true;
          }) || null
        );
      }),
    },
    message: {
      findFirst: jest.fn<any>(async ({ where }: any) => {
        return messagesStore.find((m) => matchesWhere(m, where)) || null;
      }),
      findMany: jest.fn<any>(async ({ where, orderBy, take }: any) => {
        const filtered = messagesStore.filter((m) => matchesWhere(m, where));
        const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        const sorted = [...filtered].sort((a, b) => {
          for (const ord of orders) {
            if (ord.createdAt) {
              const diff = a.createdAt.getTime() - b.createdAt.getTime();
              if (diff !== 0) return ord.createdAt === 'desc' ? -diff : diff;
            }
            if (ord.id) {
              if (a.id !== b.id) {
                return ord.id === 'desc' ? (b.id < a.id ? -1 : 1) : (a.id < b.id ? -1 : 1);
              }
            }
          }
          return 0;
        });
        return typeof take === 'number' ? sorted.slice(0, take) : sorted;
      }),
      create: jest.fn<any>(async ({ data }: any) => {
        const msg: StoredMessage = {
          id: `msg-created-${messagesStore.length + 1}`,
          senderId: data.senderId,
          receiverId: data.receiverId,
          content: data.content,
          isRead: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        messagesStore.push(msg);
        return msg;
      }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  };

  beforeEach(async () => {
    activeUserId = 'user-1';
    connectionsStore = [
      { id: 'conn-1-2', senderId: 'user-1', receiverId: 'user-2', status: 'ACCEPTED' },
      { id: 'conn-blocked', senderId: 'user-1', receiverId: 'user-blocked', status: 'BLOCKED' },
    ];

    // Seed 250 messages between user-1 and user-2, including identical timestamps at indices 100..104
    const baseMs = Date.UTC(2026, 5, 1, 10, 0, 0);
    messagesStore = Array.from({ length: 250 }, (_, idx) => {
      const i = idx + 1;
      const sameTimestampBucket = i >= 100 && i <= 104 ? 100 : i;
      const ts = new Date(baseMs + sameTimestampBucket * 1000);
      return {
        id: `msg-${String(i).padStart(4, '0')}`,
        senderId: i % 2 === 0 ? 'user-1' : 'user-2',
        receiverId: i % 2 === 0 ? 'user-2' : 'user-1',
        content: `Chat message #${i}`,
        isRead: true,
        createdAt: ts,
        updatedAt: ts,
      };
    });

    // Seed private message in an unrelated conversation (user-3 <-> user-4)
    messagesStore.push({
      id: 'msg-private-3-4',
      senderId: 'user-3',
      receiverId: 'user-4',
      content: 'Private secret message',
      isRead: false,
      createdAt: new Date(baseMs + 50000),
      updatedAt: new Date(baseMs + 50000),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        ChatService,
        ChatGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: inMemoryPrisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: activeUserId, id: activeUserId };
          return true;
        },
      })
      .overrideGuard(SubscriptionPermitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    await app.init();

    gateway = moduleFixture.get(ChatGateway);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      emit: jest.fn(),
    } as any;
  });

  afterEach(async () => {
    gateway?.onModuleDestroy();
    await app?.close();
    jest.clearAllMocks();
  });

  describe('Chat History Pagination HTTP Integration', () => {
    it('should traverse an entire 250-message conversation with default page size 50 without duplicates or gaps', async () => {
      const collectedPages: StoredMessage[][] = [];
      let cursor: string | null = null;
      let pageNum = 0;

      while (true) {
        pageNum++;
        const query = cursor ? `?cursor=${cursor}` : '';
        const res = await request(app.getHttpServer())
          .get(`/api/v1/chat/history/user-2${query}`)
          .expect(200);

        expect(res.body.meta.limit).toBe(50);
        expect(res.body.data).toHaveLength(50);
        expect(res.body.meta.count).toBe(50);

        // Each page must be in ascending chronological order
        for (let i = 1; i < res.body.data.length; i++) {
          const prev = res.body.data[i - 1];
          const curr = res.body.data[i];
          const prevTime = new Date(prev.createdAt).getTime();
          const currTime = new Date(curr.createdAt).getTime();
          expect(prevTime <= currTime).toBe(true);
          if (prevTime === currTime) {
            expect(prev.id < curr.id).toBe(true);
          }
        }

        collectedPages.push(res.body.data);

        if (!res.body.meta.hasMore) {
          expect(res.body.meta.nextCursor).toBeNull();
          break;
        }
        expect(res.body.meta.nextCursor).toBe(res.body.data[0].id);
        cursor = res.body.meta.nextCursor;
        expect(pageNum).toBeLessThan(10);
      }

      expect(pageNum).toBe(5);
      // Reverse page order (older pages + newer pages) to reconstruct full chronological timeline
      const allMessages = collectedPages.reverse().flat();
      expect(allMessages).toHaveLength(250);
      const uniqueIds = new Set(allMessages.map((m) => m.id));
      expect(uniqueIds.size).toBe(250);
      expect(allMessages[0].id).toBe('msg-0001');
      expect(allMessages[249].id).toBe('msg-0250');
    });

    it('should cap limit at maximum 100 on /chat/conversations/:id/messages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/conversations/conv-user-2/messages?limit=250')
        .expect(200);

      expect(res.body.meta.limit).toBe(100);
      expect(res.body.meta.count).toBe(100);
      expect(res.body.meta.hasMore).toBe(true);
      expect(res.body.data).toHaveLength(100);
      expect(res.body.data[0].id).toBe('msg-0151');
      expect(res.body.data[99].id).toBe('msg-0250');
    });

    it('should return empty result and clean metadata for empty conversation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/history/user-empty')
        .expect(200);

      expect(res.body).toEqual({
        data: [],
        meta: {
          limit: 50,
          count: 0,
          hasMore: false,
          nextCursor: null,
          prevCursor: null,
        },
      });
    });

    it('should support forward pagination via direction=after', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/chat/history/user-2?cursor=msg-0220&direction=after&limit=10')
        .expect(200);

      expect(res.body.data).toHaveLength(10);
      expect(res.body.data[0].id).toBe('msg-0221');
      expect(res.body.data[9].id).toBe('msg-0230');
      expect(res.body.meta).toEqual({
        limit: 10,
        count: 10,
        hasMore: true,
        nextCursor: 'msg-0230',
        prevCursor: 'msg-0221',
      });
    });

    it('should reject invalid limit query parameters with 400 Bad Request', async () => {
      await request(app.getHttpServer()).get('/api/v1/chat/history/user-2?limit=0').expect(400);
      await request(app.getHttpServer()).get('/api/v1/chat/history/user-2?limit=-10').expect(400);
      await request(app.getHttpServer()).get('/api/v1/chat/history/user-2?limit=abc').expect(400);
    });

    it('should reject cross-conversation cursor (IDOR protection) with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/chat/history/user-2?cursor=msg-private-3-4')
        .expect(400);
    });

    it('should enforce blocked connection authorization check with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/chat/history/user-blocked')
        .expect(403);
    });
  });

  describe('WebSocket Multi-Tab + ChatService Integration', () => {
    it('should deliver sent message to all connected tabs of receiver and survive partial disconnect', async () => {
      const liveSockets = new Map<string, any>();
      const tab1Emit = jest.fn();
      const tab2Emit = jest.fn();
      gateway.server = {
        to: jest.fn((socketId: string) => {
          if (socketId === 'u2-tab1') return { emit: tab1Emit };
          if (socketId === 'u2-tab2') return { emit: tab2Emit };
          return { emit: jest.fn() };
        }),
        emit: jest.fn(),
        sockets: { sockets: liveSockets },
      } as any;

      const u1Client: any = {
        id: 'u1-tab1',
        handshake: { auth: { token: 'u1-tok' }, headers: {}, query: {} },
        data: {},
        disconnect: jest.fn(),
      };
      const u2Tab1: any = {
        id: 'u2-tab1',
        handshake: { auth: { token: 'u2-tok1' }, headers: {}, query: {} },
        data: {},
        disconnect: jest.fn(),
      };
      const u2Tab2: any = {
        id: 'u2-tab2',
        handshake: { auth: { token: 'u2-tok2' }, headers: {}, query: {} },
        data: {},
        disconnect: jest.fn(),
      };

      mockJwtService.verify.mockImplementation((tok: string) => {
        if (tok === 'u1-tok') return { sub: 'user-1' };
        return { sub: 'user-2' };
      });

      liveSockets.set('u1-tab1', u1Client);
      liveSockets.set('u2-tab1', u2Tab1);
      liveSockets.set('u2-tab2', u2Tab2);

      await gateway.handleConnection(u1Client);
      await gateway.handleConnection(u2Tab1);
      await gateway.handleConnection(u2Tab2);

      // Send message through real ChatService -> should deliver to both tabs of user-2
      const sentAck = await gateway.handleSendMessage(u1Client, {
        receiverId: 'user-2',
        content: 'Hello across tabs!',
      });
      expect(sentAck.event).toBe('message_sent');
      expect(tab1Emit).toHaveBeenCalledWith(
        'receive_message',
        expect.objectContaining({ content: 'Hello across tabs!' }),
      );
      expect(tab2Emit).toHaveBeenCalledWith(
        'receive_message',
        expect.objectContaining({ content: 'Hello across tabs!' }),
      );

      // Disconnect one tab of user-2; user-2 remains online on u2-tab2
      liveSockets.delete('u2-tab1');
      await gateway.handleDisconnect(u2Tab1);
      expect(gateway.isUserOnline('user-2')).toBe(true);

      tab1Emit.mockClear();
      tab2Emit.mockClear();

      await gateway.handleSendMessage(u1Client, {
        receiverId: 'user-2',
        content: 'Second message',
      });
      expect(tab1Emit).not.toHaveBeenCalled();
      expect(tab2Emit).toHaveBeenCalledWith(
        'receive_message',
        expect.objectContaining({ content: 'Second message' }),
      );

      // Disconnect remaining tab -> user-2 goes offline cleanly
      liveSockets.delete('u2-tab2');
      await gateway.handleDisconnect(u2Tab2);
      expect(gateway.isUserOnline('user-2')).toBe(false);
      expect(gateway.getUserSocketCount('user-2')).toBe(0);
    });
  });
});

