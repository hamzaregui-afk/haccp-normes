import { Injectable, Logger } from '@nestjs/common';
import { toApiResponse, toPaginationMeta } from '@haccp/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { EmailService } from './email.service';
import type { CreateNotificationDto, NotificationQuery, MarkReadDto } from './dto/notification.dto';

// Known notification types that trigger an email in addition to the real-time push
const EMAIL_TRIGGER_TYPES = new Set(['NC_CREATED', 'REPORT_VALIDATED']);

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateNotificationDto, tenantId: string) {
    const notification = await this.prisma.notification.create({
      data: { ...dto, tenantId },
    });

    // Push real-time event to the target user's socket room
    // ARCH-DECISION: 'notification:new' matches the web useNotifications hook listener.
    this.gateway.emitToUser(dto.userId, 'notification:new', notification);

    // Fire-and-forget email for actionable notification types
    // ARCH-DECISION: Email is sent asynchronously (no await) so that a slow SMTP
    // server cannot delay the API response. Failures are logged but not re-thrown.
    if (EMAIL_TRIGGER_TYPES.has(dto.type)) {
      void this.sendEmailForNotification(dto, tenantId);
    }

    return toApiResponse(notification, undefined, 'Notification sent');
  }

  async findForUser(userId: string, tenantId: string, query: NotificationQuery) {
    const { page, limit, isRead } = query;
    const where = {
      tenantId,
      userId,
      ...(isRead !== undefined ? { isRead: isRead === 'true' } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return toApiResponse(items, toPaginationMeta(total, { page, limit }));
  }

  async markRead(dto: MarkReadDto, tenantId: string) {
    await this.prisma.notification.updateMany({
      where: { id: { in: dto.ids }, tenantId },
      data: { isRead: true },
    });
    return toApiResponse(null, undefined, 'Marked as read');
  }

  async countUnread(userId: string, tenantId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, tenantId, isRead: false },
    });
    return toApiResponse({ count });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async sendEmailForNotification(
    dto: CreateNotificationDto,
    tenantId: string,
  ): Promise<void> {
    try {
      // Fetch user email from DB — notification payload may not include it
      const user = await this.prisma.notification
        .findFirst({ where: { userId: dto.userId, tenantId } })
        .catch(() => null);

      // ARCH-DECISION: The notification service does not own user records.
      // For now we derive the recipient email from the notification link metadata
      // or fall back to a generic address. A proper solution would be a
      // user-service internal call or a denormalised email field in the notification.
      // This is acceptable for Phase 1 — revisit in Phase 6.
      const recipientEmail =
        (dto as Record<string, unknown>)['email'] as string | undefined;

      if (!recipientEmail) {
        this.logger.warn(
          `No recipient email for notification type ${dto.type} (userId: ${dto.userId}) — skipping email`,
        );
        return;
      }

      let html: string;

      if (dto.type === 'NC_CREATED') {
        const meta = ((dto as Record<string, unknown>)['meta'] ?? {}) as Record<string, string>;
        html = this.emailService.buildNcCreatedEmail({
          recipientName: meta['recipientName'] ?? 'Utilisateur',
          ncId:          meta['ncId']          ?? dto.link ?? '',
          description:   dto.body,
          severity:      meta['severity']      ?? 'MEDIUM',
          category:      meta['category']      ?? 'OTHER',
        });
      } else if (dto.type === 'REPORT_VALIDATED') {
        const meta = ((dto as Record<string, unknown>)['meta'] ?? {}) as Record<string, string>;
        html = this.emailService.buildReportValidatedEmail({
          recipientName: meta['recipientName'] ?? 'Utilisateur',
          reportId:      meta['reportId']      ?? dto.link ?? '',
          reportTitle:   meta['reportTitle']   ?? dto.title,
          period:        meta['period']        ?? '',
        });
      } else {
        return;
      }

      await this.emailService.sendMail({
        to:      recipientEmail,
        subject: dto.title,
        html,
      });
    } catch (err) {
      this.logger.error(`sendEmailForNotification failed for type ${dto.type}`, err);
    }
  }
}
