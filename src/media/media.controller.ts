import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  Put,
  Patch,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { diskStorage } from 'multer';
import * as fileType from 'file-type';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '../common/decorators/throttle.decorator';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService } from '../storage/storage.service';

const uploadsRoot = path.join(process.cwd(), 'uploads', '.temp');

const multerStorage = diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(uploadsRoot, { recursive: true });
      cb(null, uploadsRoot);
    } catch (err) {
      cb(err as Error, uploadsRoot);
    }
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'dat';
    cb(null, `${file.fieldname}-${uniqueSuffix}.${ext}`);
  },
});

const imageFileFilter = (req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/i)) {
    return cb(
      new BadRequestException(
        'Only image files (jpg, jpeg, png, gif, webp) are allowed!',
      ),
      false,
    );
  }
  cb(null, true);
};

async function validateMagicBytes(file: Express.Multer.File): Promise<boolean> {
  try {
    const type = file.path
      ? await fileType.fromFile(file.path)
      : file.buffer
      ? await fileType.fromBuffer(file.buffer)
      : undefined;
    if (!type || !type.mime.match(/\/(jpg|jpeg|png|gif|webp)$/i)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function cleanupTempFile(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
}

@ApiTags('Media')
@ApiBearerAuth('JWT-auth')
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    @Optional() @Inject(forwardRef(() => StorageService)) private readonly storageService?: StorageService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: multerStorage,
      fileFilter: imageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async uploadPhoto(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const isValid = await validateMagicBytes(file);
    if (!isValid) {
      await cleanupTempFile(file.path);
      throw new BadRequestException('Invalid file type detected by magic bytes!');
    }

    try {
      return await this.mediaService.uploadPhoto(user.sub, file);
    } finally {
      await cleanupTempFile(file.path);
    }
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('upload-multiple')
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      storage: multerStorage,
      fileFilter: imageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
      },
    }),
  )
  async uploadMultiplePhotos(
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    // Validate magic bytes for all uploaded files
    for (const file of files) {
      const isValid = await validateMagicBytes(file);
      if (!isValid) {
        // Clean up all temp files on validation failure
        await Promise.all(files.map((f) => cleanupTempFile(f.path)));
        throw new BadRequestException(
          'Invalid file type detected by magic bytes in one or more uploaded files!',
        );
      }
    }

    try {
      return await this.mediaService.uploadMultiplePhotos(user.sub, files);
    } finally {
      await Promise.all(files.map((f) => cleanupTempFile(f.path)));
    }
  }

  @Put(':id/primary')
  async setPrimaryPhotoPut(@CurrentUser() user: any, @Param('id') photoId: string) {
    return this.mediaService.setPrimaryPhoto(user.sub, photoId);
  }

  @Patch(':id/primary')
  async setPrimaryPhotoPatch(@CurrentUser() user: any, @Param('id') photoId: string) {
    return this.mediaService.setPrimaryPhoto(user.sub, photoId);
  }

  @Put(':id')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: multerStorage,
      fileFilter: imageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async replacePhoto(
    @CurrentUser() user: any,
    @Param('id') photoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const isValid = await validateMagicBytes(file);
    if (!isValid) {
      await cleanupTempFile(file.path);
      throw new BadRequestException('Invalid file type detected by magic bytes!');
    }

    try {
      return await this.mediaService.replacePhoto(user.sub, photoId, file);
    } finally {
      await cleanupTempFile(file.path);
    }
  }

  @Post(':id/replace')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: multerStorage,
      fileFilter: imageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async replacePhotoPost(
    @CurrentUser() user: any,
    @Param('id') photoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const isValid = await validateMagicBytes(file);
    if (!isValid) {
      await cleanupTempFile(file.path);
      throw new BadRequestException('Invalid file type detected by magic bytes!');
    }

    try {
      return await this.mediaService.replacePhoto(user.sub, photoId, file);
    } finally {
      await cleanupTempFile(file.path);
    }
  }

  @Delete(':id')
  async deletePhoto(@CurrentUser() user: any, @Param('id') photoId: string) {
    return this.mediaService.deletePhoto(user.sub, photoId);
  }
}
