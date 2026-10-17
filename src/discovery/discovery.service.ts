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

    if (query.gender && query.gender !== 'any') {
      const g = query.gender.toLowerCase();
      if (g === 'women' || g === 'female') {
        profileConditions.push({
          gender: { in: ['female', 'Female', 'women', 'Women'] }
        });
      } else if (g === 'men' || g === 'male') {
        profileConditions.push({
          gender: { in: ['male', 'Male', 'men', 'Men'] }
        });
      } else {
        profileConditions.push({
          gender: { equals: query.gender, mode: 'insensitive' }
        });
      }
    }

    if (query.caste && query.caste !== 'Any') {
      profileConditions.push({
        caste: { contains: query.caste, mode: 'insensitive' }
      });
    }

    const rawIncome = (query.income || query.annualIncome || '').trim();
    if (rawIncome && rawIncome !== 'Any') {
      profileConditions.push({
        annualIncome: { contains: rawIncome, mode: 'insensitive' }
      });
    }

    if (query.intent && query.intent !== 'Any') {
      profileConditions.push({
        OR: [
          { category: { contains: query.intent, mode: 'insensitive' } },
          { lookingFor: { contains: query.intent, mode: 'insensitive' } }
        ]
      });
    }

    const rawLang = (query.language || query.motherTongue || '').trim();
    if (rawLang && rawLang !== 'Any') {
      profileConditions.push({
        motherTongue: { contains: rawLang, mode: 'insensitive' }
      });
    }

    if (query.diet && query.diet !== "Doesn't Matter" && query.diet !== 'Any') {
      profileConditions.push({
        OR: [
          { lifestyle: { hasSome: [query.diet, query.diet.toLowerCase(), query.diet.toUpperCase()] } },
          { bio: { contains: query.diet, mode: 'insensitive' } }
        ]
      });
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
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      include: {
        profile: true,
        preference: true,
      },
    });

    if (!user) {
      return this.searchProfiles({}, currentUserId);
    }

    const userPref = user.preference;
    const profilePrefs = (user.profile?.preferences || {}) as any;

    const query = new SearchQueryDto();
    const minAge = userPref?.minAge ?? profilePrefs.minAge;
    const maxAge = userPref?.maxAge ?? profilePrefs.maxAge;
    if (minAge) query.minAge = minAge.toString();
    if (maxAge) query.maxAge = maxAge.toString();

    const education = userPref?.education ?? (Array.isArray(profilePrefs.education) ? profilePrefs.education[0] : profilePrefs.education);
    if (education && education !== 'Any qualification' && education !== 'Any') query.education = education;

    const occupation = userPref?.occupations ?? (Array.isArray(profilePrefs.professions) ? profilePrefs.professions[0] : profilePrefs.professions);
    if (occupation && occupation !== 'Any profession' && occupation !== 'Any') query.occupation = occupation;

    const employmentStatus = userPref?.employmentStatuses ?? (Array.isArray(profilePrefs.employmentStatuses) ? profilePrefs.employmentStatuses[0] : profilePrefs.employmentStatuses);
    if (employmentStatus) query.employmentStatus = employmentStatus;

    const religion = userPref?.religions ?? (Array.isArray(profilePrefs.religions) ? profilePrefs.religions[0] : profilePrefs.religions);
    if (religion && religion !== 'Open to all communities' && religion !== 'Any') query.religion = religion;

    const city = userPref?.location ?? (Array.isArray(profilePrefs.locations) ? profilePrefs.locations[0] : profilePrefs.locations);
    if (city && city !== 'Any location' && city !== 'All locations') query.city = city;

    const maritalStatus = userPref?.maritalStatuses ?? (Array.isArray(profilePrefs.maritalStatus) ? profilePrefs.maritalStatus[0] : profilePrefs.maritalStatus);
    if (maritalStatus && maritalStatus !== 'Open to All' && maritalStatus !== 'Any') query.maritalStatus = maritalStatus;

    if (profilePrefs.gender && profilePrefs.gender !== 'any') {
      query.gender = profilePrefs.gender;
    } else if (user.profile?.gender) {
      const g = user.profile.gender.toLowerCase();
      if (g === 'male' || g === 'man') query.gender = 'women';
      else if (g === 'female' || g === 'woman') query.gender = 'men';
    }

    if (profilePrefs.caste && profilePrefs.caste !== 'Any') {
      query.caste = profilePrefs.caste;
    }

    const diet = userPref?.diet ?? (Array.isArray(profilePrefs.diet) ? profilePrefs.diet[0] : profilePrefs.diet);
    if (diet && diet !== "Doesn't Matter" && diet !== 'Any') {
      query.diet = diet;
    }

    query.limit = '10';

    return this.searchProfiles(query, currentUserId);
  }
}
