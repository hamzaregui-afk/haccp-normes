import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    AuthModule,
    HealthModule,
    MetricsModule,
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60_000, // 1 minute window
        limit: 10, // max 10 requests per minute per IP (for login attempts)
      },
      {
        name: 'long',
        ttl: 900_000, // 15 minute window
        limit: 50, // max 50 requests per 15 min
      },
    ]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
