/** The only credential a task-link route accepts; built by PortalGuard and nowhere else (PP-84). */
export type TaskLinkPrincipal = {
  readonly kind: 'task-link';
  readonly linkId: string;
  readonly patientId: string;
  readonly branchId: string;
  /** The link's check-ins that are OPEN right now. */
  readonly checkInIds: readonly string[];
};

export const PRINCIPAL = Symbol('portal-principal');
export type PortalRequest = { body?: unknown; [PRINCIPAL]?: TaskLinkPrincipal };
