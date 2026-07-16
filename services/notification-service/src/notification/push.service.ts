import { Injectable } from '@nestjs/common';

import { DeviceService } from './device.service';
import { ExpoPushService, type ExpoPushMessage } from './expo-push.service';

/**
 * Orchestrates targeted push delivery: resolve device tokens → send via Expo →
 * purge any tokens Expo reports as dead. Consumed by NotificationConsumer as a
 * fire-and-forget side-effect of domain events (never on the request path).
 */
@Injectable()
export class PushService {
  constructor(
    private readonly devices: DeviceService,
    private readonly expo:    ExpoPushService,
  ) {}

  async pushToUser(tenantId: string, userId: string, message: ExpoPushMessage): Promise<void> {
    await this.dispatch(await this.devices.tokensForUser(tenantId, userId), message);
  }

  async pushToRoles(tenantId: string, roles: string[], message: ExpoPushMessage): Promise<void> {
    await this.dispatch(await this.devices.tokensForRoles(tenantId, roles), message);
  }

  private async dispatch(tokens: string[], message: ExpoPushMessage): Promise<void> {
    if (tokens.length === 0) return;
    const invalid = await this.expo.send(tokens, message);
    await this.devices.purgeTokens(invalid);
  }
}
