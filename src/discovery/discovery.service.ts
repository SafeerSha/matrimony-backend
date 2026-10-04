import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async searchProfiles(query: SearchQueryDto, currentUserId: string) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const whereClause: any = {
      id: { not: currentUserId },
      AND: [
        {
          NOT: {
            receivedConnections: {
              some: { senderId: currentUserId },
            },
          },
        },
        {
          NOT: {
            sentConnections: {
              some: { receiverId: currentUserId },
            },
          },
        }
      ]
    };

    if (query.religion || query.city || query.maritalStatus || query.minAge || query.maxAge) {
      whereClause.profile = {};

      if (query.religion) {
        whereClause.profile.religion = { contains: query.religion };
      }

      if (query.city) {
        whereClause.profile.city = { contains: query.city };
      }

      if (query.maritalStatus) {
        whereClause.profile.maritalStatus = query.maritalStatus;
      }

      if (query.minAge || query.maxAge) {
        const today = new Date();
        const dobFilter: any = {};

        if (query.minAge) {
          const maxDate = new Date(today.getFullYear() - parseInt(query.minAge, 10), today.getMonth(), today.getDate());
          dobFilter.lte = maxDate;
        }

        if (query.maxAge) {
          const minDate = new Date(today.getFullYear() - parseInt(query.maxAge, 10) - 1, today.getMonth(), today.getDate());
          dobFilter.gte = minDate;
        }

        whereClause.profile.dateOfBirth = dobFilter;
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          profile: true,
          photos: {
            where: { isVerified: true },
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.user.count({ where: whereClause })
    ]);

    const EXTERNAL_PHOTO_BASE = 'https://i.pravatar.cc';

    const sanitizedUsers = users.map((user, idx) => {
      const { passwordHash, ...rest } = user as any;

      let photos = (rest.photos || []).map((photo: any) => ({
        id: photo.id,
        url: photo.url,
        isPrimary: photo.isPrimary,
        isVerified: photo.isVerified,
      }));

      if (!photos.length) {
        const seed = (rest.firstName || rest.email || rest.id || `user-${idx}`).toString();
        const avatarUrl = `${EXTERNAL_PHOTO_BASE}/800?u=${encodeURIComponent(seed)}`;
        photos = [
          {
            id: `external-${rest.id || idx}`,
            url: avatarUrl,
            isPrimary: true,
            isVerified: false,
            source: 'external'
          }
        ];
      }

      return {
        ...rest,
        photos,
      };
    });

    return {
      data: sanitizedUsers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getRecommendations(currentUserId: string) {
    const userPref = await this.prisma.preference.findUnique({
      where: { userId: currentUserId }
    });

    if (!userPref) {
      return this.searchProfiles({}, currentUserId);
    }

    const query = new SearchQueryDto();
    if (userPref.minAge) query.minAge = userPref.minAge.toString();
    if (userPref.maxAge) query.maxAge = userPref.maxAge.toString();
    
    query.limit = '10';
    
    return this.searchProfiles(query, currentUserId);
  }
}
