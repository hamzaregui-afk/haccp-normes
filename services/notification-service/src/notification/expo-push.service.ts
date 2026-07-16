import { Injectable, Logger } from '@nestjs/common';

import { env } from '../config/env';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo accepts up to 100 messages per request

export interface ExpoPushMessage {
  title: string;
  body:  string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status:  'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Thin client for the Expo Push API. Expo relays to APNs (iOS) and FCM (Android),
 * so this service holds no platform credentials. Returns the tokens Expo reports
 * as permanently invalid (DeviceNotRegistered) so the caller can purge them.
 *
 * ARCH-DECISION: A push send must NEVER break the domain-event pipeline. All
 * failures are swallowed + logged; the method resolves with the invalid-token
 * list (possibly empty) and never throws.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  async send(tokens: string[], message: ExpoPushMessage): Promise<string[]> {
    const valid = tokens.filter((t) => t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'));
    if (valid.length === 0) return [];

    const invalidTokens: string[] = [];

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batchTokens = valid.slice(i, i + BATCH_SIZE);
      const body = batchTokens.map((to) => ({
        to,
        title: message.title,
        body:  message.body,
        data:  message.data ?? {},
        sound: 'default',
      }));

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (env.EXPO_ACCESS_TOKEN) headers['Authorization'] = `Bearer ${env.EXPO_ACCESS_TOKEN}`;

        const res = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          this.logger.warn(`Expo push HTTP ${res.status} for ${batchTokens.length} tokens`);
          continue;
        }

        const json = (await res.json()) as { data?: ExpoTicket[] };
        const tickets = json.data ?? [];
        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const badToken = batchTokens[idx];
            if (badToken) invalidTokens.push(badToken);
          }
        });
      } catch (err) {
        this.logger.warn(`Expo push send failed: ${String(err)}`);
      }
    }

    return invalidTokens;
  }
}
