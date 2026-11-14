import { UserThrottlerGuard } from './user-throttler.guard';
import { ExecutionContext, HttpException } from '@nestjs/common';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;
  let mockStorageService: any;
  let mockReflector: any;

  beforeEach(() => {
    mockStorageService = {
      increment: jest.fn().mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    };
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(null),
    };

    guard = new UserThrottlerGuard(
      { throttlers: [{ name: 'default', ttl: 60000, limit: 10 }] } as any,
      mockStorageService,
      mockReflector,
    );
  });

  const createMockContext = (headers: Record<string, any> = {}, body: Record<string, any> = {}) => {
    const req = {
      headers,
      body,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      setHeader: jest.fn(),
      header: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it('tracks by IP and increments storage with ip_ prefix', async () => {
    const context = createMockContext({ 'x-forwarded-for': '203.0.113.195' });
    const props = {
      context,
      limit: 10,
      ttl: 60000,
      throttler: { name: 'default', ttl: 60000, limit: 10 },
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn((ctx, tracker, name) => `${tracker}-${name}`),
    };

    const allowed = await (guard as any).handleRequest(props);
    expect(allowed).toBe(true);
    expect(mockStorageService.increment).toHaveBeenCalledWith(
      'ip_203.0.113.195-default',
      60000,
      10,
      0,
      'default',
    );
  });

  it('tracks both IP and identifier when phone or email is supplied', async () => {
    const context = createMockContext(
      { 'x-forwarded-for': '203.0.113.195' },
      { email: 'User@Example.com' },
    );
    const props = {
      context,
      limit: 10,
      ttl: 60000,
      throttler: { name: 'default', ttl: 60000, limit: 10 },
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn((ctx, tracker, name) => `${tracker}-${name}`),
    };

    const allowed = await (guard as any).handleRequest(props);
    expect(allowed).toBe(true);
    // Should increment IP
    expect(mockStorageService.increment).toHaveBeenCalledWith(
      'ip_203.0.113.195-default',
      60000,
      10,
      0,
      'default',
    );
    // Should also increment normalized identifier
    expect(mockStorageService.increment).toHaveBeenCalledWith(
      'id_user@example.com-default',
      60000,
      10,
      0,
      'default',
    );
  });

  it('throws ThrottlingException when IP limit is breached even with varying bodies', async () => {
    mockStorageService.increment.mockResolvedValueOnce({
      totalHits: 11,
      timeToExpire: 45,
      isBlocked: true,
      timeToBlockExpire: 45000,
    });

    const context = createMockContext(
      { 'x-forwarded-for': '203.0.113.195' },
      { email: 'random-1@attacker.com' },
    );
    const props = {
      context,
      limit: 10,
      ttl: 60000,
      throttler: { name: 'default', ttl: 60000, limit: 10 },
      blockDuration: 0,
      getTracker: jest.fn(),
      generateKey: jest.fn((ctx, tracker, name) => `${tracker}-${name}`),
    };

    await expect((guard as any).handleRequest(props)).rejects.toThrow(HttpException);
  });
});
