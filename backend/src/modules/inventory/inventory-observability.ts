import { HttpException } from '@nestjs/common';
import { failureCode } from '../../shared/logging/http-observability';

const OPERATIONS = new Set(['scheduler', 'owner_validation', 'load_settings', 'stock_count', 'target_proposal', 'purchase_order_drafts', 'persist_history', 'run']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type InventoryOperation = 'scheduler' | 'owner_validation' | 'load_settings' | 'stock_count' | 'target_proposal' | 'purchase_order_drafts' | 'persist_history' | 'run';
interface AutomationDiagnostic {
  runId: string;
  scheduled: boolean;
  operation: InventoryOperation;
  outcome: 'succeeded' | 'failed' | 'disabled';
  durationMs: number;
  error?: unknown;
  reason?: 'missing_owner' | 'partial_failure';
}

/**
 * @cc [owner:nareshshah139,label:security] inventory-diagnostic-privacy
 * Emit only a UUID run reference, fixed operation/outcome/error categories, timing and safe
 * HTTP/Prisma codes. Never emit actor, branch, document or supplier identifiers, payloads,
 * exception messages or stacks. Invalid metadata and sink failures MUST NOT affect inventory work.
 */
export function logInventoryAutomation(
  entry: AutomationDiagnostic,
  sink: (line: string) => unknown = line => process.stdout.write(line),
): void {
  try {
    if (typeof entry.runId !== 'string' || !UUID.test(entry.runId) || !OPERATIONS.has(entry.operation) ||
        !['succeeded', 'failed', 'disabled'].includes(entry.outcome)) return;
    const status = entry.error instanceof HttpException ? entry.error.getStatus() : undefined;
    const code = (entry.error as { code?: unknown })?.code;
    const failed = entry.outcome === 'failed';
    const reason = ['missing_owner', 'partial_failure'].includes(entry.reason || '') ? entry.reason : undefined;
    sink(JSON.stringify({
      timestamp: new Date().toISOString(), service: 'clinic-backend', version: 1,
      level: failed ? 'error' : 'info', event: 'inventory.automation',
      runId: entry.runId, scheduled: entry.scheduled === true,
      operation: entry.operation, outcome: entry.outcome,
      durationMs: Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : 0,
      ...(failed ? { errorCode: reason || (status ? failureCode(status) : 'operation_failed') } : {}),
      ...(failed && Number.isInteger(status) && status! >= 400 && status! <= 599 ? { status } : {}),
      ...(failed && typeof code === 'string' && /^P[0-9]{4}$/.test(code) ? { databaseCode: code } : {}),
    }) + '\n');
  } catch {
    // Observability must not interrupt stock operations or mask their original errors.
  }
}
