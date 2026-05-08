import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  // ARCH-DECISION: Exposed at /health (not /api/v1/health) so Docker/k8s probes
  // don't need to know about the API prefix. main.ts raw adapter handles routing
  // this outside the global prefix. This controller acts as a NestJS registration
  // point for the TerminusModule so dependency injection works properly.
  @Get('health-check')
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
