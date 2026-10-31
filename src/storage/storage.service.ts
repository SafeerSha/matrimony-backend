import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ImageProcessorService } from './image-processor.service';

import {
  STORAGE_SERVICE,
  StorageService,
  StorageUploadResult,
  StorageDeleteTarget,
} from './storage.interface';

export {
  STORAGE_SERVICE,
  StorageService,
  StorageUploadResult,
  StorageDeleteTarget,
};

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly imageProcessor: ImageProcessorService,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      try {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      } catch (err) {
        this.logger.error('Failed to create uploads directory', err);
      }
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<StorageUploadResult> {
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('File buffer is empty or missing');
    }

    // Convert to WebP regardless of original format
    const converted = await this.imageProcessor.convertToWebP(
      file.buffer,
      file.mimetype,
    );

    const filename = `${crypto.randomUUID()}.webp`;
    const filePath = path.join(this.uploadDir, filename);

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    fs.writeFileSync(filePath, converted.buffer);

    return {
      url: `/uploads/${filename}`,
      objectKey: filename,
      storageProvider: 'local',
    };
  }

  async deleteFile(target: StorageDeleteTarget): Promise<void> {
    const filename =
      target.objectKey ||
      target.url.replace('/uploads/', '').replace(/^\/+/, '');
    const filePath = path.join(this.uploadDir, filename);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        this.logger.warn(`Failed to delete local file: ${filePath}`);
      }
    }
  }
}

@Injectable()
export class R2StorageService implements StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private s3Client: S3Client | null = null;
  private bucket: string = '';
  private publicBaseUrl: string = '';
  private isConfigured = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly imageProcessor: ImageProcessorService,
    @Optional() private readonly localStorageService?: LocalStorageService,
    @Optional() customClient?: S3Client,
  ) {
    if (customClient) {
      this.s3Client = customClient;
    }
    const driver = (
      this.configService.get<string>('STORAGE_DRIVER') || 'local'
    ).toLowerCase();
    if (driver === 'r2') {
      this.ensureConfigured();
    }
  }

  public ensureConfigured(): void {
    if (this.isConfigured && this.s3Client) {
      return;
    }

    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    const bucket = this.configService.get<string>('R2_BUCKET');
    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    const publicBaseUrl = this.configService.get<string>('R2_PUBLIC_BASE_URL');
    const region = this.configService.get<string>('R2_REGION') || 'auto';

    const missing: string[] = [];
    if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
    if (!bucket) missing.push('R2_BUCKET');
    if (!endpoint) missing.push('R2_ENDPOINT');
    if (!publicBaseUrl) missing.push('R2_PUBLIC_BASE_URL');

    if (missing.length > 0) {
      throw new Error(
        `R2 storage driver is enabled but missing required configuration: ${missing.join(', ')}`,
      );
    }

    this.bucket = bucket!;
    this.publicBaseUrl = publicBaseUrl!;

    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region,
        endpoint: endpoint!,
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED' as any,
        responseChecksumValidation: 'WHEN_REQUIRED' as any,
      });
    }

    this.isConfigured = true;
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<StorageUploadResult> {
    this.ensureConfigured();

    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('File buffer is empty or missing');
    }

    // Convert to WebP regardless of original format
    const converted = await this.imageProcessor.convertToWebP(
      file.buffer,
      file.mimetype,
    );

    let prefix = (
      this.configService.get<string>('R2_KEY_PREFIX') || 'uploads/'
    ).trim();
    if (prefix && !prefix.endsWith('/')) {
      prefix += '/';
    }
    prefix = prefix.replace(/^\/+/, '');

    const objectKey = `${prefix}users/${userId}/${crypto.randomUUID()}.webp`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: converted.buffer,
      ContentType: 'image/webp',
    });

    try {
      await this.s3Client!.send(command);

      const baseUrl = this.publicBaseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/${objectKey}`;

      return {
        url,
        objectKey,
        storageProvider: 'r2',
      };
    } catch (r2Err) {
      this.logger.warn(
        `R2 upload failed, falling back to local storage: ${(r2Err as any)?.message || r2Err}`,
      );
      if (this.localStorageService) {
        return this.localStorageService.uploadFile(file, userId);
      }
      throw r2Err;
    }
  }

  async deleteFile(target: StorageDeleteTarget): Promise<void> {
    // If it's a legacy local photo or has local URL and no objectKey
    if (
      target.storageProvider === 'local' ||
      (!target.objectKey && target.url.startsWith('/uploads/'))
    ) {
      const filename =
        target.objectKey ||
        target.url.replace('/uploads/', '').replace(/^\/+/, '');
      const filePath = path.join(process.cwd(), 'uploads', filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore error
        }
      }
      return;
    }

    if (target.objectKey) {
      this.ensureConfigured();
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: target.objectKey,
      });

      await this.s3Client!.send(command);
    }
  }
}
