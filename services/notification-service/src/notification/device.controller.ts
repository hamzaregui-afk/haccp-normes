import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DeviceService } from './device.service';
import { RegisterDeviceDtoSchema, UnregisterDeviceDtoSchema } from './dto/device.dto';

// Any authenticated role may register its own device for push. tenantId/userId/
// role always come from the JWT, never the body (tenant isolation).
@Controller('notifications/devices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  register(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = RegisterDeviceDtoSchema.parse(body);
    return this.deviceService.register(user.tenantId, user.sub, user.role, dto);
  }

  @Delete()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'QUALITY_OFFICER', 'OPERATOR', 'VIEWER')
  unregister(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const dto = UnregisterDeviceDtoSchema.parse(body);
    return this.deviceService.unregister(user.tenantId, dto.expoPushToken);
  }
}
