import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const AUTHENTICATED_KEY = 'allowAuthenticated';
/**
 * @cc [owner:nareshshah139,label:security] authenticated-route-scope
 * Routes using this policy MUST be intentionally shared or enforce ownership independently.
 */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);
