import { workflowKinds } from './workspace-model';

export type DocumentReference =
  | { kind: 'saved'; id: string }
  | { kind: 'invoice'; id: string }
  | { kind: 'request'; requestKey: string; creation: any };
export type DocumentKnowledge =
  | { state: 'new' }
  | { state: 'loading' | 'load-failed'; ref: DocumentReference }
  | { state: 'known'; document: any }
  | { state: 'unconfirmed'; ref: DocumentReference; operation: 'create' | 'save' | 'transition'; lastKnown?: any };
export type DocumentPresentation = {
  heading: string;
  happened: string;
  stockEffect: 'unknown' | 'unchanged' | 'changed' | 'recorded';
  stockExplanation: string;
  recovery: string;
  canMutate: boolean;
  canEdit: boolean;
  checkLabel: string | null;
  primaryLabel: string;
  primaryAction: string | null;
  auditRecovery?: boolean;
};

export const supportedWorkflowStatuses = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'CHALLAN', 'POSTED', 'PART_RECEIVED', 'RECEIVED', 'RELEASED', 'REVERSED', 'ORDERED', 'CONVERTED', 'CANCELLED', 'REJECTED', 'SENT', 'PART_REVIEWED'] as const;
/**
 * @cc [owner:nareshshah139] workflow-status-kind-boundary
 * Status combinations that this workflow cannot produce MUST remain unknown and nonmutating,
 * rather than inheriting another workflow's stock explanation.
 */
export function workflowStatusSupported(kind: string, status: string): boolean {
  if (!workflowKinds[kind] || !supportedWorkflowStatuses.includes(status as any)) return false;
  const restricted: Record<string, string[]> = {
    CHALLAN: ['SUPPLIER_RETURN'], SENT: ['PURCHASE_ORDER'], PART_REVIEWED: ['TARGET_REVIEW'], PART_RECEIVED: ['PURCHASE_ORDER', 'SHORTBOOK'], RECEIVED: ['PURCHASE_ORDER', 'SHORTBOOK'],
    RELEASED: ['HOLD', 'SALES_RETURN'], ORDERED: ['SHORTBOOK'], CONVERTED: ['QUOTATION'],
  };
  if (restricted[status]) return restricted[status].includes(kind);
  if (status === 'POSTED' && ['PURCHASE_ORDER', 'SHORTBOOK', 'QUOTATION'].includes(kind)) return false;
  if (status === 'REVERSED' && ['PURCHASE_ORDER', 'SHORTBOOK', 'QUOTATION', 'CORRECTION', 'TARGET_REVIEW'].includes(kind)) return false;
  return true;
}

const noStockKinds = new Set(['PURCHASE_ORDER', 'SHORTBOOK', 'QUOTATION', 'GATE_PASS', 'CREDIT_NOTE', 'TARGET_REVIEW']);
const statusNames: Record<string, string> = {
  DRAFT: 'Draft', AWAITING_APPROVAL: 'Awaiting manager approval', APPROVED: 'Approved', CHALLAN: 'Return challan saved', POSTED: 'Posted', PART_RECEIVED: 'Part received', RECEIVED: 'Received in full', RELEASED: 'Hold released', REVERSED: 'Reversed', ORDERED: 'Purchase order created', CONVERTED: 'Sale draft created', CANCELLED: 'Cancelled', REJECTED: 'Rejected', SENT: 'Recorded as sent', PART_REVIEWED: 'Partly reviewed',
};

/**
 * @cc [owner:nareshshah139] document-certainty-controls
 * An unresolved operation or failed existing-record lookup MUST suppress mutation controls and
 * all no-stock-change assurances, retain a status-check action, and explain the unknown outcome.
 */
/**
 * @cc [owner:nareshshah139] document-state-explanation
 * Known workflow states MUST explain their recorded stock effect and an available next action
 * or authorized handoff. A fresh count MUST preserve history and clear earlier observations.
 */
export function workflowDocumentPresentation(kind: string, knowledge: DocumentKnowledge, authority: { write: boolean; approve?: boolean }): DocumentPresentation {
  const base = { canMutate: false, canEdit: false, primaryAction: null as string | null, primaryLabel: workflowKinds[kind]?.primary || 'Review document' };
  if (knowledge.state === 'loading' || knowledge.state === 'load-failed' || knowledge.state === 'unconfirmed') {
    return { ...base, heading: knowledge.state === 'load-failed' ? 'Saved record unavailable' : knowledge.state === 'loading' ? 'Checking saved record' : 'Outcome not confirmed',
      happened: knowledge.state === 'load-failed' ? 'The existing record could not be loaded. This is not a new draft.' : knowledge.state === 'unconfirmed' && knowledge.operation === 'create' ? 'Saving this new document was interrupted before its outcome was confirmed.' : knowledge.state === 'unconfirmed' && knowledge.operation === 'save' ? 'Saving changes to this document was interrupted before its outcome was confirmed.' : 'The requested document action has not been confirmed.',
      stockEffect: 'unknown', stockExplanation: 'We could not confirm whether this operation changed stock. Check the saved status before retrying.',
      recovery: 'Keep this reference and the original evidence. If access is unavailable, ask an authorized inventory colleague to check the saved record.',
      checkLabel: knowledge.state === 'load-failed' ? 'Retry loading' : 'Check saved status' };
  }
  const doc = knowledge.state === 'known' ? knowledge.document : null;
  const status = doc?.status || 'DRAFT';
  if (!workflowStatusSupported(kind, status)) {
    return { ...base, heading: 'Status needs review', happened: 'This saved status is not supported by this screen.', stockEffect: 'unknown', stockExplanation: 'The stock outcome cannot be established from this status.', recovery: 'Check saved status and share the record reference with an inventory administrator.', checkLabel: 'Check saved status' };
  }
  const result: DocumentPresentation = { ...base, heading: doc ? statusNames[status] : 'Unsaved draft', happened: '', stockEffect: 'recorded', stockExplanation: '', recovery: '', canMutate: authority.write, canEdit: authority.write && ['DRAFT', 'CHALLAN'].includes(status), checkLabel: null };
  if (authority.write && !['CORRECTION', 'TARGET_REVIEW'].includes(kind)) {
    result.primaryAction = status === 'DRAFT' ? ({ SUPPLIER_RETURN: 'CHALLAN', PURCHASE_ORDER: 'SUBMIT', SHORTBOOK: 'CREATE_PO', QUOTATION: 'CONVERT_SALE' } as Record<string, string>)[kind] || 'POST' : status === 'CHALLAN' ? 'POST' : status === 'AWAITING_APPROVAL' && authority.approve ? 'APPROVE' : status === 'APPROVED' && kind !== 'PURCHASE_ORDER' ? ({ SHORTBOOK: 'CREATE_PO', QUOTATION: 'CONVERT_SALE' } as Record<string, string>)[kind] || 'POST' : null;
  }
  const unchanged = (text: string) => { result.stockEffect = 'unchanged'; result.stockExplanation = text; };
  const countRecovery = 'Start fresh count retains this record and its history, clears earlier observations, and uses current balances. Physically recount before submitting.';
  if (status === 'DRAFT') {
    result.happened = kind === 'COUNT' ? 'This count is a draft. Submitting can apply the count immediately or may require approval under the saved inventory policy.' : 'This document is a draft. Review its details and the available recovery actions.';
    unchanged('This draft has not changed stock.');
    result.recovery = kind === 'COUNT' ? countRecovery : `Correct the draft, then choose ${result.primaryLabel}.`;
  } else if (status === 'AWAITING_APPROVAL') {
    result.happened = 'This document is waiting for manager approval. Stock has not changed. Approval is required by the workflow or count variance policy.';
    unchanged('No stock effect has been posted by this document.');
    result.primaryLabel = 'Approve document';
    result.recovery = authority.approve ? 'Choose Approve document or Reject proposal after checking the evidence.' : 'Ask a manager with approval permission to review this document. Approval alone does not apply a count.';
  } else if (status === 'APPROVED') {
    result.happened = kind === 'COUNT' ? 'This count is approved. Stock has not changed. Apply approved count updates the recorded quantities to the verified observations.' : 'This document is approved and ready for its next action.';
    unchanged('Approval itself has not changed stock.');
    result.primaryLabel = kind === 'COUNT' ? 'Apply approved count' : result.primaryLabel;
    result.recovery = kind === 'PURCHASE_ORDER' ? 'Receive actual goods through an inward challan linked to this order.' : `Choose ${result.primaryLabel} when the evidence is complete.`;
  } else if (status === 'REJECTED') {
    result.happened = 'This proposal was rejected and did not change stock.';
    unchanged('Rejection retained the proposal and its review history.');
    const rejectedEvent = [...(doc?.events || [])].reverse().find((event: any) => event.toStatus === 'REJECTED' && (event.detail?.reason || event.reason));
    const reason = rejectedEvent?.detail?.reason || rejectedEvent?.reason;
    if (reason) result.happened += ` Reason: ${reason}`;
    result.recovery = kind === 'COUNT' ? countRecovery : 'Review the rejection reason and create a corrected document from the document list.';
  } else if (status === 'CANCELLED') {
    const priorChallan = kind === 'SUPPLIER_RETURN';
    const demandOrOrder = ['PURCHASE_ORDER', 'SHORTBOOK'].includes(kind);
    result.happened = demandOrOrder ? 'The remaining order or demand was cancelled. Any earlier receipts and their stock effects are retained.' : priorChallan ? 'This supplier return was cancelled. If stock had already been sent on a challan, cancellation records its compensation; review the retained movements before another return.' : 'This document was cancelled and did not change stock.';
    if (demandOrOrder) result.stockExplanation = 'Cancelling the remainder does not reverse goods already received. Review linked receipts before replacing the order.';
    else if (!priorChallan) unchanged('The cancelled document cannot be posted.');
    else result.stockExplanation = 'Earlier stock movements remain in the history. Check the saved compensation before starting another return.';
    result.recovery = kind === 'COUNT' ? countRecovery : kind === 'SHORTBOOK' ? 'Open the linked purchase order and check its receipts before creating any replacement demand.' : kind === 'PURCHASE_ORDER' ? 'Review linked receipts and create a new order only for verified outstanding demand.' : 'Review the retained evidence, then create a new document if a corrected transaction is needed.';
  } else if (status === 'REVERSED') {
    if (noStockKinds.has(kind)) {
      result.happened = kind === 'CREDIT_NOTE' ? 'The supplier credit was reversed. Its original accounting record and reversal remain in the history.' : 'The delivery record was reversed. Its original record and correction remain in the history.';
      unchanged('Neither the original document nor its reversal changed physical stock.');
    } else {
      result.happened = 'A linked reversal compensated the original recorded effects. Both the original and compensation remain in the history.';
      result.stockExplanation = 'Reversal does not erase earlier stock movements. The saved stock effects show the quantities compensated.';
    }
    result.recovery = kind === 'COUNT' ? countRecovery : 'Check the linked correction and current batch balance before creating a corrected transaction.';
  } else if (status === 'CHALLAN') {
    result.happened = 'Stock has already been sent back to the supplier on this return challan.';
    result.stockEffect = 'changed'; result.stockExplanation = 'Finalising the supplier credit does not return the same stock a second time.';
    result.primaryLabel = 'Finalise supplier credit'; result.recovery = 'Choose Finalise supplier credit to record the credit, or Cancel document if the recorded return must be compensated.';
  } else if (status === 'RELEASED') {
    result.happened = 'Held units were released for use. Release changed availability while physical quantity stayed unchanged by the release.';
    result.stockEffect = 'changed'; result.stockExplanation = 'The original receipt or hold remains in history; review current available and held quantities.';
    result.recovery = kind === 'HOLD' ? 'Inspect the batch balance. Use Counts & audit with a colleague who has stock count permission if the physical quantity is wrong; create a new verified hold only for units that must still be blocked.' : 'Inspect the batch balance. Ask a manager to use Correct by reversal if the original customer return needs correction.';
    result.auditRecovery = kind === 'HOLD';
  } else if (status === 'PART_RECEIVED' || status === 'RECEIVED') {
    result.happened = kind === 'SHORTBOOK'
      ? status === 'PART_RECEIVED' ? "Demand on this shortbook is partly received through its linked purchase order. The order's receipts record the actual stock increases." : "Demand on this shortbook is received in full through its linked purchase order. The order's receipts record the actual stock increases."
      : status === 'PART_RECEIVED' ? 'This order is partly received. Linked receipts contain the actual stock increases.' : 'This order is received in full. Linked receipts contain the actual stock increases.';
    result.stockExplanation = 'Demand and order records do not add stock themselves; each posted linked receipt records the goods received.';
    result.recovery = kind === 'SHORTBOOK' ? 'Open the linked purchase order to review its receipts and any outstanding quantities. Share its reference with a colleague who has purchase-order access if needed. Do not receive the same goods again.' : status === 'PART_RECEIVED' ? 'Review linked receipts and receive only the outstanding goods through another linked inward challan.' : 'Review linked receipts before any correction. Do not receive the same goods again.';
  } else if (status === 'SENT') {
    result.happened = 'This order is recorded as sent. Verify the saved delivery evidence with the supplier.';
    result.stockExplanation = 'Sending an order does not add stock. Only posted receipts record goods actually received.';
    result.recovery = 'Review linked receipts, then receive only real outstanding goods through an inward challan linked to this order.';
  } else if (status === 'PART_REVIEWED') {
    result.happened = 'Some reorder proposal lines have been reviewed. Accepted lines changed reorder targets; remaining lines still need review.';
    unchanged('Reviewing reorder targets does not change physical stock.');
  } else if (status === 'ORDERED' || status === 'CONVERTED') {
    result.happened = status === 'ORDERED' ? 'A purchase order was created. Stock is unchanged by this conversion.' : 'A sale draft was created. Stock is unchanged by this conversion.';
    unchanged('Conversion does not post or reserve stock.');
    result.recovery = status === 'ORDERED' ? 'Open the linked purchase order to continue approval and receiving.' : 'Open the linked sale draft to review the batch and complete the sale.';
  } else if (status === 'POSTED') {
    const effects: any[] = doc?.effects || [];
    const changes = effects.some(effect => Number(effect.quantityDelta ?? 0) !== 0 || Number(effect.heldDelta ?? 0) !== 0);
    if (kind === 'COUNT') {
      result.happened = changes ? 'Count applied. Recorded quantities were adjusted to the verified physical observations.' : Array.isArray(doc?.effects) ? 'Count verified. The saved checkpoint records the physical observations, including zero variance.' : 'Count applied. Read the saved stock effects to confirm any adjustment; effect details are unavailable in this response.';
      result.stockEffect = changes ? 'changed' : 'recorded';
      result.stockExplanation = 'The saved stock effects show any quantity adjustment. Earlier movements remain historical evidence.';
      result.recovery = countRecovery;
    } else if (noStockKinds.has(kind)) {
      result.happened = kind === 'CREDIT_NOTE' ? 'Supplier credit was recorded and is available for allocation.' : kind === 'TARGET_REVIEW' ? 'Accepted reorder targets were saved.' : 'This record was posted.';
      unchanged('This document does not change physical stock.');
      result.recovery = 'Review the saved history. Use the linked workflow for any further stock or accounting action.';
    } else {
      result.happened = ({ LOSS: 'Saved stock effects record the units removed for loss or breakage.', COUNTER_SALE: 'Saved stock effects record the units removed by this sale.', INWARD_CHALLAN: 'Saved stock effects record the goods added by this receipt.', OPENING_STOCK: 'Saved stock effects record the opening quantities added to the new batches.', HOLD: 'Saved stock effects record the units held out of available stock.', SALES_RETURN: 'Saved stock effects follow each return disposition: restocked units become available, quarantined units remain held, and loss units do not become usable stock.', CORRECTION: 'Saved stock effects record the signed quantity and hold adjustments of this linked correction.' } as Record<string, string>)[kind] || 'Saved stock effects are recorded for this document.';
      result.stockExplanation = kind === 'HOLD' ? 'Holding units changes their availability, not physical quantity.' : 'Review the saved quantities below before another stock operation.';
      result.stockEffect = changes ? 'changed' : 'recorded';
      result.recovery = kind === 'HOLD' ? 'Release held stock when it is usable, or record a verified loss or supplier return against this hold.' : kind === 'INWARD_CHALLAN' ? 'Create linked purchase bill to record supplier accounting without receiving these goods again.' : 'For an incorrect posting, ask a manager to use Correct by reversal, then record the verified correction.';
    }
  }
  if (kind === 'CORRECTION') {
    result.recovery = 'Review the linked original and signed effects. Use Counts & audit with a colleague who has stock count permission if the physical quantity is wrong. This correction cannot itself be reversed from this screen.';
    result.auditRecovery = true;
  }
  if (kind === 'TARGET_REVIEW') result.recovery = 'Open Reorder target review to review proposal lines and their saved values. This workflow does not change physical stock.';
  if (['DRAFT', 'APPROVED'].includes(status) && ['SHORTBOOK', 'QUOTATION'].includes(kind)) result.recovery += ` Conversion also requires ${kind === 'SHORTBOOK' ? 'purchase order' : 'counter sale'} write permission. If access is denied, share the recovery handoff with a colleague who has both workflow permissions.`;
  if (kind === 'PURCHASE_ORDER' && ['APPROVED', 'PART_RECEIVED', 'SENT'].includes(status)) result.recovery += ' Receiving requires inward challan write permission; share this order reference with an authorized colleague if that action is unavailable.';
  if (kind === 'COUNT' && !result.recovery.includes('Start fresh count')) result.recovery += ` ${countRecovery}`;
  if (!authority.write) result.recovery = `Ask a colleague with ${kind === 'COUNT' ? 'stock count' : 'this inventory workflow\'s write'} permission to perform the recovery. Share the recovery handoff below. ${result.recovery}`;
  return result;
}
