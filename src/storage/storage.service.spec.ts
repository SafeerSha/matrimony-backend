import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockCreateReadStream = jest.fn<any>();
const mockCreateWriteStream = jest.fn<any>();
const mockFspMkdir = jest.fn<any>().mockResolvedValue(undefined);
const mockFspAccess = jest.fn<any>().mockResolvedValue(undefined);
const mockFspUnlink = jest.fn<any>().mockResolvedValue(undefined);

jest.unstable_mockModule('fs', () => ({
  createReadStream: mockCreateReadStream,
  createWriteStream: mockCreateWriteStream,
}));

jest.unstable_mockModule('fs/promises', () => ({
  mkdir: mockFspMkdir,
  access: mockFspAccess,
  unlink: mockFspUnlink,
}));

const mockS3Send = jest.fn<any>().mockResolvedValue({});
class MockS3Client {
  send = mockS3Send;
}
class MockPutObjectCommand {
  constructor(public input: any) {}
}
class MockDeleteObjectCommand {
  constructor(public input: any) {}
}

jest.unstable_mockModule('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  PutObjectCommand: MockPutObjectCommand,
  DeleteObjectCommand: MockDeleteObjectCommand,
}));

class MockConfigService {
  get(_key: string) {
    return undefined;
  }
}

@Module({
  providers: [MockConfigService],
  exports: [MockConfigService],
})
class MockConfigModule {}

jest.unstable_mockModule('@nestjs/config', () => ({
  ConfigService: MockConfigService,
  ConfigModule: MockConfigModule,
}));

jest.unstable_mockModule('sharp', () => ({
  default: Object.assign(jest.fn(), { concurrency: jest.fn(), cache: jest.fn() }),
}));

const { ConfigService } = await import('@nestjs/config');
const { LocalStorageService, R2StorageService, STORAGE_SERVICE } = await import('./storage.service');
const { ImageProcessorService } = await import('./image-processor.service');
const { StorageModule } = await import('./storage.module');

const webpBuffer = Buffer.from('fake-webp-bytes');

function createMockWriteStream() {
  const out = new EventEmitter() as any;
  out.write = jest.fn();
  out.end = jest.fn(() => {
    queueMicrotask(() => out.emit('finish'));
  });
  return out;
}

const mockImageProcessor = {
  convertToWebPFromSource: jest.fn<any>().mockImplementation(async () => ({
    stream: Readable.from([webpBuffer]),
    mimetype: 'image/webp',
    size: null,
  })),
};

describe('StorageService', () => {
  beforeEach(() => {
    mockCreateWriteStream.mockImplementation(() => createMockWriteStream());
    mockCreateReadStream.mockImplementation(() => Readable.from([Buffer.from('disk-bytes')]));
    mockFspMkdir.mockResolvedValue(undefined);
    mockFspAccess.mockResolvedValue(undefined);
    mockFspUnlink.mockResolvedValue(undefined);
    mockS3Send.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('LocalStorageService', () => {
    let localService: InstanceType<typeof LocalStorageService>;

    beforeEach(() => {
      localService = new LocalStorageService(
        new ConfigService() as any,
        mockImageProcessor as any,
      );
    });

    it('should convert to WebP stream and upload to local disk with .webp extension', async () => {
      const mockFile = {
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-jpeg-bytes'),
      } as Express.Multer.File;

      const result = await localService.uploadFile(mockFile, 'user-123');

      expect(mockImageProcessor.convertToWebPFromSource).toHaveBeenCalledWith(
        { kind: 'buffer', buffer: mockFile.buffer },
        'image/jpeg',
      );
      expect(result.storageProvider).toBe('local');
      expect(result.url).toMatch(/^\/uploads\/[0-9a-f-]+\.webp$/i);
      expect(result.objectKey).toMatch(/^[0-9a-f-]+\.webp$/i);
      expect(mockCreateWriteStream).toHaveBeenCalledWith(
        expect.stringContaining(result.objectKey!),
      );
    });

    it('should stream from temp disk file and unlink temp path after completion', async () => {
      const mockFile = {
        mimetype: 'image/png',
        path: '/tmp/upload-1.png',
      } as Express.Multer.File;

      const result = await localService.uploadFile(mockFile, 'user-123');

      expect(mockCreateReadStream).toHaveBeenCalledWith('/tmp/upload-1.png');
      expect(result.url).toMatch(/\.webp$/);
      expect(mockFspUnlink).toHaveBeenCalledWith('/tmp/upload-1.png');
    });

    it('should delete a file from local disk', async () => {
      await localService.deleteFile({
        url: '/uploads/sample.webp',
        objectKey: 'sample.webp',
        storageProvider: 'local',
      });

      expect(mockFspUnlink).toHaveBeenCalledWith(
        expect.stringContaining('sample.webp'),
      );
    });

    it('should not throw if local file to delete does not exist', async () => {
      mockFspAccess.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        localService.deleteFile({
          url: '/uploads/missing.webp',
          storageProvider: 'local',
        }),
      ).resolves.not.toThrow();

      expect(mockFspUnlink).not.toHaveBeenCalled();
    });
  });

  describe('R2StorageService', () => {
    let mockConfigService: any;

    beforeEach(() => {
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
        () =>
          new R2StorageService(
            incompleteConfig as any,
            mockImageProcessor as any,
          ),
      ).toThrow(/R2 storage driver is enabled but missing required configuration/);
    });

    it('should convert to WebP stream and upload to Cloudflare R2 with .webp key', async () => {
      const r2Service = new R2StorageService(
        mockConfigService,
        mockImageProcessor as any,
      );

      const mockFile = {
        mimetype: 'image/png',
        buffer: Buffer.from('fake-png-bytes'),
      } as Express.Multer.File;

      const result = await r2Service.uploadFile(mockFile, 'user-999');

      expect(mockImageProcessor.convertToWebPFromSource).toHaveBeenCalledWith(
        { kind: 'buffer', buffer: mockFile.buffer },
        'image/png',
      );
      expect(result.storageProvider).toBe('r2');
      expect(result.objectKey).toMatch(/^uploads\/users\/user-999\/[0-9a-f-]+\.webp$/i);
      expect(result.url).toBe(`https://media.test.com/${result.objectKey}`);
      expect(mockS3Send).toHaveBeenCalledWith(expect.any(MockPutObjectCommand));
    });

    it('should send ContentType image/webp to R2 regardless of original mime', async () => {
      const r2Service = new R2StorageService(
        mockConfigService,
        mockImageProcessor as any,
      );

      const mockFile = {
        mimetype: 'image/jpeg',
        buffer: Buffer.from('jpeg-bytes'),
      } as Express.Multer.File;

      await r2Service.uploadFile(mockFile, 'user-1');

      const [putCmd] = mockS3Send.mock.calls[0];
      expect((putCmd as any).input.ContentType).toBe('image/webp');
    });

    it('should fall back to local storage on R2 error without deleting temp file prematurely', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('R2 network error'));
      const localFallback = new LocalStorageService(
        mockConfigService,
        mockImageProcessor as any,
      );
      const r2Service = new R2StorageService(
        mockConfigService,
        mockImageProcessor as any,
        localFallback,
      );

      const mockFile = {
        mimetype: 'image/jpeg',
        path: '/tmp/fallback-test.jpg',
      } as Express.Multer.File;

      const result = await r2Service.uploadFile(mockFile, 'user-1');

      expect(result.storageProvider).toBe('local');
      expect(mockFspUnlink).toHaveBeenCalledTimes(1);
      expect(mockFspUnlink).toHaveBeenCalledWith('/tmp/fallback-test.jpg');
    });

    it('should delete an R2 file using objectKey', async () => {
      const r2Service = new R2StorageService(
        mockConfigService,
        mockImageProcessor as any,
      );

      await r2Service.deleteFile({
        url: 'https://media.test.com/uploads/users/u1/pic.webp',
        objectKey: 'uploads/users/u1/pic.webp',
        storageProvider: 'r2',
      });

      expect(mockS3Send).toHaveBeenCalledWith(expect.any(MockDeleteObjectCommand));
    });

    it('should delete a legacy local photo from disk when storageProvider is local', async () => {
      const r2Service = new R2StorageService(
        mockConfigService,
        mockImageProcessor as any,
      );

      await r2Service.deleteFile({
        url: '/uploads/legacy.jpg',
        storageProvider: 'local',
      });

      expect(mockFspUnlink).toHaveBeenCalledWith(
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
