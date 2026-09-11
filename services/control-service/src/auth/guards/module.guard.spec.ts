import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleGuard, MODULE_KEY } from './module.guard';

/** Minimal ExecutionContext stub exposing a handler/class + a request with `user`. */
function ctx(user: Record<string, unknown> | undefined) {
  return {
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({
      getRequest: () => ({ user, method: 'GET', url: '/x' }),
    }),
  } as never;
}

function guardWithRequired(required: string | undefined): ModuleGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  return new ModuleGuard(reflector);
}

describe('ModuleGuard (staged enforcement)', () => {
  const OLD = process.env['MODULE_ENFORCEMENT'];
  afterEach(() => { process.env['MODULE_ENFORCEMENT'] = OLD; });

  it('allows when the route declares no required module', () => {
    process.env['MODULE_ENFORCEMENT'] = 'strict';
    const g = guardWithRequired(undefined);
    expect(g.canActivate(ctx({ role: 'OPERATOR', allowedModules: [] }))).toBe(true);
  });

  it('allows everything when MODULE_ENFORCEMENT=off', () => {
    process.env['MODULE_ENFORCEMENT'] = 'off';
    const g = guardWithRequired('HACCP_CONTROLS');
    expect(g.canActivate(ctx({ role: 'OPERATOR', allowedModules: [] }))).toBe(true);
  });

  it('SUPER_ADMIN always bypasses the module gate (even in strict)', () => {
    process.env['MODULE_ENFORCEMENT'] = 'strict';
    const g = guardWithRequired('HACCP_CONTROLS');
    expect(g.canActivate(ctx({ role: 'SUPER_ADMIN', tenantId: 'platform', allowedModules: [] }))).toBe(true);
  });

  it('allows a tenant that HAS the module', () => {
    process.env['MODULE_ENFORCEMENT'] = 'strict';
    const g = guardWithRequired('HACCP_CONTROLS');
    expect(g.canActivate(ctx({ role: 'ADMIN', tenantId: 't1', sub: 'u1', allowedModules: ['HACCP_CONTROLS'] }))).toBe(true);
  });

  it('log mode ALLOWS a tenant missing the module (safe staged default)', () => {
    process.env['MODULE_ENFORCEMENT'] = 'log';
    const g = guardWithRequired('HACCP_CONTROLS');
    expect(g.canActivate(ctx({ role: 'ADMIN', tenantId: 't1', sub: 'u1', allowedModules: ['DLC'] }))).toBe(true);
  });

  it('defaults to log (allow) when MODULE_ENFORCEMENT is unset', () => {
    delete process.env['MODULE_ENFORCEMENT'];
    const g = guardWithRequired('HACCP_CONTROLS');
    expect(g.canActivate(ctx({ role: 'ADMIN', tenantId: 't1', sub: 'u1', allowedModules: [] }))).toBe(true);
  });

  it('strict mode BLOCKS a tenant missing the module', () => {
    process.env['MODULE_ENFORCEMENT'] = 'strict';
    const g = guardWithRequired('HACCP_CONTROLS');
    expect(() => g.canActivate(ctx({ role: 'ADMIN', tenantId: 't1', sub: 'u1', allowedModules: ['DLC'] }))).toThrow(ForbiddenException);
  });

  it('reads the required module from handler+class metadata', () => {
    process.env['MODULE_ENFORCEMENT'] = 'off';
    const reflector = new Reflector();
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('HACCP_CONTROLS');
    new ModuleGuard(reflector).canActivate(ctx({ role: 'ADMIN' }));
    expect(spy).toHaveBeenCalledWith(MODULE_KEY, ['h', 'c']);
  });
});
