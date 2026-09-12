import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
// Every argument is required; an array accepts any one of its alternatives.
export type PermissionRequirement = string | readonly string[];
export const Permissions = (...permissions: PermissionRequirement[]) => SetMetadata(PERMISSIONS_KEY, permissions);
