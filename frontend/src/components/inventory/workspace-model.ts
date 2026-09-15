export const workflowKinds:Record<string,{label:string;area:string;help:string;primary:string}>={
 OPENING_STOCK:{label:'Opening stock entries',area:'stock',help:'Set the opening balance of a new batch with no prior movements. This creates no supplier payable.',primary:'Post opening stock'},
 SUPPLIER_RETURN:{label:'Supplier returns',area:'stock',help:'Save a draft, send stock out on a challan, then finalise the supplier credit.',primary:'Create return challan'},
 SALES_RETURN:{label:'Customer returns',area:'sales',help:'Select the original sale and choose restock, quarantine or loss for each returned batch.',primary:'Post return'},
 LOSS:{label:'Loss & breakage',area:'stock',help:'Record a reason and remove damaged or lost units from available stock.',primary:'Post stock loss'},
 HOLD:{label:'Blocked stock',area:'stock',help:'Hold units from sale while keeping them in physical stock. Release from this record.',primary:'Block stock'},
 COUNT:{label:'Stock counts',area:'stock',help:'Enter physical quantities in the displayed stock unit. Leave uncounted batches blank; enter 0 only when counted empty.',primary:'Submit count'},
 CORRECTION:{label:'Corrections',area:'stock',help:'Linked corrections retain the original stock movement and a reason for the change.',primary:'Post correction'},
 SHORTBOOK:{label:'Shortbook',area:'reorder',help:'Collect demand, check the supplier and quantity, then create a purchase order.',primary:'Create purchase order'},
 PURCHASE_ORDER:{label:'Purchase orders',area:'reorder',help:'Save, submit for approval, and receive batches against the approved order.',primary:'Submit for approval'},
 INWARD_CHALLAN:{label:'Inward challans',area:'purchases',help:'Receive physical stock before the supplier bill. Link the later bill to this receipt to avoid receiving twice.',primary:'Receive stock'},
 GATE_PASS:{label:'Gate passes',area:'purchases',help:'Record the delivery reference and linked order or receipt. This document has no stock or payable effect.',primary:'Record gate pass'},
 QUOTATION:{label:'Quotations',area:'sales',help:'Prepare a quotation without reserving or selling stock. Convert once to a sale draft.',primary:'Create sale draft'},
 COUNTER_SALE:{label:'Counter sales',area:'sales',help:'Choose the actual batch and stock unit. Drafts do not reserve; posting reduces available stock.',primary:'Post sale'},
 CREDIT_NOTE:{label:'Credit notes',area:'purchases',help:'Record a supplier credit without stock movement, then allocate it to posted bills.',primary:'Post supplier credit'},
 TARGET_REVIEW:{label:'Target proposals',area:'reorder',help:'Compare proposed minimum and maximum levels with the saved values; choose the lines to accept.',primary:'Accept selected targets'},
};
export const fmtMoney=(v:any)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(v)||0);
export const fmtDate=(v:any)=>v?new Date(v).toLocaleDateString('en-IN'):'—';
export const labelStatus=(v:string)=>({DRAFT:'Draft • no stock change',AWAITING_APPROVAL:'Awaiting manager approval',APPROVED:'Approved • ready for next step',CHALLAN:'Challan • stock returned',POSTED:'Posted',PART_RECEIVED:'Part received',RECEIVED:'Received in full',RELEASED:'Released',REVERSED:'Reversed',ORDERED:'Ordered',CANCELLED:'Cancelled',REJECTED:'Rejected'}[v]||v);
export const requestKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
export const inputClass='h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary';
export function downloadCsv(name:string,rows:Record<string,any>[]){if(!rows.length)return;const keys=Object.keys(rows[0]);const cell=(v:any)=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const text=[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF',text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
