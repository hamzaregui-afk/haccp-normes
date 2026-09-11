import { SetMetadata } from '@nestjs/common';
import { MODULE_KEY } from '../guards/module.guard';

/**
 * @RequireModule('HACCP_CONTROLS')
 *
 * Marks a route as requiring a specific tenant module to be enabled.
 * Must be used alongside @UseGuards(JwtAuthGuard, ModuleGuard).
 *
 * SUPER_ADMIN bypasses this check — see ModuleGuard.
 */
export const RequireModule = (moduleKey: string) => SetMetadata(MODULE_KEY, moduleKey);
