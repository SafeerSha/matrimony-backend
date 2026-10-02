import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService } from './discovery.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    preference: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscoveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DiscoveryService>(DiscoveryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchProfiles', () => {
    it('should return paginated and sanitized users', async () => {
      const currentUserId = '1';
      const query = new SearchQueryDto();
      
      const users = [
        { id: '2', passwordHash: 'hash', profile: { city: 'NY' } },
        { id: '3', passwordHash: 'hash', profile: { city: 'LA' } },
      ];
      
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(2);

      const result = await service.searchProfiles(query, currentUserId);

      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(prisma.user.count).toHaveBeenCalled();
      expect(result.data.length).toBe(2);
      expect((result.data[0] as any).passwordHash).toBeUndefined(); // ensure sanitization
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('getRecommendations', () => {
    it('should return recommended users based on preference', async () => {
      const currentUserId = '1';
      
      mockPrisma.preference.findUnique.mockResolvedValue({ minAge: 20, maxAge: 30 });
      mockPrisma.user.findMany.mockResolvedValue([{ id: '2', passwordHash: 'hash' }]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.getRecommendations(currentUserId);
      expect(prisma.preference.findUnique).toHaveBeenCalledWith({ where: { userId: currentUserId } });
      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(result.data.length).toBe(1);
    });

    it('should fallback to basic search if no preferences found', async () => {
      mockPrisma.preference.findUnique.mockResolvedValue(null);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.getRecommendations('1');
      expect(result.data).toEqual([]);
    });
  });
});
