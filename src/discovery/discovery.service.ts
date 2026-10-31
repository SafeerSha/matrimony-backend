import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { calculateCompatibility } from '../common/utils/compatibility.util';

function isFriendshipIntent(profile?: { category?: string | null; profileFor?: string | null; lookingFor?: string | null } | null): boolean {
  if (!profile) return false;
  const cat = (profile.category || '').toLowerCase().trim();
  const pf = (profile.profileFor || '').toLowerCase().trim();
  const lf = (profile.lookingFor || '').toLowerCase().trim();
  return cat.includes('friend') || pf.includes('friend') || lf.includes('friend');
}

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
      NOT: [
        { email: { contains: 'demo.ishtamchat.com' } },
        { id: { in: ['meera', 'ananya'] } },
        {
          receivedConnections: {
            some: { senderId: currentUserId, status: 'BLOCKED' },
          },
        },
        {
          sentConnections: {
            some: { receiverId: currentUserId, status: 'BLOCKED' },
          },
        },
      ],
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

    // Cross-Category Discovery Filter (Marriage, Friendship, Living Together, or All)
    const rawCategory = (query.category || '').trim();
    const isAllCategories = !rawCategory || rawCategory.toLowerCase() === 'all';
    if (!isAllCategories) {
      let searchTerms = [rawCategory];
      const lower = rawCategory.toLowerCase();
      if (lower.includes('living')) {
        searchTerms = ['Living Together', 'living_together', 'Living-together', 'living'];
      } else if (lower.includes('friend')) {
        searchTerms = ['Friendship', 'friendship', 'Friends', 'friend'];
      } else if (lower.includes('marr')) {
        searchTerms = ['Marriage', 'marriage', 'Matrimony', 'matrimony'];
      }

      profileConditions.push({
        OR: [
          ...searchTerms.map((t) => ({ category: { contains: t, mode: 'insensitive' } })),
          ...searchTerms.map((t) => ({ profileFor: { contains: t, mode: 'insensitive' } })),
          ...searchTerms.map((t) => ({ lookingFor: { contains: t, mode: 'insensitive' } })),
        ],
      });
    }

    // Dynamic Matchmaking Filter:
    // If the active category is Friendship (or user registered for friendship and viewing All), show ALL genders by default.
    // If active category is Marriage or Living Together, enforce opposite gender by default.
    let targetGender = query.gender;
    if (currentUserId) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          profile: {
            select: {
              gender: true,
              category: true,
              profileFor: true,
              lookingFor: true,
            },
          },
        },
      });
      const userGender = (currentUser?.profile?.gender || '').toLowerCase().trim();
      const userRegisteredFriendship = isFriendshipIntent(currentUser?.profile);
      const isExploringFriendship = rawCategory.toLowerCase().includes('friend');
      const shouldShowAllGenders = isExploringFriendship || (userRegisteredFriendship && isAllCategories);

      if (!shouldShowAllGenders) {
        // Enforce opposite gender by default (unless client explicitly specified a gender other than any)
        if (!query.gender || query.gender.toLowerCase() === 'any') {
          if (userGender === 'male' || userGender === 'man') {
            targetGender = 'women';
          } else if (userGender === 'female' || userGender === 'woman') {
            targetGender = 'men';
          }
        }
      } else {
        // Friendship mode: see ALL genders by default
        if (!query.gender || query.gender.toLowerCase() === 'any') {
          targetGender = undefined;
        }
      }
    }

    if (targetGender && targetGender !== 'any') {
      const g = targetGender.toLowerCase();
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
          gender: { equals: targetGender, mode: 'insensitive' }
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

    const [users, total, currentUser] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          profile: true,
          photos: {
            orderBy: { createdAt: 'desc' }
          },
          receivedConnections: {
            where: { senderId: currentUserId },
            select: { status: true, id: true }
          },
          sentConnections: {
            where: { receiverId: currentUserId },
            select: { status: true, id: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.user.count({ where: whereClause }),
      currentUserId
        ? this.prisma.user.findUnique({
            where: { id: currentUserId },
            include: { profile: true, preference: true },
          })
        : Promise.resolve(null),
    ]);

    const sanitizedUsers = users.map((user) => {
      const { passwordHash, receivedConnections, sentConnections, ...rest } = user as any;

      const photos = (rest.photos || [])
        .filter((photo: any) => photo.url && !photo.url.includes('pravatar') && !photo.url.includes('unsplash'))
        .map((photo: any) => ({
          id: photo.id,
          url: photo.url,
          isPrimary: photo.isPrimary,
          isVerified: photo.isVerified,
        }));

      let connectionStatus: 'SENT' | 'RECEIVED' | 'MATCHED' | 'SHORTLISTED' | 'REJECTED' | null = null;
      const sentByMe = receivedConnections?.[0];
      const sentToMe = sentConnections?.[0];

      if (sentByMe) {
        if (sentByMe.status === 'ACCEPTED') connectionStatus = 'MATCHED';
        else if (sentByMe.status === 'SHORTLISTED') connectionStatus = 'SHORTLISTED';
        else if (sentByMe.status === 'PENDING') connectionStatus = 'SENT';
        else if (sentByMe.status === 'REJECTED') connectionStatus = 'REJECTED';
      } else if (sentToMe) {
        if (sentToMe.status === 'ACCEPTED') connectionStatus = 'MATCHED';
        else if (sentToMe.status === 'PENDING') connectionStatus = 'RECEIVED';
        else if (sentToMe.status === 'REJECTED') connectionStatus = 'REJECTED';
      }

      const FIVE_MINUTES_MS = 5 * 60 * 1000;
      const lastActive = rest.lastActiveAt ? new Date(rest.lastActiveAt) : null;
      const isOnline = lastActive
        ? Date.now() - lastActive.getTime() <= FIVE_MINUTES_MS
        : false;

      const cleanProfile = rest.profile ? { ...rest.profile } : null;
      if (cleanProfile) {
        delete cleanProfile.permanentAddress;
      }
      delete rest.phone;
      delete rest.email;

      const compatibility = currentUser ? calculateCompatibility(currentUser, user) : 85;

      return {
        ...rest,
        profile: cleanProfile,
        photos,
        compatibility,
        connectionStatus,
        isOnline,
        lastActiveAt: rest.lastActiveAt || null,
        isInterestSent: connectionStatus === 'SENT' || connectionStatus === 'MATCHED',
        isInterestReceived: connectionStatus === 'RECEIVED',
        isMatched: connectionStatus === 'MATCHED',
        isShortlisted: connectionStatus === 'SHORTLISTED',
        isPassed: connectionStatus === 'REJECTED',
      };
    });

    // Prioritize fresh/uncontacted profiles at the top, then contacted profiles
    sanitizedUsers.sort((a, b) => {
      const isInteractedA = Boolean(
        a.isInterestSent ||
        a.isInterestReceived ||
        a.isPassed ||
        a.connectionStatus === 'SENT' ||
        a.connectionStatus === 'RECEIVED' ||
        a.connectionStatus === 'MATCHED'
      );
      const isInteractedB = Boolean(
        b.isInterestSent ||
        b.isInterestReceived ||
        b.isPassed ||
        b.connectionStatus === 'SENT' ||
        b.connectionStatus === 'RECEIVED' ||
        b.connectionStatus === 'MATCHED'
      );

      if (!isInteractedA && isInteractedB) return -1;
      if (isInteractedA && !isInteractedB) return 1;

      if (query.sortBy === 'recent') {
        const timeA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const timeB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        return timeB - timeA;
      }

      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
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

    const isFriendship = isFriendshipIntent(user.profile);

    if (profilePrefs.gender && profilePrefs.gender !== 'any') {
      query.gender = profilePrefs.gender;
    } else if (isFriendship) {
      // Friendship users see all genders in recommendations
      query.gender = 'any';
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
