/** The only credential a task-link route accepts; built by PortalGuard and nowhere else (PP-84). */
export type TaskLinkPrincipal = {
  readonly kind: 'task-link';
  readonly linkId: string;
  readonly patientId: string;
  readonly branchId: string;
  /** The link's check-ins that are OPEN right now. */
  readonly checkInIds: readonly string[];
};

/** A signed-in phone before a profile is chosen: it may list and choose profiles, and read nothing. */
export type PortalIdentityPrincipal = {
  readonly kind: 'portal-identity';
  readonly sessionId: string;
  readonly identityId: string;
  readonly phoneE164: string;
};

/** A signed-in phone with a profile chosen: it reads and writes only that patient's rows (OwnDataOnly). */
export type PortalPatientPrincipal = {
  readonly kind: 'portal-patient';
  readonly sessionId: string;
  readonly identityId: string;
  readonly patientId: string;
  readonly branchId: string;
};

export type PortalPrincipal = TaskLinkPrincipal | PortalIdentityPrincipal | PortalPatientPrincipal;

export const PRINCIPAL = Symbol('portal-principal');
export type PortalRequest = { body?: unknown; method?: string; headers: Record<string, string | string[] | undefined>; [PRINCIPAL]?: PortalPrincipal };
