import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

// ARCH-DECISION: Using @nestjs/terminus for structured health checks.
// The /health endpoint (outside api/v1 prefix) is used by Docker HEALTHCHECK
// and Kubernetes liveness/readiness probes. It checks Prisma DB connectivity
// in addition to basic process health.
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
