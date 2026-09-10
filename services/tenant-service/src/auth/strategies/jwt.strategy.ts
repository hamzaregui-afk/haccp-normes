import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  JwtPayloadSchema,
  type JwtPayload,
  SELECTED_TENANT_HEADER,
  resolveRequestTenantId,
} from '@haccp/shared-types';
import { env } from '../../config/env';

/** Minimal request shape — avoids depending on @types/express in every service. */
interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
      // ARCH-DECISION: passReqToCallback lets us honour the X-Selected-Tenant
      // header (SUPER_ADMIN cockpit) at the ONE chokepoint every authenticated
      // request passes through, so @CurrentUser().tenantId is the *effective*
      // tenant everywhere — no per-controller migration, no missed endpoint.
      // NB: tenant-service management routes (/tenants, /tenants/:id) scope by
      // explicit :id params, NOT user.tenantId, so they are unaffected; only
      // /sites & /zones (user.tenantId-scoped) follow the selected tenant.
      passReqToCallback: true,
    });
  }

  validate(req: RequestWithHeaders, payload: unknown): JwtPayload {
    // Runtime validation — never trust raw JWT payload shape.
    const parsed = JwtPayloadSchema.parse(payload);
    // Honour the selection header for SUPER_ADMIN only; every other role is
    // scoped to its own JWT tenant and the header is ignored (never throws, so
    // a stray header cannot widen scope or trigger a 401 → refresh → logout).
    const tenantId = resolveRequestTenantId(parsed, req.headers[SELECTED_TENANT_HEADER]);
    return { ...parsed, tenantId };
  }
}
