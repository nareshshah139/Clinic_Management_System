import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../../modules/auth/auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

class Routes {
  @Public() publicHandler() {}
  @SetMetadata('isPublic', false) explicitlyPrivate() {}
  privateHandler() {}
}

@Public()
class PublicRoutes {
  inherited() {}
}

describe('JwtAuthGuard', () => {
  const passport = Object.getPrototypeOf(JwtAuthGuard.prototype);
  let tokenCheck: jest.SpyInstance;
  beforeEach(() => {
    tokenCheck = jest.spyOn(passport, 'canActivate').mockReturnValue(false);
  });
  afterEach(() => tokenCheck.mockRestore());

  const run = (target: any, method: string) =>
    new JwtAuthGuard(new Reflector()).canActivate({
      getHandler: () => target.prototype[method],
      getClass: () => target,
    } as unknown as ExecutionContext);

  it.each([
    [Routes, 'publicHandler'],
    [PublicRoutes, 'inherited'],
  ])('skips token validation on %p.%s', (target, method) => {
    expect(run(target, method)).toBe(true);
    expect(tokenCheck).not.toHaveBeenCalled();
  });

  it.each(['privateHandler', 'explicitlyPrivate'])(
    'requires a valid token on %s',
    (method) => {
      expect(run(Routes, method)).toBe(false);
      expect(tokenCheck).toHaveBeenCalledTimes(1);
      tokenCheck.mockReturnValue(true);
      expect(run(Routes, method)).toBe(true);
    },
  );
});
