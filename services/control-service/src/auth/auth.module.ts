import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantContextGuard } from './guards/tenant-context.guard';
import { ModuleGuard } from './guards/module.guard';

@Module({
  imports: [PassportModule],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard, TenantContextGuard, ModuleGuard],
  exports: [JwtAuthGuard, RolesGuard, TenantContextGuard, ModuleGuard],
})
export class AuthModule {}
