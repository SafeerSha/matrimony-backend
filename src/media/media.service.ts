import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_SERVICE,
  StorageService,
  StorageUploadResult,
} from '../storage/storage.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  async uploadPhoto(userId: string, file: Express.Multer.File) {
    const existingPhotosCount = await this.prisma.photo.count({
      where: { userId },
    });

    if (existingPhotosCount >= 5) {
      throw new BadRequestException(
        'Maximum of 5 photos allowed per user. Please delete an existing photo to upload a new one.',
      );
    }

    const uploadResult = await this.storageService.uploadFile(file, userId);
    const isPrimary = existingPhotosCount === 0;

    try {
      return await this.prisma.photo.create({
        data: {
          userId,
          url: uploadResult.url,
          objectKey: uploadResult.objectKey,
          storageProvider: uploadResult.storageProvider,
          isPrimary,
        },
      });
    } catch (err) {
      try {
        await this.storageService.deleteFile(uploadResult);
      } catch {
        // ignore rollback deletion error
      }
      throw err;
    }
  }

  async uploadMultiplePhotos(userId: string, files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const existingPhotosCount = await this.prisma.photo.count({
      where: { userId },
    });

    if (existingPhotosCount + files.length > 5) {
      throw new BadRequestException(
        `Maximum of 5 photos allowed per user. You currently have ${existingPhotosCount} photo(s) and cannot upload ${files.length} more.`,
      );
    }

    const createdPhotos = [];
    const uploadedResults: StorageUploadResult[] = [];
    let hasPrimary = existingPhotosCount > 0;

    try {
      for (const file of files) {
        const uploadResult = await this.storageService.uploadFile(file, userId);
        uploadedResults.push(uploadResult);

        const isPrimary = !hasPrimary;
        if (isPrimary) {
          hasPrimary = true;
        }

        const photo = await this.prisma.photo.create({
          data: {
            userId,
            url: uploadResult.url,
            objectKey: uploadResult.objectKey,
            storageProvider: uploadResult.storageProvider,
            isPrimary,
          },
        });
        createdPhotos.push(photo);
      }

      return createdPhotos;
    } catch (err) {
      for (const uploaded of uploadedResults) {
        const alreadyCreated = createdPhotos.find((p) => p.url === uploaded.url);
        if (!alreadyCreated) {
          try {
            await this.storageService.deleteFile(uploaded);
          } catch {
            // ignore
          }
        }
      }
      throw err;
    }
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

    // Delete from storage (handles both R2 and local)
    await this.storageService.deleteFile({
      url: photo.url,
      objectKey: photo.objectKey,
      storageProvider: photo.storageProvider,
    });

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
