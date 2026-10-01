import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadPhoto(userId: string, file: Express.Multer.File) {
    // Generate the public URL
    const url = `/uploads/${file.filename}`;

    const existingPhotosCount = await this.prisma.photo.count({
      where: { userId }
    });

    const isPrimary = existingPhotosCount === 0;

    return this.prisma.photo.create({
      data: {
        userId,
        url,
        isPrimary,
      }
    });
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId }
    });

    if (!photo || photo.userId !== userId) {
      throw new NotFoundException('Photo not found');
    }

    // Delete from DB
    await this.prisma.photo.delete({ where: { id: photoId } });

    // Delete physical file
    const filename = photo.url.replace('/uploads/', '');
    const filePath = path.join(process.cwd(), 'uploads', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return { success: true };
  }
}
