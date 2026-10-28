import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { sanitizeText } from '../common/utils/sanitize.util';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async completeOnboarding(userId: string, dto: CompleteOnboardingDto) {
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

    if (user.status === 'SUSPENDED') {
      throw new BadRequestException('Account is suspended');
    }

    let normalizedEmail: string | undefined;
    if (dto.email) {
      normalizedEmail = dto.email.trim().toLowerCase();
      const existingUserWithEmail = await this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          id: { not: userId },
        },
      });
      if (existingUserWithEmail) {
        throw new ConflictException('This email address is already associated with another account.');
      }
    }

    // Validate mandatory profile fields
    const effectiveGender = dto.gender || user.profile?.gender;
    const effectiveDob = dto.dateOfBirth ? new Date(dto.dateOfBirth) : user.profile?.dateOfBirth;
    const effectiveEducation = dto.education || user.profile?.education;
    const effectiveAddress = (dto.permanentAddress || user.profile?.permanentAddress || '').trim();
    const effectiveEmail = normalizedEmail || user.email;
    const effectivePhone = user.phone;
    const photoCount = user.photos ? user.photos.length : 0;

    const missingFields: string[] = [];
    if (!effectiveGender) missingFields.push('gender');
    if (!effectiveDob) missingFields.push('dateOfBirth');
    if (!effectiveEducation) missingFields.push('education');
    if (!effectiveAddress) missingFields.push('permanent address');
    if (!effectiveEmail) missingFields.push('email address');
    if (!effectivePhone) missingFields.push('cell number');
    if (photoCount === 0 && !dto.skipPhotoCheck) {
      missingFields.push('at least one profile photo');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Cannot complete onboarding. The following mandatory fields are missing: ${missingFields.join(', ')}`,
      );
    }

    let passwordHash: string | undefined;
    if (dto.password) {
      passwordHash = await argon2.hash(dto.password);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          status: 'ACTIVE',
          ...(passwordHash ? { passwordHash } : {}),
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
        },
      });

      const sanitizedEducation = sanitizeText(dto.education, 255);
      const sanitizedOccupation = sanitizeText(dto.occupation || dto.profession, 255);
      const sanitizedEmploymentStatus = sanitizeText(dto.employmentStatus, 100);
      const sanitizedAddress = sanitizeText(dto.permanentAddress, 500);
      const sanitizedFatherName = sanitizeText(dto.fatherName, 100);

      const profileUpdateData: any = {
        onboardingStep: 5,
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(sanitizedEducation ? { education: sanitizedEducation } : {}),
        ...(sanitizedOccupation ? { occupation: sanitizedOccupation } : {}),
        ...(sanitizedEmploymentStatus ? { employmentStatus: sanitizedEmploymentStatus } : {}),
        ...(dto.bio ? { bio: sanitizeText(dto.bio) } : {}),
        ...(dto.maritalStatus ? { maritalStatus: sanitizeText(dto.maritalStatus, 50) } : {}),
        ...(dto.city ? { city: sanitizeText(dto.city, 100) } : {}),
        ...(dto.state ? { state: sanitizeText(dto.state, 100) } : {}),
        ...(dto.country ? { country: sanitizeText(dto.country, 100) } : {}),
        ...(dto.nationality ? { nationality: sanitizeText(dto.nationality, 100) } : {}),
        ...(sanitizedFatherName ? { fatherName: sanitizedFatherName } : {}),
        ...(dto.religion ? { religion: sanitizeText(dto.religion, 100) } : {}),
        ...(dto.caste ? { caste: sanitizeText(dto.caste, 100) } : {}),
        ...(dto.height ? { height: sanitizeText(dto.height, 50) } : {}),
        ...(dto.annualIncome || dto.income ? { annualIncome: sanitizeText(dto.annualIncome || dto.income, 100) } : {}),
        ...(sanitizedAddress ? { permanentAddress: sanitizedAddress } : {}),
        ...(dto.fatherAlive !== undefined ? { fatherAlive: dto.fatherAlive } : {}),
        ...(dto.motherAlive !== undefined ? { motherAlive: dto.motherAlive } : {}),
        ...(dto.brothersCount !== undefined ? { brothersCount: Number(dto.brothersCount) } : {}),
        ...(dto.brothersMarried !== undefined ? { brothersMarried: Number(dto.brothersMarried) } : {}),
        ...(dto.sistersCount !== undefined ? { sistersCount: Number(dto.sistersCount) } : {}),
        ...(dto.sistersMarried !== undefined ? { sistersMarried: Number(dto.sistersMarried) } : {}),
        ...(dto.familyDetails !== undefined ? { familyDetails: dto.familyDetails } : {}),
      };

      const updatedProfile = await tx.profile.upsert({
        where: { userId },
        update: profileUpdateData,
        create: {
          userId,
          ...profileUpdateData,
        },
      });

      return { user: updatedUser, profile: updatedProfile };
    });

    // Fire welcome notification
    try {
      await this.notificationsService.createNotification(
        userId,
        'SYSTEM',
        'Welcome to IshtamChat! Your profile is now active and live. Start connecting with compatible partners today!',
      );
    } catch {
      // Safe failure: notification logging error should not block profile activation
    }

    return {
      success: true,
      message: 'Onboarding completed successfully. Profile is now active.',
      user: {
        id: updated.user.id,
        email: updated.user.email,
        phone: updated.user.phone,
        profileId: updated.user.profileId,
        status: updated.user.status,
        role: updated.user.role,
      },
      profile: updated.profile,
    };
  }
}
