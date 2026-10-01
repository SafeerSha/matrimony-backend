import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        include: {
          profile: true,
          photos: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.user.count()
    ]);

    const sanitizedUsers = users.map(user => {
      const { passwordHash, ...rest } = user;
      return rest;
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

  async getStats() {
    const [totalUsers, totalMatches, unverifiedPhotos] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.connection.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.photo.count({ where: { isVerified: false } }),
    ]);

    return {
      totalUsers,
      totalMatches,
      unverifiedPhotos,
    };
  }

  async banUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: true },
      select: { id: true, email: true, isBanned: true }
    });
  }

  async verifyPhoto(photoId: string, status: 'approved' | 'rejected') {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    if (status === 'approved') {
      return this.prisma.photo.update({
        where: { id: photoId },
        data: { isVerified: true },
      });
    } else {
      // For rejected, delete the photo
      await this.prisma.photo.delete({ where: { id: photoId } });
      
      // Also delete from physical disk
      const filename = photo.url.replace('/uploads/', '');
      const filePath = path.join(process.cwd(), 'uploads', filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      return { success: true, message: 'Photo rejected and deleted' };
    }
  }
}
