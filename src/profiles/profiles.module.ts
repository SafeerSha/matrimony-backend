import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [MediaModule, StorageModule],
  providers: [ProfilesService],
  controllers: [ProfilesController],
  exports: [ProfilesService],
})
export class ProfilesModule {}
