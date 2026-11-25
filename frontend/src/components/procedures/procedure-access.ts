'use client';

import { useEffect, useState } from 'react';
import { UserRole } from '@cms/shared-types';
import { apiClient } from '@/lib/api';

/** Mirrors backend procedure-access.ts: the server decides, these only shape the menu and the settings dialog. */
export const GRANTABLE_RECORD_ROLES: string[] = [UserRole.NURSE, UserRole.MANAGER];
const PROCEDURE_VIEW_ROLES: string[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DOCTOR, UserRole.MANAGER];
export const PROCEDURE_MENU_ROLES = [...new Set([...PROCEDURE_VIEW_ROLES, ...GRANTABLE_RECORD_ROLES])];
export const PROCEDURES_PATH = '/dashboard/procedures';

export interface ProcedureAccess {
  recordRoles: string[];
}

export interface MyProcedureAccess {
  canRecord: boolean;
  canConfigure: boolean;
}

/** Whether the menu offers Procedures: always to roles that view it, to other roles only while they may record. */
export function useProcedureMenu(role: string | undefined): boolean {
  const viewer = !!role && PROCEDURE_VIEW_ROLES.includes(role);
  const grantable = !!role && GRANTABLE_RECORD_ROLES.includes(role);
  const [mayRecord, setMayRecord] = useState(false);

  useEffect(() => {
    if (viewer || !grantable) return;
    let current = true;
    apiClient.getMyProcedureAccess()
      .then((access) => { if (current) setMayRecord(access.canRecord); })
      .catch(() => { if (current) setMayRecord(false); });
    return () => { current = false; };
  }, [viewer, grantable]);

  return viewer || (grantable && mayRecord);
}
