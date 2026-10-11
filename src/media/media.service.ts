import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async uploadPhoto(userId: string, file: Express.Multer.File) {
    const existingPhotosCount = await this.prisma.photo.count({
      where: { userId },
    });

    if (existingPhotosCount >= 5) {
      if (file?.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore error
        }
      }
      throw new BadRequestException('Maximum of 5 photos allowed per user. Please delete an existing photo to upload a new one.');
    }

    const url = `/uploads/${file.filename}`;
    const isPrimary = existingPhotosCount === 0;

    return this.prisma.photo.create({
      data: {
        userId,
        url,
        isPrimary,
      },
    });
  }

  async uploadMultiplePhotos(userId: string, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const existingPhotosCount = await this.prisma.photo.count({
      where: { userId },
    });

    if (existingPhotosCount + files.length > 5) {
      files.forEach((file) => {
        if (file?.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch {
            // ignore
          }
        }
      });
      throw new BadRequestException(
        `Maximum of 5 photos allowed per user. You currently have ${existingPhotosCount} photo(s) and cannot upload ${files.length} more.`,
      );
    }

    const createdPhotos = [];
    let hasPrimary = existingPhotosCount > 0;

    for (const file of files) {
      const url = `/uploads/${file.filename}`;
      const isPrimary = !hasPrimary;
      if (isPrimary) {
        hasPrimary = true;
      }

      const photo = await this.prisma.photo.create({
        data: {
          userId,
          url,
          isPrimary,
        },
      });
      createdPhotos.push(photo);
    }

    return createdPhotos;
  }

  async setPrimaryPhoto(userId: string, photoId: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.userId !== userId) {
      throw new NotFoundException('Photo not found');
    }

    await this.prisma.$transaction([
      this.prisma.photo.updateMany({
        where: { userId },
        data: { isPrimary: false },
      }),
      this.prisma.photo.update({
        where: { id: photoId },
        data: { isPrimary: true },
      }),
    ]);

    return this.prisma.photo.findUnique({
      where: { id: photoId },
    });
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
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
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
    }

    // If deleted photo was primary, promote the most recent remaining photo to primary
    if (photo.isPrimary) {
      const remainingPhoto = await this.prisma.photo.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (remainingPhoto) {
        await this.prisma.photo.update({
          where: { id: remainingPhoto.id },
          data: { isPrimary: true },
        });
      }
    }

    return { success: true, message: 'Photo deleted successfully' };
  }
}
