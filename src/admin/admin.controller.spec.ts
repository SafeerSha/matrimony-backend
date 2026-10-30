import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: AdminService;
  let analyticsService: AnalyticsService;

  const mockAdminService = {
    getUsers: jest.fn(),
    getStats: jest.fn(),
    banUser: jest.fn(),
    verifyPhoto: jest.fn(),
  };

  const mockAnalyticsService = {
    getOverview: jest.fn(),
    getTimeSeries: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get<AdminService>(AdminService);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined and enforce ADMIN role metadata', () => {
    expect(controller).toBeDefined();

    const reflector = new Reflector();
    const roles = reflector.get<string[]>(ROLES_KEY, AdminController);
    expect(roles).toEqual(['ADMIN']);
  });

  it('should delegate getAnalyticsOverview to analyticsService.getOverview', async () => {
    const mockOverview = {
      range: { preset: '30d' },
      metrics: {},
      timeseries: {},
      lastUpdated: new Date().toISOString(),
    };
    (mockAnalyticsService.getOverview as any).mockResolvedValue(mockOverview);

    const query = { preset: '30d' as const };
    const user = { sub: 'admin-1', role: 'ADMIN' };
    const result = await controller.getAnalyticsOverview(query, user);

    expect(result).toBe(mockOverview);
    expect(mockAnalyticsService.getOverview).toHaveBeenCalledWith(query, 'ADMIN');
  });

  it('should delegate getAnalyticsTimeSeries to analyticsService.getTimeSeries', async () => {
    const mockSeries = {
      metric: 'active_users',
      range: {},
      points: [{ date: '2026-10-01', value: 10 }],
    };
    (mockAnalyticsService.getTimeSeries as any).mockResolvedValue(mockSeries);

    const query = { metric: 'active_users' as const, preset: '7d' as const };
    const result = await controller.getAnalyticsTimeSeries(query);

    expect(result).toBe(mockSeries);
    expect(mockAnalyticsService.getTimeSeries).toHaveBeenCalledWith(query);
  });
});
