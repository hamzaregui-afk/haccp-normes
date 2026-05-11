import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  // ARCH-DECISION: Override handleRequest so that any error thrown by
  // LocalStrategy.validate() (e.g. UnauthorizedError from shared-errors, which
  // is NOT a NestJS HttpException) is converted into a proper HTTP 401 instead
  // of leaking as a generic HTTP 500 through AllExceptionsFilter.
  handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return user;
  }
}
