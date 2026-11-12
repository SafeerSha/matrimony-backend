import { Module, forwardRef } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { RmController } from './rm.controller';
import { RmService } from './rm.service';

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [RmController],
  providers: [RmService],
  exports: [RmService],
})
export class RmModule {}

