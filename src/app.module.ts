import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { ConnectionsModule } from './connections/connections.module';
import { MediaModule } from './media/media.module';
import { AdminModule } from './admin/admin.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    ProfilesModule,
    DiscoveryModule,
    ConnectionsModule,
    MediaModule,
    AdminModule,
    ChatModule,
  ],
})
export class AppModule {}
