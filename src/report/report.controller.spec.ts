import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

jest.unstable_mockModule('@nestjs/throttler', () => ({
  Throttle: () => () => {},
}));

jest.unstable_mockModule('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate = jest.fn(() => true);
  },
}));

const { ReportController } = await import('./report.controller');
const { ReportService } = await import('./report.service');

describe('ReportController', () => {
  let controller: any;
  let guard: RolesGuard;

  const mockReportService = {
    blockUser: jest.fn<any>(),
    unblockUser: jest.fn<any>(),
    getBlockedUsers: jest.fn<any>(),
    createReport: jest.fn<any>(),
    getReportsAdmin: jest.fn<any>(),
    updateReportAdmin: jest.fn<any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportController],
      providers: [
        { provide: ReportService, useValue: mockReportService },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get(ReportController);
    guard = module.get<RolesGuard>(RolesGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should enforce ADMIN role on getReportsAdmin and updateReportAdmin', () => {
    const reflector = new Reflector();
    expect(reflector.get<string[]>(ROLES_KEY, controller.getReportsAdmin)).toEqual(['ADMIN']);
    expect(reflector.get<string[]>(ROLES_KEY, controller.updateReportAdmin)).toEqual(['ADMIN']);

    const makeCtx = (role: string, handler: any): ExecutionContext =>
      ({
        getHandler: () => handler,
        getClass: () => ReportController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u1', role } }),
        }),
      }) as unknown as ExecutionContext;

    expect(() => guard.canActivate(makeCtx('USER', controller.getReportsAdmin))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(makeCtx('ADMIN', controller.getReportsAdmin))).toBe(true);
    expect(() => guard.canActivate(makeCtx('USER', controller.updateReportAdmin))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(makeCtx('ADMIN', controller.updateReportAdmin))).toBe(true);
  });

  it('should delegate controller endpoints to ReportService', async () => {
    mockReportService.blockUser.mockResolvedValue({ success: true });
    mockReportService.unblockUser.mockResolvedValue({ success: true });
    mockReportService.getBlockedUsers.mockResolvedValue([]);
    mockReportService.createReport.mockResolvedValue({ success: true });
    mockReportService.getReportsAdmin.mockResolvedValue({ data: [], meta: { total: 0 } });
    mockReportService.updateReportAdmin.mockResolvedValue({ id: 'r1', status: 'RESOLVED' });

    await controller.blockUser({ id: 'u1' }, 'u2', { reason: 'spam' });
    expect(mockReportService.blockUser).toHaveBeenCalledWith('u1', 'u2', 'spam');

    await controller.unblockUser({ id: 'u1' }, 'u2');
    expect(mockReportService.unblockUser).toHaveBeenCalledWith('u1', 'u2');

    await controller.getBlockedUsers({ id: 'u1' });
    expect(mockReportService.getBlockedUsers).toHaveBeenCalledWith('u1');

    await controller.createReport({ id: 'u1' }, 'u2', { reason: 'spam' });
    expect(mockReportService.createReport).toHaveBeenCalledWith('u1', 'u2', { reason: 'spam' });

    await controller.getReportsAdmin({ status: 'PENDING' });
    expect(mockReportService.getReportsAdmin).toHaveBeenCalledWith({ status: 'PENDING' });

    await controller.updateReportAdmin({ id: 'admin1' }, 'r1', { status: 'RESOLVED' });
    expect(mockReportService.updateReportAdmin).toHaveBeenCalledWith(
      'r1',
      { status: 'RESOLVED' },
      'admin1',
    );
  });
});
