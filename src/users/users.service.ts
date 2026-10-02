import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Backfill any existing users without a profileId
    const usersWithoutProfileId = await this.prisma.user.findMany({
      where: { profileId: null },
    });

    for (const u of usersWithoutProfileId) {
      const profileId = await this.generateUniqueProfileId();
      await this.prisma.user.update({
        where: { id: u.id },
        data: { profileId },
      });
    }
  }

  async generateUniqueProfileId(): Promise<string> {
    const usersWithProfileId = await this.prisma.user.findMany({
      where: {
        profileId: {
          startsWith: 'LT-',
        },
      },
      select: { profileId: true },
    });

    let maxSequence = 0;
    const regex = /^LT-([A-Z])(\d{5})$/;

    for (const u of usersWithProfileId) {
      if (!u.profileId) continue;
      const match = u.profileId.match(regex);
      if (match) {
        const letter = match[1];
        const num = parseInt(match[2], 10);
        const letterIndex = letter.charCodeAt(0) - 65; // 'A' = 0, 'B' = 1, ...
        const sequence = letterIndex * 99999 + num;
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    }

    let nextSequence = maxSequence + 1;

    const formatProfileId = (seq: number): string => {
      const adjusted = seq - 1;
      const letterIndex = Math.floor(adjusted / 99999);
      const num = (adjusted % 99999) + 1;
      const letter = String.fromCharCode(65 + Math.min(letterIndex, 25));
      return `LT-${letter}${num.toString().padStart(5, '0')}`;
    };

    let profileId = formatProfileId(nextSequence);

    while (await this.prisma.user.findUnique({ where: { profileId } })) {
      nextSequence++;
      profileId = formatProfileId(nextSequence);
    }

    return profileId;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: CreateUserData) {
    const profileId = await this.generateUniqueProfileId();
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        profileId,
        role: 'USER', // Default role
      },
    });
  }

  async updateRefreshToken(userId: string, hashedRefreshToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }

  async clearRefreshToken(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }
}
