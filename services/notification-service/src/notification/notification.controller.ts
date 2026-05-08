import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateNotificationDtoSchema,
  MarkReadDtoSchema,
  NotificationQuerySchema,
} from './dto/notification.dto';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /** Internal — allows ADMIN/MANAGER/SUPER_ADMIN to push notifications. */
  @Post()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN')
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.notificationService.create(
      CreateNotificationDtoSchema.parse(body),
      user.tenantId,
    );
  }

  /** Returns the calling user's notifications (scoped by JWT sub). */
  @Get()
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  findMine(@CurrentUser() user: JwtPayload, @Query() query: unknown) {
    return this.notificationService.findForUser(
      user.sub,
      user.tenantId,
      NotificationQuerySchema.parse(query),
    );
  }

  /** Mark a list of notification IDs as read. */
  @Patch('read')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  markRead(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.notificationService.markRead(MarkReadDtoSchema.parse(body), user.tenantId);
  }

  @Get('unread-count')
  @Roles('ADMIN', 'MANAGER', 'SUPER_ADMIN', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  countUnread(@CurrentUser() user: JwtPayload) {
    return this.notificationService.countUnread(user.sub, user.tenantId);
  }
}
