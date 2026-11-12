import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

jest.unstable_mockModule('../chat/chat.gateway', () => ({
  ChatGateway: class MockChatGateway {
    isUserOnline = jest.fn(() => false);
  },
}));

const { RmController } = await import('./rm.controller');
const { RmService } = await import('./rm.service');

describe('RmController', () => {
  let controller: any;
  let guard: RolesGuard;

  const mockRmService = {
    getUsers: jest.fn<any>(),
    getUserStats: jest.fn<any>(),
    getUserDetail: jest.fn<any>(),
    getFeedback: jest.fn<any>(),
    getFeedbackStats: jest.fn<any>(),
    updateFeedback: jest.fn<any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RmController],
      providers: [
        { provide: RmService, useValue: mockRmService },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<RmController>(RmController);
    guard = module.get<RolesGuard>(RolesGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined and enforce RM and ADMIN roles', () => {
    expect(controller).toBeDefined();
    const reflector = new Reflector();
    const roles = reflector.get<string[]>(ROLES_KEY, RmController);
    expect(roles).toEqual(['RM', 'ADMIN']);
  });

  it('should block standard USER role and allow RM and ADMIN roles via RolesGuard', () => {
    const makeContext = (role: string): ExecutionContext =>
      ({
        getHandler: () => controller.getUsers,
        getClass: () => RmController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { sub: 'u1', role } }),
        }),
      }) as unknown as ExecutionContext;

    expect(() => guard.canActivate(makeContext('USER'))).toThrow(ForbiddenException);
    expect(guard.canActivate(makeContext('RM'))).toBe(true);
    expect(guard.canActivate(makeContext('ADMIN'))).toBe(true);
  });

  it('should delegate getUsers, getUserStats, and getUserDetail to RmService', async () => {
    mockRmService.getUsers.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    mockRmService.getUserStats.mockResolvedValue({ total: 10 });
    mockRmService.getUserDetail.mockResolvedValue({ id: 'u-1' });

    const query = { category: 'Friendship' as const, page: 1, limit: 20 };
    expect(await controller.getUsers(query)).toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
    expect(mockRmService.getUsers).toHaveBeenCalledWith(query);

    expect(await controller.getUserStats()).toEqual({ total: 10 });
    expect(await controller.getUserDetail('u-1')).toEqual({ id: 'u-1' });
    expect(mockRmService.getUserDetail).toHaveBeenCalledWith('u-1');
  });

  it('should delegate feedback queries and triage updates with reviewer id', async () => {
    mockRmService.getFeedback.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    mockRmService.getFeedbackStats.mockResolvedValue({ total: 3, openCount: 1 });
    mockRmService.updateFeedback.mockResolvedValue({ id: 'fb-1', status: 'RESOLVED' });

    await controller.getFeedback({ type: 'bug', page: 1, limit: 20 });
    expect(mockRmService.getFeedback).toHaveBeenCalledWith({ type: 'bug', page: 1, limit: 20 });

    expect(await controller.getFeedbackStats()).toEqual({ total: 3, openCount: 1 });

    const res = await controller.updateFeedback(
      'fb-1',
      { status: 'RESOLVED', priority: 'HIGH', rmNotes: 'Fixed in release' },
      { sub: 'rm-user-1', role: 'RM' },
    );
    expect(res).toEqual({ id: 'fb-1', status: 'RESOLVED' });
    expect(mockRmService.updateFeedback).toHaveBeenCalledWith(
      'fb-1',
      { status: 'RESOLVED', priority: 'HIGH', rmNotes: 'Fixed in release' },
      'rm-user-1',
    );
  });
});
