import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { emitAuditEvent } from '@haccp/shared-utils';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSubscriptionDtoSchema, UpdateSubscriptionDtoSchema } from './subscription.dto';
import { SubscriptionService } from './subscription.service';

@Controller('tenants/:id/subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  getSubscription(@Param('id') id: string) {
    return this.subscriptionService.getSubscription(id);
  }

  @Post()
  async createSubscription(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: JwtPayload,
  ) {
    const dto    = CreateSubscriptionDtoSchema.parse(body);
    const result = await this.subscriptionService.upsertSubscription(id, dto);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'CREATE',
      resource:   'tenant_subscriptions',
      resourceId: id,
      tenantId:   actor.tenantId,
      payload:    { plan: dto.plan },
    });

    return result;
  }

  @Patch()
  async updateSubscription(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: JwtPayload,
  ) {
    const dto    = UpdateSubscriptionDtoSchema.parse(body);
    const result = await this.subscriptionService.upsertSubscription(id, dto);

    void emitAuditEvent({
      userId:     actor.sub,
      action:     'UPDATE',
      resource:   'tenant_subscriptions',
      resourceId: id,
      tenantId:   actor.tenantId,
    });

    return result;
  }
}
