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
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { diskStorage } from 'multer';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as fileType from 'file-type';

const uploadPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const multerStorage = diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomUUID() + path.extname(file.originalname);
    cb(null, uniqueSuffix);
  },
});

const imageFileFilter = (req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/i)) {
    return cb(new BadRequestException('Only image files (jpg, jpeg, png, gif, webp) are allowed!'), false);
  }
  cb(null, true);
};

async function validateMagicBytes(filePath: string): Promise<boolean> {
  try {
    const buffer = fs.readFileSync(filePath);
    const type = await fileType.fromBuffer(buffer);
    if (!type || !type.mime.match(/\/(jpg|jpeg|png|gif|webp)$/i)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

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
  async uploadPhoto(@CurrentUser() user: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const isValid = await validateMagicBytes(file.path);
    if (!isValid) {
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
      throw new BadRequestException('Invalid file type detected by magic bytes!');
    }

    return this.mediaService.uploadPhoto(user.sub, file);
  }

  @Post('upload-multiple')
  @UseInterceptors(
    FilesInterceptor('photos', 5, {
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
      const isValid = await validateMagicBytes(file.path);
      if (!isValid) {
        // Clean up all uploaded files
        files.forEach((f) => {
          if (fs.existsSync(f.path)) {
            try {
              fs.unlinkSync(f.path);
            } catch {
              // ignore
            }
          }
        });
        throw new BadRequestException('Invalid file type detected by magic bytes in one or more uploaded files!');
      }
    }

    return this.mediaService.uploadMultiplePhotos(user.sub, files);
  }

  @Put(':id/primary')
  async setPrimaryPhotoPut(@CurrentUser() user: any, @Param('id') photoId: string) {
    return this.mediaService.setPrimaryPhoto(user.sub, photoId);
  }

  @Patch(':id/primary')
  async setPrimaryPhotoPatch(@CurrentUser() user: any, @Param('id') photoId: string) {
    return this.mediaService.setPrimaryPhoto(user.sub, photoId);
  }

  @Delete(':id')
  async deletePhoto(@CurrentUser() user: any, @Param('id') photoId: string) {
    return this.mediaService.deletePhoto(user.sub, photoId);
  }
}
