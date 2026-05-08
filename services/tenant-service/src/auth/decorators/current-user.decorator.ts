import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@haccp/shared-types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<{ user: JwtPayload }>().user,
);
