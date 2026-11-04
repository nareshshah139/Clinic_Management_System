# Before and after UI stategraphs

Green: bounded browser evidence. Blue: real UI/HTTP/database evidence. Amber: a known gap or explicit recovery boundary. Gray: source/model exploration only. These graphs do not claim exhaustive correctness; see [scope and evidence](README.md).

## OCR before

```mermaid
flowchart TD
  D["Loaded OCR draft"]
  F["Flagged or incorrect values<br/>One-row and two-row cases"]
  M["Missing required fields"]
  K["Incomplete catalogue details"]
  A["Ambiguous existing product"]
  N["New product"]
  S["Supplier details need correction"]
  R["Reviewed bill<br/>Reopen works; reason audit gap"]
  L["Bill already linked to a receipt"]
  V["Valid current values<br/>Review checks acknowledged"]
  C["Stock added<br/>Confirmed by synthetic status read"]
  B["Bill posted against earlier receipt<br/>UI completion confirmed"]
  T["Stale revision<br/>Edits retained; writes blocked"]
  U["Stock outcome unknown<br/>Writes blocked; ready badge is wrong"]
  Q["Compare or reload saved version"]
  H["Check saved stock status"]
  Z["Reconciled current draft or confirmed outcome"]
  R -->|Reopen and edit| D
  L --> D
  D --> F & M & K & A & N & S
  F -->|Correct if needed and acknowledge| V
  M -->|Fill valid values and acknowledge| V
  K -->|Complete or correct details| V
  A -->|Choose existing match| V
  N -->|Create verified product| V
  S -->|Save verified supplier correction| V
  V -->|Final approval and Save & add stock| C
  V -->|Receipt linked: final approval and Save & post bill| B
  V -->|Save rejected as stale| T
  V -->|Commit response and status lookup fail| U
  T -.->|Action offered; recovery not completed in this audit| Q
  U -.->|Action offered; recovery not completed in this audit| H
  Q -.-> Z
  H -.-> Z
  classDef tested fill:#e8f5ec,stroke:#248647,color:#123c23
  classDef partial fill:#fff1ce,stroke:#a87300,color:#503800
  classDef unverified fill:#f2f3f5,stroke:#7b8291,color:#343943,stroke-dasharray:5 5
  class D,F,M,K,A,N,S,L,V,C,B tested
  class R,T,U partial
  class Q,H,Z unverified
```

## OCR after

```mermaid
flowchart TD
  D["OCR draft: one review worksheet"]
  X["Missing / invalid / ambiguous details"]
  M["Correct values or choose / create product"]
  B["Select rows: GST / discount preview"]
  A["Apply locally; undo preserves later edits"]
  C["Current catalogue check"]
  E["Check failed; saved product stays saved"]
  R["Ready: confirm current values once"]
  P["Save exact snapshot → review"]
  J["Commit already-reviewed invoice"]
  V["REVIEWED verified: handoff to stock-authorized staff"]
  F["Fresh saved-status lookup"]
  S["Stock committed and confirmed"]
  I["Receipt-linked bill posted; receipt retained"]
  T["Stale revision: edits retained, writes blocked"]
  Q["Compare saved version; reconcile current draft"]
  U["Stock outcome unknown: writes blocked"]
  H["Fresh status says REVIEWED: explicit retry"]
  O["Reopen reviewed invoice with reason"]
  Z["Unknown or upload-only flag: explicit recovery required"]
  D --> X --> M --> C
  D --> C
  D --> B --> A --> C
  B -->|Draft changed: preview invalidated| D
  C -->|Current ready response only| R
  C --> E -->|Retry check, no duplicate product save| C
  R -->|Confirm and add stock| P
  R -->|Review-only permission| P
  P -->|Review-only: fresh status confirms REVIEWED| V
  P -->|Stock permission| J
  V -->|Authorized staff resumes| J
  V --> O --> D
  J --> F
  F --> S
  F --> I
  P -->|Revision conflict| T --> Q --> D
  J -->|Commit and lookup responses lost| U
  U -->|Check saved status only| F
  F --> H -->|Add stock| J
  D -.-> Z
  classDef ui fill:#e8f5ec,stroke:#248647,color:#123c23
  classDef boundary fill:#fff1ce,stroke:#a87300,color:#503800
  class D,X,M,B,A,C,E,R,P,J,V,F,S,I,T,Q,U,H,O ui
  class Z boundary
```

## Inventory workspace before

```mermaid
flowchart TB
  I["Wider inventory states explored<br/>Source/model coverage; not full browser validation"]
  I --> W["Workspace<br/>Today / Purchases / Stock / Sales / Reorder<br/>Permission loading / denied / failed"]
  I --> Q["Today queues<br/>Pending invoices / receipts / counts / returns<br/>Low or expired stock / orders / dues"]
  I --> S["Stock and batch details<br/>Current / depleted / expired<br/>Physical / held / available<br/>Editing / correction / retained history"]
  I --> P["Intake and purchases<br/>Manual / photo / PDF / CSV / Gmail<br/>Draft / reviewed / posted / cancelled<br/>Incomplete / duplicate / stale / unknown / handoff"]
  I --> C["Counts and approvals<br/>Blank / zero / observed<br/>Draft / awaiting approval / approved<br/>Applied / rejected / cancelled / fresh count"]
  I --> H["Loss, holds and supplier returns<br/>Draft / posted loss / reversed<br/>Held / released<br/>Return challan / final credit / cancellation"]
  I --> R["Receipts and reorder<br/>Gate pass / inward challan<br/>PO draft / approval / partial or full receipt<br/>Cancelled remainder / targets / Shortbook<br/>Automation off / setup required / failed"]
  I --> A["Sales and customer returns<br/>Quotation / sale draft / posted sale<br/>Return for restock / quarantine / loss<br/>Refund / release / reversal"]
  I --> F["Suppliers and accounting<br/>Active / inactive / edit / account<br/>Dues / payment / credit / allocation / reversal"]
  I --> E["Read and recovery states<br/>Loading / populated / empty / failed<br/>Unknown outcome / status check / handoff"]
  E --> X["Known gap<br/>List loading, empty and failed states are inconsistent"]
  S --> Y["Known gap<br/>Phone search input is too narrow"]
  classDef source fill:#f2f3f5,stroke:#7b8291,color:#343943
  classDef issue fill:#fde8e8,stroke:#b53b3b,color:#6c1717
  class I,W,Q,S,P,C,H,R,A,F,E source
  class X,Y issue
```

## Inventory workspace after

```mermaid
flowchart TB
  I["Inventory workspace"]
  L["Purchases / losses / suppliers"]
  LOAD["Loading current query"]
  ERR["Read failed: visible local Retry"]
  EMPTY["Loaded: no records"]
  ROWS["Loaded: current records"]
  RACE["Purchase / loss filters ignore older responses"]
  STOCK["Stock search: full-width phone input"]
  OCR["Invoice review and posting: see after-ocr"]
  REC["Real UI + HTTP + database recovery"]
  PUR["Duplicate purchase → compare retained note → adopt existing invoice → save correction"]
  PART["Partner partial outcome → matched status → completion"]
  SUP["Reallocate payment; lost reversal response → idempotent retry"]
  OPEN["Opening import failed row → retry / reconciliation"]
  COUNT["Stale count → blank fresh count → post → reconciled ledger"]
  MISSING["Missing invoice → reject uncertain history → fresh physical count"]
  INTAKE["Visible import recovery → correct invalid reference → authorized recovery\nUnfinished work fenced; missing history stays unverified"]
  DB["Stock HTTP + database: replay / invalid command / permissions"]
  OTHER["Other explored domain groups: source / model coverage only\nToday queues; counts / approvals; holds / loss / returns\nReceipts / reorder / automation; sales / refunds; accounting"]
  I --> L --> LOAD
  LOAD --> ERR -->|Retry| LOAD
  LOAD --> EMPTY & ROWS
  ROWS --> RACE --> LOAD
  I --> STOCK & OCR & REC & DB & OTHER
  REC --> PUR & PART & SUP & OPEN & COUNT & MISSING & INTAKE
  classDef ui fill:#e8f5ec,stroke:#248647,color:#123c23
  classDef real fill:#e6efff,stroke:#3e68aa,color:#17396c
  classDef source fill:#f2f3f5,stroke:#7b8291,color:#343943,stroke-dasharray:5 5
  class L,LOAD,ERR,EMPTY,ROWS,RACE,STOCK,OCR ui
  class REC,PUR,PART,SUP,OPEN,COUNT,MISSING,INTAKE,DB real
  class I,OTHER source
```
