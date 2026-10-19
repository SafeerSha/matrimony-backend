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
      status: 'ACTIVE',
      email: {
        not: {
          endsWith: '@demo.ishtamchat.com',
        },
      },
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

    const profileConditions: any[] = [];

    if (query.religion) {
      profileConditions.push({ religion: { contains: query.religion, mode: 'insensitive' } });
    }

    if (query.city) {
      profileConditions.push({ city: { contains: query.city, mode: 'insensitive' } });
    }

    if (query.maritalStatus) {
      profileConditions.push({ maritalStatus: { equals: query.maritalStatus, mode: 'insensitive' } });
    }

    const rawEducation = (query.education || query.educationLevel || '').trim();
    if (rawEducation) {
      const eduTerms = rawEducation.split(',').map((e) => e.trim()).filter(Boolean);
      if (eduTerms.length === 1) {
        profileConditions.push({
          education: { contains: eduTerms[0], mode: 'insensitive' },
        });
      } else if (eduTerms.length > 1) {
        profileConditions.push({
          OR: eduTerms.map((term) => ({
            education: { contains: term, mode: 'insensitive' },
          })),
        });
      }
    }

    const rawOccupation = (query.occupation || query.profession || '').trim();
    if (rawOccupation) {
      const occTerms = rawOccupation.split(',').map((o) => o.trim()).filter(Boolean);
      if (occTerms.length === 1) {
        profileConditions.push({
          occupation: { contains: occTerms[0], mode: 'insensitive' },
        });
      } else if (occTerms.length > 1) {
        profileConditions.push({
          OR: occTerms.map((term) => ({
            occupation: { contains: term, mode: 'insensitive' },
          })),
        });
      }
    }

    const rawEmployment = (query.employmentStatus || '').trim();
    if (rawEmployment) {
      const empTerms = rawEmployment.split(',').map((e) => e.trim()).filter(Boolean);
      if (empTerms.length === 1) {
        profileConditions.push({
          employmentStatus: { equals: empTerms[0], mode: 'insensitive' },
        });
      } else if (empTerms.length > 1) {
        profileConditions.push({
          OR: empTerms.map((term) => ({
            employmentStatus: { equals: term, mode: 'insensitive' },
          })),
        });
      }
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

      profileConditions.push({ dateOfBirth: dobFilter });
    }

    if (profileConditions.length > 0) {
      whereClause.profile = {
        AND: profileConditions,
      };
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

    const sanitizedUsers = users.map((user) => {
      const { passwordHash, ...rest } = user as any;

      const photos = (rest.photos || [])
        .filter((photo: any) => photo.url && !photo.url.includes('pravatar'))
        .map((photo: any) => ({
          id: photo.id,
          url: photo.url,
          isPrimary: photo.isPrimary,
          isVerified: photo.isVerified,
        }));

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
    if (userPref.education) query.education = userPref.education;
    if (userPref.occupations) query.occupation = userPref.occupations;
    if (userPref.employmentStatuses) query.employmentStatus = userPref.employmentStatuses;
    
    query.limit = '10';
    
    return this.searchProfiles(query, currentUserId);
  }
}
