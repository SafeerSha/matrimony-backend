import { ConfigService } from '@nestjs/config';
import {
  LocalStorageService,
  R2StorageService,
  STORAGE_SERVICE,
} from './storage.service';
import { ImageProcessorService } from './image-processor.service';
import { StorageModule } from './storage.module';
import { Test, TestingModule } from '@nestjs/testing';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';

jest.mock('fs');
jest.mock('@aws-sdk/client-s3');

const webpBuffer = Buffer.from('fake-webp-bytes');

/** Shared mock for ImageProcessorService */
const mockImageProcessor = {
  convertToWebP: jest.fn().mockResolvedValue({
    buffer: webpBuffer,
    mimetype: 'image/webp',
    size: webpBuffer.length,
  }),
};

describe('StorageService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('LocalStorageService', () => {
    let localService: LocalStorageService;

    beforeEach(() => {
      const configService = new ConfigService();
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      localService = new LocalStorageService(
        configService,
        mockImageProcessor as unknown as ImageProcessorService,
      );
    });

    it('should convert to WebP and upload to local disk with .webp extension', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-jpeg-bytes'),
      } as Express.Multer.File;

      const result = await localService.uploadFile(mockFile, 'user-123');

      expect(mockImageProcessor.convertToWebP).toHaveBeenCalledWith(
        mockFile.buffer,
        'image/jpeg',
      );
      expect(result.storageProvider).toBe('local');
      expect(result.url).toMatch(/^\/uploads\/[0-9a-f-]+\.webp$/i);
      expect(result.objectKey).toMatch(/^[0-9a-f-]+\.webp$/i);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(result.objectKey!),
        webpBuffer,
      );
    });

    it('should convert PNG to WebP', async () => {
      const mockFile = {
        mimetype: 'image/png',
        buffer: Buffer.from('fake-png-bytes'),
      } as Express.Multer.File;

      const result = await localService.uploadFile(mockFile, 'user-123');
      expect(result.url).toMatch(/\.webp$/);
    });

    it('should delete a file from local disk', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await localService.deleteFile({
        url: '/uploads/sample.webp',
        objectKey: 'sample.webp',
        storageProvider: 'local',
      });

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('sample.webp'),
      );
    });

    it('should not throw if local file to delete does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(
        localService.deleteFile({
          url: '/uploads/missing.webp',
          storageProvider: 'local',
        }),
      ).resolves.not.toThrow();

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('R2StorageService', () => {
    let mockConfigService: any;
    let mockS3Send: jest.Mock;

    beforeEach(() => {
      mockS3Send = jest.fn().mockResolvedValue({});
      (S3Client as unknown as jest.Mock).mockImplementation(() => ({
        send: mockS3Send,
      }));

      mockConfigService = {
        get: jest.fn((key: string) => {
          switch (key) {
            case 'STORAGE_DRIVER':
              return 'r2';
            case 'R2_ACCESS_KEY_ID':
              return 'test-access-key';
            case 'R2_SECRET_ACCESS_KEY':
              return 'test-secret-key';
            case 'R2_BUCKET':
              return 'test-bucket';
            case 'R2_ENDPOINT':
              return 'https://test-account.r2.cloudflarestorage.com';
            case 'R2_PUBLIC_BASE_URL':
              return 'https://media.test.com';
            case 'R2_REGION':
              return 'auto';
            case 'R2_KEY_PREFIX':
              return 'uploads/';
            default:
              return undefined;
          }
        }),
      };
    });

    it('should fail fast if required R2 environment variables are missing', () => {
      const incompleteConfig = {
        get: jest.fn((key: string) => {
          if (key === 'STORAGE_DRIVER') return 'r2';
          return undefined;
        }),
      };

      expect(
        () => new R2StorageService(
          incompleteConfig as unknown as ConfigService,
          mockImageProcessor as unknown as ImageProcessorService,
        ),
      ).toThrow(
        /R2 storage driver is enabled but missing required configuration/,
      );
    });

    it('should convert to WebP and upload to Cloudflare R2 with .webp key', async () => {
      const r2Service = new R2StorageService(
        mockConfigService as unknown as ConfigService,
        mockImageProcessor as unknown as ImageProcessorService,
      );

      const mockFile = {
        mimetype: 'image/png',
        buffer: Buffer.from('fake-png-bytes'),
      } as Express.Multer.File;

      const result = await r2Service.uploadFile(mockFile, 'user-999');

      expect(mockImageProcessor.convertToWebP).toHaveBeenCalledWith(
        mockFile.buffer,
        'image/png',
      );
      expect(result.storageProvider).toBe('r2');
      expect(result.objectKey).toMatch(/^uploads\/users\/user-999\/[0-9a-f-]+\.webp$/i);
      expect(result.url).toBe(`https://media.test.com/${result.objectKey}`);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should send ContentType image/webp to R2 regardless of original mime', async () => {
      const r2Service = new R2StorageService(
        mockConfigService as unknown as ConfigService,
        mockImageProcessor as unknown as ImageProcessorService,
      );

      const mockFile = {
        mimetype: 'image/jpeg',
        buffer: Buffer.from('jpeg-bytes'),
      } as Express.Multer.File;

      await r2Service.uploadFile(mockFile, 'user-1');

      const [putCmd] = mockS3Send.mock.calls[0];
      expect(putCmd.input.ContentType).toBe('image/webp');
    });

    it('should delete an R2 file using objectKey', async () => {
      const r2Service = new R2StorageService(
        mockConfigService as unknown as ConfigService,
        mockImageProcessor as unknown as ImageProcessorService,
      );

      await r2Service.deleteFile({
        url: 'https://media.test.com/uploads/users/u1/pic.webp',
        objectKey: 'uploads/users/u1/pic.webp',
        storageProvider: 'r2',
      });

      expect(mockS3Send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });

    it('should delete a legacy local photo from disk when storageProvider is local', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      const r2Service = new R2StorageService(
        mockConfigService as unknown as ConfigService,
        mockImageProcessor as unknown as ImageProcessorService,
      );

      await r2Service.deleteFile({
        url: '/uploads/legacy.jpg',
        storageProvider: 'local',
      });

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('legacy.jpg'),
      );
      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });

  describe('StorageModule DI', () => {
    it('should provide LocalStorageService when STORAGE_DRIVER is local', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [StorageModule],
      })
        .overrideProvider(ConfigService)
        .useValue({
          get: jest.fn((key: string) => {
            if (key === 'STORAGE_DRIVER') return 'local';
            return undefined;
          }),
        })
        .overrideProvider(ImageProcessorService)
        .useValue(mockImageProcessor)
        .compile();

      const service = module.get(STORAGE_SERVICE);
      expect(service).toBeInstanceOf(LocalStorageService);
    });

    it('should provide R2StorageService when STORAGE_DRIVER is r2', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [StorageModule],
      })
        .overrideProvider(ConfigService)
        .useValue({
          get: jest.fn((key: string) => {
            switch (key) {
              case 'STORAGE_DRIVER':
                return 'r2';
              case 'R2_ACCESS_KEY_ID':
                return 'test-id';
              case 'R2_SECRET_ACCESS_KEY':
                return 'test-secret';
              case 'R2_BUCKET':
                return 'test-bucket';
              case 'R2_ENDPOINT':
                return 'https://test.r2.cloudflarestorage.com';
              case 'R2_PUBLIC_BASE_URL':
                return 'https://media.test.com';
              default:
                return undefined;
            }
          }),
        })
        .overrideProvider(ImageProcessorService)
        .useValue(mockImageProcessor)
        .compile();

      const service = module.get(STORAGE_SERVICE);
      expect(service).toBeInstanceOf(R2StorageService);
    });
  });
});
