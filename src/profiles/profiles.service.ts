import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto, transformToStringOrCsv } from './dto/update-preferences.dto';
import { sanitizeStringArray, sanitizeText } from '../common/utils/sanitize.util';
import { calculateCompatibility, calculateCompatibilityWithHighlights } from '../common/utils/compatibility.util';
import { normalizePhoneNumber } from '../common/utils/phone.util';
import { normalizeMarriageLookingFor } from '../common/utils/matrimony-gender.util';

export function calculateAge(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export function parseStringOrArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // Not JSON, split by comma
    }
    return val.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

export function formatPreferencesObject(profilePrefs: any, tablePref: any) {
  const p = profilePrefs || {};
  const t = tablePref || {};

  const rawMinAge = p.minAge !== undefined && p.minAge !== null ? Number(p.minAge) : (t.minAge !== null && t.minAge !== undefined ? Number(t.minAge) : null);
  const minAge = rawMinAge && rawMinAge >= 18 ? rawMinAge : 21;
  const rawMaxAge = p.maxAge !== undefined && p.maxAge !== null ? Number(p.maxAge) : (t.maxAge !== null && t.maxAge !== undefined ? Number(t.maxAge) : null);
  const maxAge = rawMaxAge && rawMaxAge >= minAge ? rawMaxAge : Math.max(minAge + 7, 35);
  const rawMinHeight = p.minHeight !== undefined && p.minHeight !== null ? String(p.minHeight) : (t.minHeight !== null && t.minHeight !== undefined ? String(t.minHeight) : null);
  const minHeight = rawMinHeight && rawMinHeight !== 'null' && rawMinHeight !== 'undefined' ? rawMinHeight : "4'10\"";
  const rawMaxHeight = p.maxHeight !== undefined && p.maxHeight !== null ? String(p.maxHeight) : (t.maxHeight !== null && t.maxHeight !== undefined ? String(t.maxHeight) : null);
  const maxHeight = rawMaxHeight && rawMaxHeight !== 'null' && rawMaxHeight !== 'undefined' ? rawMaxHeight : "6'4\"";

  const maritalStatus = parseStringOrArray(p.maritalStatus || p.maritalStatuses || t.maritalStatuses);
  const religions = parseStringOrArray(p.religions || p.religion || t.religions);
  const locations = parseStringOrArray(p.locations || p.location || t.location);
  const education = parseStringOrArray(p.education || t.education);
  const professions = parseStringOrArray(p.professions || p.occupations || t.occupations);
  const employmentStatuses = parseStringOrArray(p.employmentStatuses || t.employmentStatuses);
  const diet = parseStringOrArray(p.diet || t.diet);

  const gender = p.gender !== undefined && p.gender !== null ? String(p.gender) : null;
  const caste = p.caste !== undefined && p.caste !== null ? String(p.caste) : null;
  const income = p.income !== undefined && p.income !== null ? String(p.income) : (p.minIncome !== undefined && p.minIncome !== null ? String(p.minIncome) : null);
  const intent = p.intent !== undefined && p.intent !== null ? String(p.intent) : (p.partnerIntent !== undefined && p.partnerIntent !== null ? String(p.partnerIntent) : null);
  const rawLanguages = parseStringOrArray(p.languages || p.language);
  const language = rawLanguages.length > 0 ? rawLanguages.join(', ') : (p.language !== undefined && p.language !== null ? String(p.language) : null);
  const languages = rawLanguages.length > 0 ? rawLanguages : (language ? [language] : []);
  const matrimonyCommunity = p.matrimonyCommunity !== undefined && p.matrimonyCommunity !== null ? String(p.matrimonyCommunity) : 'Kerala';

  return {
    minAge,
    maxAge,
    minHeight,
    maxHeight,
    maritalStatus,
    religions,
    locations,
    education,
    professions,
    employmentStatuses,
    diet,
    gender,
    caste,
    income,
    minIncome: income,
    intent,
    partnerIntent: intent,
    language,
    languages,
    matrimonyCommunity,
    openToRelocate: Boolean(p.openToRelocate),
    lifestyleHabits: parseStringOrArray(p.lifestyleHabits),
    aboutPartner: p.aboutPartner ? String(p.aboutPartner) : '',
    ...(p.notificationPreferences ? { notificationPreferences: p.notificationPreferences } : {}),
  };
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preference: true,
        photos: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const sortedPhotos = [...(user.photos || [])].sort((a, b) => {
      if (a.isPrimary === b.isPrimary) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.isPrimary ? -1 : 1;
    });

    const formattedPhotos = sortedPhotos.map((p) => ({
      id: p.id,
      url: p.url,
      isPrimary: p.isPrimary,
      isVerified: p.isVerified,
    }));

    const formattedPreferences = formatPreferencesObject(user.profile?.preferences, user.preference);

    const isVerified = Boolean(
      user.isPhoneVerified ||
      user.isEmailVerified ||
      user.status === 'ACTIVE' ||
      user.photos?.some((p) => p.isVerified),
    );

    const calculatedAge = calculateAge(user.profile?.dateOfBirth);

    return {
      id: user.profile?.id || user.id,
      userId: user.id,
      profileId: user.profileId,
      email: user.email,
      phone: user.phone,
      isPhoneVerified: Boolean(user.isPhoneVerified),
      isEmailVerified: Boolean(user.isEmailVerified),
      firstName: user.firstName || user.profile?.firstName || null,
      lastName: user.lastName || user.profile?.lastName || null,
      status: user.status,
      role: user.role,
      onboardingStep: user.profile?.onboardingStep || 1,
      isVerified,
      gender: user.profile?.gender || null,
      dateOfBirth: user.profile?.dateOfBirth ? user.profile.dateOfBirth.toISOString() : null,
      age: calculatedAge,
      city: user.profile?.city || null,
      state: user.profile?.state || null,
      country: user.profile?.country || null,
      community: user.profile?.community || null,
      lookingIn: user.profile?.lookingIn || null,
      education: user.profile?.education || null,
      occupation: user.profile?.occupation || null,
      employmentStatus: user.profile?.employmentStatus || null,
      annualIncome: user.profile?.annualIncome || null,
      height: user.profile?.height || null,
      maritalStatus: user.profile?.maritalStatus || null,
      religion: user.profile?.religion || null,
      caste: user.profile?.caste || null,
      motherTongue: user.profile?.motherTongue || null,
      profileFor: user.profile?.profileFor || null,
      category: user.profile?.category || 'Marriage',
      bio: user.profile?.bio || null,
      family: user.profile?.family || null,
      fatherName: user.profile?.fatherName || null,
      nationality: user.profile?.nationality || 'Indian',
      permanentAddress: user.profile?.permanentAddress || null,
      workingPlace: user.profile?.workingPlace || null,
      workLocation: user.profile?.workingPlace || null,
      fatherAlive: user.profile?.fatherAlive ?? true,
      motherAlive: user.profile?.motherAlive ?? true,
      brothersCount: user.profile?.brothersCount ?? 0,
      brothersMarried: user.profile?.brothersMarried ?? 0,
      sistersCount: user.profile?.sistersCount ?? 0,
      sistersMarried: user.profile?.sistersMarried ?? 0,
      familyDetails: user.profile?.familyDetails || null,
      lifestyle: user.profile?.lifestyle || [],
      interests: user.profile?.interests || [],
      lookingFor:
        normalizeMarriageLookingFor({
          category: user.profile?.category,
          profileFor: user.profile?.profileFor,
          gender: user.profile?.gender,
          lookingFor: user.profile?.lookingFor,
        }) || null,
      photos: formattedPhotos,
      preferences: formattedPreferences,
      // Backwards-compatibility legacy mappings
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        isPhoneVerified: Boolean(user.isPhoneVerified),
        isEmailVerified: Boolean(user.isEmailVerified),
        status: user.status,
      },
      profile: {
        ...(user.profile || {}),
        profileId: user.profileId,
        status: user.status,
      },
      preference: user.preference || {},
    };
  }

  async getPublicProfile(
    userId: string,
    viewerId?: string,
    options?: { excludeSelf?: boolean },
  ) {
    try {
      const rawId = (userId || '').trim();
      if (!rawId || rawId.length > 64) {
        throw new BadRequestException({
          code: 'INVALID_PROFILE_IDENTIFIER',
          message: 'Please provide a valid profile identifier.',
        });
      }

      const upperRaw = rawId.toUpperCase();
      const imcNormalized = upperRaw.startsWith('IMC-') || upperRaw.startsWith('LT-')
        ? upperRaw
        : `IMC-${upperRaw}`;

      if (options?.excludeSelf) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
        const isMemberId = /^(?:IMC|LT)-[A-Z0-9]{6}$/i.test(imcNormalized) || /^[A-Z0-9]{6}$/i.test(rawId);
        if (!isUuid && !isMemberId) {
          throw new BadRequestException({
            code: 'INVALID_MEMBER_ID_FORMAT',
            message: 'Please enter a valid 6-character Member ID (e.g. IMC-A00025).',
          });
        }
      }

      const blockedFilter = viewerId
        ? [
            {
              receivedConnections: {
                some: { senderId: viewerId, status: 'BLOCKED' },
              },
            },
            {
              sentConnections: {
                some: { receiverId: viewerId, status: 'BLOCKED' },
              },
            },
          ]
        : [];

      const activePublicUserWhere: any = {
        isBanned: false,
        status: 'ACTIVE',
        deletedAt: null,
        deactivatedAt: null,
        role: 'USER',
        NOT: [
          { email: { contains: 'demo.ishtamchat.com' } },
          { id: { in: ['meera', 'ananya'] } },
          ...blockedFilter,
        ],
      };

      const [profile, viewer] = await Promise.all([
        this.prisma.profile.findFirst({
          where: {
            OR: [
              { id: rawId },
              { userId: rawId },
              { user: { profileId: rawId } },
              { user: { profileId: imcNormalized } },
              { user: { profileId: { equals: rawId, mode: 'insensitive' } } },
              { user: { profileId: { equals: imcNormalized, mode: 'insensitive' } } },
            ],
            user: activePublicUserWhere,
          },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileId: true,
                phone: true,
                status: true,
                lastActiveAt: true,
                isPhoneVerified: true,
                preference: true,
                photos: {
                  orderBy: [
                    { isPrimary: 'desc' },
                    { isVerified: 'desc' },
                    { createdAt: 'desc' },
                  ],
                },
              },
            },
          },
        }),
        viewerId
          ? this.prisma.user.findUnique({
              where: { id: viewerId },
              include: { profile: true, preference: true },
            }).catch((err) => {
              this.logger.warn(`Failed to fetch viewer for profile view: ${err?.message}`);
              return null;
            })
          : Promise.resolve(null),
      ]);

      if (options?.excludeSelf && viewerId) {
        const viewerProfileId = viewer?.profileId?.toUpperCase();
        const viewerProfileRowId = viewer?.profile?.id;
        const matchesSelf =
          profile?.userId === viewerId ||
          rawId.toLowerCase() === viewerId.toLowerCase() ||
          (viewerProfileRowId && rawId.toLowerCase() === viewerProfileRowId.toLowerCase()) ||
          (viewerProfileId &&
            (upperRaw === viewerProfileId || imcNormalized === viewerProfileId));

        if (matchesSelf) {
          throw new BadRequestException({
            code: 'SELF_PROFILE_SEARCH',
            message: 'You cannot search for your own Member ID.',
          });
        }
      }

      if (
        !profile ||
        !profile.user ||
        (profile.user.status !== undefined && profile.user.status !== 'ACTIVE') ||
        (profile.user as any).isBanned === true ||
        Boolean((profile.user as any).deletedAt) ||
        Boolean((profile.user as any).deactivatedAt)
      ) {
        throw new NotFoundException('Profile not found');
      }

      const calculatedAge = calculateAge(profile.dateOfBirth);
      const lastActive = (profile.user as any)?.lastActiveAt
        ? new Date((profile.user as any).lastActiveAt)
        : null;
      const isOnline = lastActive
        ? Date.now() - lastActive.getTime() <= 5 * 60 * 1000
        : false;

      let compatibility = 85;
      let compatibilityHighlights: any[] = [];
      try {
        const compatibilityResult = calculateCompatibilityWithHighlights(viewer, profile);
        compatibility = compatibilityResult.score;
        compatibilityHighlights = compatibilityResult.highlights;
      } catch (e: any) {
        this.logger.warn(`Failed to calculate compatibility: ${e?.message}`);
      }

      let formattedPreferences: any = null;
      try {
        formattedPreferences = formatPreferencesObject(profile.preferences, (profile.user as any)?.preference);
      } catch (e: any) {
        this.logger.warn(`Failed to format preferences: ${e?.message}`);
        formattedPreferences = profile.preferences || {};
      }

      let connectionStatus: 'SENT' | 'RECEIVED' | 'MATCHED' | 'SHORTLISTED' | 'REJECTED' | null = null;
      let isMatched = false;
      let isInterestSent = false;
      let isInterestReceived = false;
      let isShortlisted = false;
      let isDeclined = false;
      let isDeclinedByThem = false;
      let isDeclinedByMe = false;

      if (viewerId && profile.userId && viewerId !== profile.userId) {
        // Record profile visit asynchronously without delaying profile payload
        this.recordProfileVisit(viewerId, profile.userId).catch((err) => {
          this.logger.warn(`Failed to record profile visit: ${err?.message}`);
        });

        let connection: any = null;
        try {
          connection = await this.prisma.connection.findFirst({
            where: {
              OR: [
                { senderId: viewerId, receiverId: profile.userId },
                { senderId: profile.userId, receiverId: viewerId },
              ],
            },
          });
        } catch (e: any) {
          this.logger.warn(`Failed to fetch connection status: ${e?.message}`);
        }

        let hasMessages: any = null;
        try {
          hasMessages = !connection || connection.status !== 'ACCEPTED'
            ? await this.prisma.message.findFirst({
                where: {
                  OR: [
                    { senderId: viewerId, receiverId: profile.userId },
                    { senderId: profile.userId, receiverId: viewerId },
                  ],
                },
                select: { id: true },
              })
            : null;
        } catch (e: any) {
          this.logger.warn(`Failed to fetch message existence: ${e?.message}`);
        }

        if (connection) {
          if (connection.status === 'ACCEPTED' || hasMessages) {
            connectionStatus = 'MATCHED';
            isMatched = true;
            isInterestSent = false;
          } else if (connection.senderId === viewerId) {
            if (connection.status === 'PENDING') {
              connectionStatus = 'SENT';
              isInterestSent = true;
            } else if (connection.status === 'SHORTLISTED') {
              connectionStatus = 'SHORTLISTED';
              isShortlisted = true;
            } else if (connection.status === 'REJECTED') {
              connectionStatus = 'REJECTED';
              isDeclined = true;
              isDeclinedByThem = true;
            }
          } else {
            if (connection.status === 'PENDING') {
              connectionStatus = 'RECEIVED';
              isInterestReceived = true;
            } else if (connection.status === 'REJECTED') {
              connectionStatus = 'REJECTED';
              isDeclined = true;
              isDeclinedByMe = true;
            }
          }
        } else if (hasMessages) {
          connectionStatus = 'MATCHED';
          isMatched = true;
          isInterestSent = false;
        }

        try {
          const viewerProfile = await this.prisma.profile.findUnique({
            where: { userId: viewerId },
            select: { preferences: true },
          });
          const viewerFavorites: string[] = Array.isArray((viewerProfile?.preferences as any)?.favoriteIds)
            ? (viewerProfile?.preferences as any).favoriteIds
            : [];
          if (viewerFavorites.includes(profile.userId)) {
            isShortlisted = true;
          }
        } catch (e: any) {
          this.logger.warn(`Failed to check viewer favorites: ${e?.message}`);
        }
      }

      const isSelf = Boolean(viewerId && viewerId === profile.userId);
      let isContactUnlocked = isSelf;

      if (viewerId && !isSelf) {
        try {
          if ((this.prisma as any).contactUnlock?.findUnique) {
            const unlock = await this.prisma.contactUnlock.findUnique({
              where: {
                userId_targetUserId: {
                  userId: viewerId,
                  targetUserId: profile.userId,
                },
              },
            });
            if (unlock) {
              isContactUnlocked = true;
            }
          } else {
            const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM "ContactUnlock"
              WHERE "userId" = ${viewerId} AND "targetUserId" = ${profile.userId}
              LIMIT 1;
            `;
            if (rows && rows.length > 0) {
              isContactUnlocked = true;
            }
          }
        } catch (e: any) {
          try {
            const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM "ContactUnlock"
              WHERE "userId" = ${viewerId} AND "targetUserId" = ${profile.userId}
              LIMIT 1;
            `;
            if (rows && rows.length > 0) {
              isContactUnlocked = true;
            }
          } catch (sqlErr: any) {
            this.logger.warn(`Failed to query contact unlock record: ${sqlErr?.message || e?.message}`);
          }
        }
      }

      const sanitizedProfile: any = { ...profile };
      // PRIVACY ENFORCEMENT: Permanent Address, phone number, and email must be hidden unless unlocked or self
      if (!isSelf) {
        delete sanitizedProfile.permanentAddress;
        if (sanitizedProfile.user) {
          sanitizedProfile.user = {
            ...sanitizedProfile.user,
            phone: isContactUnlocked ? profile.user?.phone : undefined,
            email: undefined,
          };
        }
      }

      const resolvedUserId = profile.userId || (profile.user as any)?.id;
      const resolvedFirstName = sanitizedProfile.firstName || profile.user?.firstName || null;
      const resolvedLastName = sanitizedProfile.lastName || profile.user?.lastName || null;
      const resolvedFullName =
        `${resolvedFirstName || ''} ${resolvedLastName || ''}`.trim() || 'Member';

      const normalizedPublicLookingFor =
        normalizeMarriageLookingFor({
          category: sanitizedProfile.category,
          profileFor: sanitizedProfile.profileFor,
          gender: sanitizedProfile.gender,
          lookingFor: sanitizedProfile.lookingFor,
        }) ?? sanitizedProfile.lookingFor;

      return {
        ...sanitizedProfile,
        lookingFor: normalizedPublicLookingFor,
        id: resolvedUserId,
        userId: resolvedUserId,
        profileTableId: profile.id,
        profileId: profile.user?.profileId || (profile as any).profileId,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        name: resolvedFullName,
        age: calculatedAge,
        compatibility,
        compatibilityHighlights,
        preferences: formattedPreferences,
        isOnline,
        lastActiveAt: lastActive ? lastActive.toISOString() : null,
        photos: profile.user?.photos || [],
        connectionStatus,
        isMatched,
        isInterestSent,
        isInterestReceived,
        isShortlisted,
        isDeclined,
        isDeclinedByThem,
        isDeclinedByMe,
        isContactUnlocked,
        hasPhone: Boolean(profile.user?.phone),
        phone: isContactUnlocked ? profile.user?.phone : undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get public profile for userId=${userId}, viewerId=${viewerId}: ${error?.message}`,
        error?.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to fetch profile: ${error?.message || error}`,
      );
    }
  }

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const {
      dateOfBirth,
      firstName,
      lastName,
      email,
      emailOtp,
      phone,
      phoneOtp,
      education,
      occupation,
      profession,
      employmentStatus,
      annualIncome,
      income,
      bio,
      about,
      family,
      fatherName,
      nationality,
      permanentAddress,
      workingPlace,
      workLocation,
      fatherAlive,
      motherAlive,
      brothersCount,
      brothersMarried,
      sistersCount,
      sistersMarried,
      familyDetails,
      lookingFor,
      city,
      state,
      country,
      community,
      lookingIn,
      religion,
      caste,
      maritalStatus,
      profileFor,
      category,
      gender,
      height,
      motherTongue,
      lifestyle,
      interests,
      friendshipGoals,
      genderPreference,
      nakshatra,
      star,
      habits,
      ...rawRest
    } = data;

    const userUpdateData: any = {};
    if (firstName !== undefined) userUpdateData.firstName = sanitizeText(firstName, 50);
    if (lastName !== undefined) userUpdateData.lastName = sanitizeText(lastName, 50);

    if (email !== undefined) {
      const normalizedEmail = email ? email.trim().toLowerCase() : null;
      if (normalizedEmail) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });

        if (currentUser && currentUser.email !== normalizedEmail) {
          const existing = await this.prisma.user.findFirst({
            where: {
              email: normalizedEmail,
              id: { not: userId },
            },
          });
          if (existing) {
            throw new ConflictException('This email address is already associated with another account.');
          }

          if (!emailOtp) {
            throw new BadRequestException('A 6-digit verification code is required to change your email address.');
          }

          await this.verifyEmailOtp(normalizedEmail, emailOtp);
          userUpdateData.email = normalizedEmail;
          userUpdateData.isEmailVerified = true;
        }
      }
    }

    if (phone !== undefined) {
      const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
      if (phone && !normalizedPhone) {
        throw new BadRequestException('Please enter a valid 10-digit mobile number.');
      }
      if (normalizedPhone) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { phone: true },
        });

        if (currentUser && currentUser.phone !== normalizedPhone) {
          const existing = await this.prisma.user.findFirst({
            where: {
              phone: normalizedPhone,
              id: { not: userId },
            },
          });
          if (existing) {
            throw new ConflictException('This mobile number is already associated with another account.');
          }

          if (!phoneOtp) {
            throw new BadRequestException('A 6-digit verification code is required to change your mobile number.');
          }

          await this.verifyPhoneOtp(normalizedPhone, phoneOtp);
          userUpdateData.phone = normalizedPhone;
          userUpdateData.isPhoneVerified = true;
        }
      }
    }

    if (Object.keys(userUpdateData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdateData,
      });
    }

    // Mass assignment protection: remove any privileged fields
    const rest = { ...rawRest };
    const forbiddenFields = [
      'id',
      'userId',
      'role',
      'status',
      'phone',
      'isPhoneVerified',
      'isEmailVerified',
      'isBanned',
      'emailOtp',
      'phoneOtp',
      'createdAt',
      'updatedAt',
    ];
    forbiddenFields.forEach((field) => delete (rest as any)[field]);

    const dob = dateOfBirth ? new Date(dateOfBirth) : undefined;
    const effectiveBio = sanitizeText(bio ?? about, 1500);
    const effectiveOccupation = sanitizeText(occupation ?? profession, 255);
    const effectiveWorkingPlace = sanitizeText(workingPlace ?? workLocation, 255);
    const effectiveLifestyle = lifestyle !== undefined ? sanitizeStringArray(lifestyle, 20, 100) : undefined;
    const effectiveInterests = interests !== undefined ? sanitizeStringArray(interests, 20, 100) : undefined;

    const existingProfileForNormalize =
      gender !== undefined || lookingFor !== undefined || category !== undefined || profileFor !== undefined
        ? await this.prisma.profile.findUnique({
            where: { userId },
            select: { gender: true, lookingFor: true, category: true, profileFor: true },
          })
        : null;

    const resolvedCategory = category !== undefined ? category : existingProfileForNormalize?.category;
    const resolvedProfileFor = profileFor !== undefined ? profileFor : existingProfileForNormalize?.profileFor;
    const resolvedGender = gender !== undefined ? gender : existingProfileForNormalize?.gender;
    const rawLookingForCandidate = lookingFor !== undefined ? lookingFor : existingProfileForNormalize?.lookingFor;
    const normalizedUpdateLookingFor =
      existingProfileForNormalize !== null
        ? normalizeMarriageLookingFor({
            category: resolvedCategory,
            profileFor: resolvedProfileFor,
            gender: resolvedGender,
            lookingFor: rawLookingForCandidate,
          })
        : lookingFor;

    const shouldPersistNormalizedLookingFor =
      lookingFor !== undefined ||
      (normalizedUpdateLookingFor !== undefined &&
        normalizedUpdateLookingFor !== existingProfileForNormalize?.lookingFor);

    const profileData: any = {
      ...rest,
      ...(firstName !== undefined ? { firstName: sanitizeText(firstName, 50) } : {}),
      ...(lastName !== undefined ? { lastName: sanitizeText(lastName, 50) } : {}),
      ...(dob ? { dateOfBirth: dob } : {}),
      ...(education !== undefined ? { education: sanitizeText(education, 255) ?? null } : {}),
      ...(occupation !== undefined || profession !== undefined ? { occupation: effectiveOccupation ?? null } : {}),
      ...(employmentStatus !== undefined ? { employmentStatus: sanitizeText(employmentStatus, 100) ?? null } : {}),
      ...(annualIncome !== undefined || income !== undefined ? { annualIncome: sanitizeText(annualIncome ?? income, 100) ?? null } : {}),
      ...(effectiveBio !== undefined ? { bio: effectiveBio ?? null } : {}),
      ...(family !== undefined ? { family: sanitizeText(family, 1500) ?? null } : {}),
      ...(fatherName !== undefined ? { fatherName: sanitizeText(fatherName, 100) ?? null } : {}),
      ...(nationality !== undefined ? { nationality: sanitizeText(nationality, 100) ?? null } : {}),
      ...(permanentAddress !== undefined ? { permanentAddress: sanitizeText(permanentAddress, 500) ?? null } : {}),
      ...(workingPlace !== undefined || workLocation !== undefined ? { workingPlace: effectiveWorkingPlace ?? null } : {}),
      ...(fatherAlive !== undefined ? { fatherAlive } : {}),
      ...(motherAlive !== undefined ? { motherAlive } : {}),
      ...(brothersCount !== undefined ? { brothersCount: Number(brothersCount) } : {}),
      ...(brothersMarried !== undefined ? { brothersMarried: Number(brothersMarried) } : {}),
      ...(sistersCount !== undefined ? { sistersCount: Number(sistersCount) } : {}),
      ...(sistersMarried !== undefined ? { sistersMarried: Number(sistersMarried) } : {}),
      ...(familyDetails !== undefined ? { familyDetails } : {}),
      ...(shouldPersistNormalizedLookingFor
        ? {
            lookingFor:
              normalizedUpdateLookingFor !== undefined && normalizedUpdateLookingFor !== null
                ? sanitizeText(normalizedUpdateLookingFor, 1500) ?? null
                : null,
          }
        : {}),
      ...(city !== undefined ? { city: sanitizeText(city, 100) ?? null } : {}),
      ...(state !== undefined ? { state: sanitizeText(state, 100) ?? null } : {}),
      ...(country !== undefined ? { country: sanitizeText(country, 100) ?? null } : {}),
      ...(community !== undefined ? { community: sanitizeText(community, 100) ?? null } : {}),
      ...(lookingIn !== undefined ? { lookingIn: sanitizeText(lookingIn, 100) ?? null } : {}),
      ...(religion !== undefined ? { religion: sanitizeText(religion, 100) ?? null } : {}),
      ...(caste !== undefined ? { caste: sanitizeText(caste, 100) ?? null } : {}),
      ...(nakshatra !== undefined || star !== undefined ? { nakshatra: sanitizeText(nakshatra ?? star, 100) ?? null } : {}),
      ...(habits !== undefined ? { habits: sanitizeText(habits, 1000) ?? null } : {}),
      ...(maritalStatus !== undefined ? { maritalStatus: sanitizeText(maritalStatus, 100) ?? null } : {}),
      ...(profileFor !== undefined ? { profileFor: sanitizeText(profileFor, 50) ?? null } : {}),
      ...(category !== undefined ? { category: sanitizeText(category, 50) ?? 'Marriage' } : {}),
      ...(gender !== undefined ? { gender: sanitizeText(gender, 50) ?? null } : {}),
      ...(height !== undefined ? { height: sanitizeText(String(height), 50) ?? null } : {}),
      ...(motherTongue !== undefined ? { motherTongue: sanitizeText(motherTongue, 100) ?? null } : {}),
      ...(effectiveLifestyle !== undefined ? { lifestyle: effectiveLifestyle } : {}),
      ...(effectiveInterests !== undefined ? { interests: effectiveInterests } : {}),
      ...(friendshipGoals !== undefined ? { friendshipGoals: sanitizeText(friendshipGoals, 255) ?? null } : {}),
      ...(genderPreference !== undefined ? { genderPreference: sanitizeText(genderPreference, 100) ?? null } : {}),
    };

    await this.prisma.profile.upsert({
      where: { userId },
      update: profileData,
      create: {
        ...profileData,
        user: { connect: { id: userId } },
      },
    });

    return this.getProfile(userId);
  }

  async updatePreferences(userId: string, data: UpdatePreferencesDto) {
    const rawData = data as any;
    const religions = rawData.religions ?? rawData.religion;
    const maritalStatuses = rawData.maritalStatuses ?? rawData.maritalStatus;
    const occupations = rawData.occupations ?? rawData.professions;
    const location = rawData.location ?? rawData.locations;
    const diet = rawData.diet;

    const preferencePayload: any = {};
    if (data.minAge !== undefined) preferencePayload.minAge = Number(data.minAge);
    if (data.maxAge !== undefined) preferencePayload.maxAge = Number(data.maxAge);
    if (data.minHeight !== undefined) preferencePayload.minHeight = String(data.minHeight);
    if (data.maxHeight !== undefined) preferencePayload.maxHeight = String(data.maxHeight);
    if (religions !== undefined) preferencePayload.religions = transformToStringOrCsv({ value: religions });
    if (maritalStatuses !== undefined) preferencePayload.maritalStatuses = transformToStringOrCsv({ value: maritalStatuses });
    if (data.education !== undefined) preferencePayload.education = transformToStringOrCsv({ value: data.education });
    if (occupations !== undefined) preferencePayload.occupations = transformToStringOrCsv({ value: occupations });
    if (data.employmentStatuses !== undefined) preferencePayload.employmentStatuses = transformToStringOrCsv({ value: data.employmentStatuses });
    if (location !== undefined) preferencePayload.location = transformToStringOrCsv({ value: location });
    if (diet !== undefined) preferencePayload.diet = transformToStringOrCsv({ value: diet });

    // Merge with existing profile preferences to preserve untouched filter fields
    const currentProfile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const existingPrefs = (currentProfile?.preferences as any) || {};
    const mergedData = { ...existingPrefs, ...data };

    // Store rich JSON in Profile.preferences as well
    const formattedPrefs = formatPreferencesObject(mergedData, preferencePayload);

    await this.prisma.profile.upsert({
      where: { userId },
      update: {
        preferences: formattedPrefs as any,
      },
      create: {
        userId,
        preferences: formattedPrefs as any,
      },
    });

    const updatedPreference = await this.prisma.preference.upsert({
      where: { userId },
      update: preferencePayload,
      create: {
        ...preferencePayload,
        user: { connect: { id: userId } },
      },
    });

    return {
      preferences: formattedPrefs,
      preference: updatedPreference,
    };
  }
  private async verifyEmailOtp(email: string, code: string): Promise<void> {
    const trimmedCode = (code || '').trim();
    if (!trimmedCode || trimmedCode.length !== 6) {
      throw new BadRequestException('A valid 6-digit verification code is required.');
    }

    const otpSecret = process.env.JWT_ACCESS_SECRET || 'shaadichat-otp-secret-salt';

    const otpRecord = await this.prisma.otpVerification.findFirst({
      where: {
        email,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired verification code. Please request a new code.');
    }

    if (otpRecord.attempts >= 3) {
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { consumed: true },
      });
      throw new BadRequestException(
        'Too many invalid attempts. This verification code has been invalidated. Please request a new code.',
      );
    }

    const calculatedHash = crypto
      .createHmac('sha256', otpSecret)
      .update(trimmedCode)
      .digest('hex');

    const hashesMatch =
      Boolean(otpRecord.codeHash) &&
      otpRecord.codeHash.length === calculatedHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(otpRecord.codeHash, 'hex'),
        Buffer.from(calculatedHash, 'hex'),
      );

    if (!hashesMatch) {
      const newAttempts = otpRecord.attempts + 1;
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: {
          attempts: newAttempts,
          consumed: newAttempts >= 3,
        },
      });

      throw new BadRequestException(
        newAttempts >= 3
          ? 'Too many invalid attempts. This verification code has been invalidated.'
          : `Invalid verification code. ${3 - newAttempts} attempt(s) remaining.`,
      );
    }

    await this.prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    });
  }

  private async verifyPhoneOtp(phone: string, code: string): Promise<void> {
    const trimmedCode = (code || '').trim();
    if (!trimmedCode || trimmedCode.length !== 6) {
      throw new BadRequestException('A valid 6-digit verification code is required.');
    }

    const otpSecret = process.env.JWT_ACCESS_SECRET || 'shaadichat-otp-secret-salt';

    const otpRecord = await this.prisma.otpVerification.findFirst({
      where: {
        phone,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired verification code. Please request a new code.');
    }

    if (otpRecord.attempts >= 3) {
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { consumed: true },
      });
      throw new BadRequestException(
        'Too many invalid attempts. This verification code has been invalidated. Please request a new code.',
      );
    }

    const calculatedHash = crypto
      .createHmac('sha256', otpSecret)
      .update(trimmedCode)
      .digest('hex');

    const hashesMatch =
      Boolean(otpRecord.codeHash) &&
      otpRecord.codeHash.length === calculatedHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(otpRecord.codeHash, 'hex'),
        Buffer.from(calculatedHash, 'hex'),
      );

    if (!hashesMatch) {
      const newAttempts = otpRecord.attempts + 1;
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: {
          attempts: newAttempts,
          consumed: newAttempts >= 3,
        },
      });

      throw new BadRequestException(
        newAttempts >= 3
          ? 'Too many invalid attempts. This verification code has been invalidated.'
          : `Invalid verification code. ${3 - newAttempts} attempt(s) remaining.`,
      );
    }

    await this.prisma.otpVerification.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    });
  }
  async deactivateAccount(userId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DEACTIVATED',
        deactivatedAt: new Date(),
        deletionReason: reason?.trim() || 'Taking a temporary break',
        hashedRefreshToken: null,
      },
      select: { id: true, status: true, deactivatedAt: true },
    });

    // Invalidate device sessions
    await this.prisma.userDevice.deleteMany({ where: { userId } });

    return {
      success: true,
      message: 'Your profile has been deactivated. You can reactivate anytime by signing back in.',
      status: updated.status,
    };
  }

  async deleteAccount(userId: string, reason?: string, feedback?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const combinedReason = [reason, feedback].filter(Boolean).join(' - ') || 'User requested account deletion';

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletionReason: combinedReason,
        hashedRefreshToken: null,
      },
      select: { id: true, status: true, deletedAt: true },
    });

    // Invalidate device sessions
    await this.prisma.userDevice.deleteMany({ where: { userId } });

    return {
      success: true,
      message: 'Your account has been scheduled for deletion. Please contact support if you need to restore it.',
      status: updated.status,
    };
  }

  async reactivateAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        deactivatedAt: null,
        deletionReason: null,
      },
      select: { id: true, status: true },
    });

    return {
      success: true,
      message: 'Your profile has been reactivated successfully.',
      status: updated.status,
    };
  }

  async recordProfileVisit(visitorId: string, viewedUserId: string) {
    if (!visitorId || !viewedUserId || visitorId === viewedUserId) {
      return { success: false };
    }

    try {
      // Resolve target user UUID if passed an identifier
      let resolvedTargetId = viewedUserId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewedUserId)) {
        const target = await this.prisma.user.findFirst({
          where: {
            OR: [
              { profileId: viewedUserId },
              { profileId: { equals: viewedUserId, mode: 'insensitive' } },
              { profile: { id: viewedUserId } },
            ],
          },
          select: { id: true },
        });
        if (target) resolvedTargetId = target.id;
      }

      if (resolvedTargetId === visitorId) return { success: false };

      await this.prisma.profileVisit.upsert({
        where: {
          visitorId_viewedUserId: {
            visitorId,
            viewedUserId: resolvedTargetId,
          },
        },
        create: {
          visitorId,
          viewedUserId: resolvedTargetId,
          visitedAt: new Date(),
        },
        update: {
          visitedAt: new Date(),
        },
      });

      return { success: true };
    } catch (e: any) {
      this.logger.warn(`Failed to record profile visit (${visitorId} -> ${viewedUserId}): ${e?.message}`);
      return { success: false };
    }
  }

  async getRecentVisitors(userId: string, limit = 20) {
    if (!userId) return [];
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    // Check whether the viewing user has an active paid plan
    let isPaid = false;
    try {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          subscriptionTier: true,
          subscription: {
            select: {
              status: true,
              canChat: true,
              expiresAt: true,
            },
          },
        },
      });

      const isExpired = currentUser?.subscription?.expiresAt
        ? new Date(currentUser.subscription.expiresAt) <= new Date()
        : false;
      isPaid = Boolean(
        (currentUser?.subscription &&
          currentUser.subscription.status === 'ACTIVE' &&
          currentUser.subscription.canChat &&
          !isExpired) ||
        (currentUser?.subscriptionTier &&
          ['PLUS', 'ELITE', 'PREMIUM', 'PAID', 'STANDARD'].includes(
            currentUser.subscriptionTier.toUpperCase(),
          ))
      );
    } catch (subErr: any) {
      this.logger.warn(`Failed to query user subscription for visitors: ${subErr?.message}`);
    }

    // Collect blocked user IDs to preserve privacy
    let blockedIds: string[] = [];
    try {
      const [blockedRelations, blockedConnections] = await Promise.all([
        this.prisma.blockedUser
          ? this.prisma.blockedUser.findMany({
              where: {
                OR: [{ blockerId: userId }, { blockedId: userId }],
              },
              select: { blockerId: true, blockedId: true },
            })
          : [],
        this.prisma.connection.findMany({
          where: {
            status: 'BLOCKED',
            OR: [{ senderId: userId }, { receiverId: userId }],
          },
          select: { senderId: true, receiverId: true },
        }),
      ]);

      const idSet = new Set<string>();
      for (const b of blockedRelations) {
        if (b.blockerId !== userId) idSet.add(b.blockerId);
        if (b.blockedId !== userId) idSet.add(b.blockedId);
      }
      for (const c of blockedConnections) {
        if (c.senderId !== userId) idSet.add(c.senderId);
        if (c.receiverId !== userId) idSet.add(c.receiverId);
      }
      blockedIds = Array.from(idSet);
    } catch (err: any) {
      this.logger.warn(`Failed to query blocked users for visitors: ${err?.message}`);
    }

    const visits = await this.prisma.profileVisit.findMany({
      where: {
        viewedUserId: userId,
        visitorId: {
          notIn: [userId, ...blockedIds],
        },
        visitor: {
          status: 'ACTIVE',
          deletedAt: null,
          deactivatedAt: null,
          isBanned: false,
          NOT: [{ email: { contains: 'demo.ishtamchat.com' } }],
        },
      },
      orderBy: { visitedAt: 'desc' },
      take: safeLimit,
      include: {
        visitor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
            lastActiveAt: true,
            isPhoneVerified: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                gender: true,
                dateOfBirth: true,
                city: true,
                occupation: true,
                category: true,
                profileFor: true,
              },
            },
            photos: {
              where: { isPrimary: true },
              take: 1,
              select: { url: true, isVerified: true },
            },
          },
        },
      },
    });

    return visits.map((v) => {
      const u = v.visitor;
      const p = u.profile;
      const resolvedFirst = p?.firstName || u.firstName || 'Member';
      const resolvedLast = p?.lastName || u.lastName || '';
      const resolvedFull = `${resolvedFirst} ${resolvedLast}`.trim();
      const primaryPhoto = u.photos?.[0]?.url || null;
      const isOnline = u.lastActiveAt
        ? Date.now() - new Date(u.lastActiveAt).getTime() <= 5 * 60 * 1000
        : false;
      const age = p?.dateOfBirth ? calculateAge(p.dateOfBirth) : null;

      return {
        id: u.id,
        profileId: u.profileId,
        name: resolvedFirst,
        firstName: resolvedFirst,
        fullName: resolvedFull,
        avatar: primaryPhoto,
        image: primaryPhoto,
        gender: p?.gender || null,
        age,
        city: p?.city || null,
        occupation: p?.occupation || null,
        category: p?.category || p?.profileFor || 'Marriage',
        online: isOnline,
        verified: Boolean(u.isPhoneVerified || u.photos?.[0]?.isVerified),
        visitedAt: v.visitedAt,
        isBlurred: !isPaid,
        isLocked: !isPaid,
      };
    });
  }
}
