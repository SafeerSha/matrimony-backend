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
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let profileId = '';
    let exists = true;
    while (exists) {
      const letter = letters[Math.floor(Math.random() * letters.length)];
      const count = await this.prisma.user.count();
      const num = (count + 1).toString().padStart(5, '0');
      profileId = `LT-${letter}${num}`;

      const existing = await this.prisma.user.findUnique({
        where: { profileId },
      });
      if (!existing) {
        exists = false;
      } else {
        const randNum = Math.floor(10000 + Math.random() * 90000).toString();
        profileId = `LT-${letter}${randNum}`;
        const randExisting = await this.prisma.user.findUnique({ where: { profileId } });
        if (!randExisting) exists = false;
      }
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
