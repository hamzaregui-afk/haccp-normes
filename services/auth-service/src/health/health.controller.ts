import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  // ARCH-DECISION: Exposed at GET /health (no /api/v1 prefix) so nginx can
  // proxy_pass directly and Docker/k8s probes stay simple. The duplicate
  // auth health route inside AuthController (@Controller('auth') + @Get('health'))
  // resolves to /auth/health which is different — only THIS one is used by nginx.
  @Get('health')
  health() {
    return { status: 'ok', uptime: process.uptime(), version: '0.1.0' };
  }
}
