import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  STORAGE_SERVICE,
  StorageService,
  LocalStorageService,
  R2StorageService,
} from './storage.service';
import { ImageProcessorService } from './image-processor.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ImageProcessorService,
    LocalStorageService,
    R2StorageService,
    {
      provide: STORAGE_SERVICE,
      useFactory: (
        configService: ConfigService,
        localStorageService: LocalStorageService,
        r2StorageService: R2StorageService,
      ) => {
        const driver = (
          configService.get<string>('STORAGE_DRIVER') || 'local'
        ).toLowerCase();
        if (driver === 'r2') {
          r2StorageService.ensureConfigured();
          return r2StorageService;
        }
        return localStorageService;
      },
      inject: [ConfigService, LocalStorageService, R2StorageService],
    },
    {
      provide: StorageService,
      useExisting: STORAGE_SERVICE,
    },
  ],
  exports: [
    STORAGE_SERVICE,
    StorageService,
    ImageProcessorService,
    LocalStorageService,
    R2StorageService,
  ],
})
export class StorageModule {}

