import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('RevenueController', () => {
  let controller: RevenueController;
  let revenueService: RevenueService;

  const mockRevenueService = {
    getOverview: jest.fn() as any,
    getTimeSeries: jest.fn() as any,
    getRevenueByPlan: jest.fn() as any,
    getRevenueByMethod: jest.fn() as any,
    getTransactions: jest.fn() as any,
    exportCsv: jest.fn() as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RevenueController],
      providers: [
        { provide: RevenueService, useValue: mockRevenueService },
      ],
    }).compile();

    controller = module.get<RevenueController>(RevenueController);
    revenueService = module.get<RevenueService>(RevenueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined and enforce ADMIN role metadata', () => {
    expect(controller).toBeDefined();

    const reflector = new Reflector();
    const roles = reflector.get<string[]>(ROLES_KEY, RevenueController);
    expect(roles).toEqual(['ADMIN']);
  });

  it('should delegate overview to service', async () => {
    mockRevenueService.getOverview.mockResolvedValueOnce({ grossRevenue: { current: 1000 } });
    const res = await controller.getOverview({ preset: '30d' });
    expect(revenueService.getOverview).toHaveBeenCalledWith({ preset: '30d' });
    expect(res).toEqual({ grossRevenue: { current: 1000 } });
  });

  it('should delegate timeseries to service', async () => {
    mockRevenueService.getTimeSeries.mockResolvedValueOnce({ points: [] });
    const res = await controller.getTimeSeries({ preset: '7d', bucket: 'day' });
    expect(revenueService.getTimeSeries).toHaveBeenCalledWith({ preset: '7d', bucket: 'day' });
    expect(res).toEqual({ points: [] });
  });

  it('should delegate by-plan and by-method breakdowns to service', async () => {
    mockRevenueService.getRevenueByPlan.mockResolvedValueOnce({ plans: [] });
    mockRevenueService.getRevenueByMethod.mockResolvedValueOnce({ methods: [] });

    await controller.getRevenueByPlan({ preset: '30d' });
    expect(revenueService.getRevenueByPlan).toHaveBeenCalledWith({ preset: '30d' });

    await controller.getRevenueByMethod({ preset: '30d' });
    expect(revenueService.getRevenueByMethod).toHaveBeenCalledWith({ preset: '30d' });
  });

  it('should delegate transactions to service', async () => {
    mockRevenueService.getTransactions.mockResolvedValueOnce({ items: [], pagination: {} });
    await controller.getTransactions({ page: 1, limit: 20 });
    expect(revenueService.getTransactions).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('should delegate exportCsv and set attachment header', async () => {
    mockRevenueService.exportCsv.mockResolvedValueOnce('CSV,DATA\n1,2');
    const mockRes: any = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await controller.exportCsv({}, mockRes);
    expect(revenueService.exportCsv).toHaveBeenCalledWith({});
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename="ishtamchat-revenue-'),
    );
    expect(mockRes.send).toHaveBeenCalledWith('CSV,DATA\n1,2');
  });
});

