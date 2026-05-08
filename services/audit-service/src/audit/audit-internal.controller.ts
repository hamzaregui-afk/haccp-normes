/**
 * audit-internal.controller.ts
 *
 * Internal service-to-service endpoint for appending audit log entries.
 *
 * ARCH-DECISION: This controller is intentionally NOT protected by JwtAuthGuard.
 * It uses a pre-shared `X-Internal-Secret` header instead. The api-gateway does
 * NOT forward requests to /internal/**, so this endpoint is only reachable from
 * within the Docker network (other microservices calling audit-service directly).
 *
 * This avoids the circular dependency:
 *   service → audit-service → validate JWT → auth-service → ...
 *
 * In production, combine with Docker network policies / service mesh mTLS.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';

import { env } from '../config/env';
import { CreateAuditLogDtoSchema } from './dto/audit.dto';
import { AuditService } from './audit.service';

@Controller('internal/audit')
export class AuditInternalController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * POST /internal/audit
   *
   * Called by other microservices to append an immutable audit entry.
   * Requires the `X-Internal-Secret` header to match the configured secret.
   * The `tenantId` is passed in the body (extracted from the JWT by the caller).
   */
  @Post()
  @HttpCode(201)
  create(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: unknown,
  ) {
    if (secret !== env.INTERNAL_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid internal service secret');
    }

    const { tenantId, ...dto } = (body as Record<string, unknown>);
    const parsed = CreateAuditLogDtoSchema.parse(dto);

    return this.auditService.log(parsed, String(tenantId ?? 'system'));
  }
}
