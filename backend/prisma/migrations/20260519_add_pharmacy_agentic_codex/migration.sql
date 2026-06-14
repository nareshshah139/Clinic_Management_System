CREATE TYPE "PharmacyAgentMessageRole" AS ENUM (
  'USER',
  'ASSISTANT',
  'SYSTEM',
  'TOOL'
);

CREATE TYPE "PharmacyAgentRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "PharmacyAgentProposalStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPLIED',
  'REJECTED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "pharmacy_agent_sessions" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_agent_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_agent_messages" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT,
  "role" "PharmacyAgentMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "structured" JSONB,
  "attachmentIds" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_agent_attachments" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "storagePath" TEXT,
  "extractedText" TEXT,
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_agent_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_agent_runs" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "PharmacyAgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "promptHash" TEXT,
  "output" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_agent_proposals" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "runId" TEXT,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "status" "PharmacyAgentProposalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "appliedBy" TEXT,
  "appliedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_agent_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_agent_proposal_actions" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "permissionRequired" TEXT,
  "expectedVersion" TIMESTAMP(3),
  "input" JSONB NOT NULL,
  "preview" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pharmacy_agent_proposal_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pharmacy_agent_audit_events" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT,
  "runId" TEXT,
  "proposalId" TEXT,
  "branchId" TEXT NOT NULL,
  "userId" TEXT,
  "eventType" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_agent_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pharmacy_agent_sessions_branchId_idx" ON "pharmacy_agent_sessions"("branchId");
CREATE INDEX "pharmacy_agent_sessions_userId_idx" ON "pharmacy_agent_sessions"("userId");
CREATE INDEX "pharmacy_agent_sessions_branchId_updatedAt_idx" ON "pharmacy_agent_sessions"("branchId", "updatedAt");

CREATE INDEX "pharmacy_agent_messages_sessionId_idx" ON "pharmacy_agent_messages"("sessionId");
CREATE INDEX "pharmacy_agent_messages_branchId_createdAt_idx" ON "pharmacy_agent_messages"("branchId", "createdAt");

CREATE INDEX "pharmacy_agent_attachments_sessionId_idx" ON "pharmacy_agent_attachments"("sessionId");
CREATE INDEX "pharmacy_agent_attachments_branchId_createdAt_idx" ON "pharmacy_agent_attachments"("branchId", "createdAt");

CREATE INDEX "pharmacy_agent_runs_sessionId_idx" ON "pharmacy_agent_runs"("sessionId");
CREATE INDEX "pharmacy_agent_runs_branchId_createdAt_idx" ON "pharmacy_agent_runs"("branchId", "createdAt");
CREATE INDEX "pharmacy_agent_runs_status_idx" ON "pharmacy_agent_runs"("status");

CREATE INDEX "pharmacy_agent_proposals_sessionId_idx" ON "pharmacy_agent_proposals"("sessionId");
CREATE INDEX "pharmacy_agent_proposals_branchId_status_idx" ON "pharmacy_agent_proposals"("branchId", "status");
CREATE INDEX "pharmacy_agent_proposals_createdAt_idx" ON "pharmacy_agent_proposals"("createdAt");

CREATE INDEX "pharmacy_agent_proposal_actions_proposalId_idx" ON "pharmacy_agent_proposal_actions"("proposalId");
CREATE INDEX "pharmacy_agent_proposal_actions_branchId_idx" ON "pharmacy_agent_proposal_actions"("branchId");
CREATE INDEX "pharmacy_agent_proposal_actions_actionType_idx" ON "pharmacy_agent_proposal_actions"("actionType");

CREATE INDEX "pharmacy_agent_audit_events_sessionId_idx" ON "pharmacy_agent_audit_events"("sessionId");
CREATE INDEX "pharmacy_agent_audit_events_proposalId_idx" ON "pharmacy_agent_audit_events"("proposalId");
CREATE INDEX "pharmacy_agent_audit_events_branchId_createdAt_idx" ON "pharmacy_agent_audit_events"("branchId", "createdAt");

ALTER TABLE "pharmacy_agent_sessions"
  ADD CONSTRAINT "pharmacy_agent_sessions_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_sessions"
  ADD CONSTRAINT "pharmacy_agent_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_messages"
  ADD CONSTRAINT "pharmacy_agent_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "pharmacy_agent_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_messages"
  ADD CONSTRAINT "pharmacy_agent_messages_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_messages"
  ADD CONSTRAINT "pharmacy_agent_messages_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_attachments"
  ADD CONSTRAINT "pharmacy_agent_attachments_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "pharmacy_agent_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_attachments"
  ADD CONSTRAINT "pharmacy_agent_attachments_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_attachments"
  ADD CONSTRAINT "pharmacy_agent_attachments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_runs"
  ADD CONSTRAINT "pharmacy_agent_runs_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "pharmacy_agent_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_runs"
  ADD CONSTRAINT "pharmacy_agent_runs_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_runs"
  ADD CONSTRAINT "pharmacy_agent_runs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_proposals"
  ADD CONSTRAINT "pharmacy_agent_proposals_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "pharmacy_agent_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_proposals"
  ADD CONSTRAINT "pharmacy_agent_proposals_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "pharmacy_agent_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_proposals"
  ADD CONSTRAINT "pharmacy_agent_proposals_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_proposals"
  ADD CONSTRAINT "pharmacy_agent_proposals_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_proposal_actions"
  ADD CONSTRAINT "pharmacy_agent_proposal_actions_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "pharmacy_agent_proposals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_proposal_actions"
  ADD CONSTRAINT "pharmacy_agent_proposal_actions_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_audit_events"
  ADD CONSTRAINT "pharmacy_agent_audit_events_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "pharmacy_agent_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_audit_events"
  ADD CONSTRAINT "pharmacy_agent_audit_events_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "pharmacy_agent_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_audit_events"
  ADD CONSTRAINT "pharmacy_agent_audit_events_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "pharmacy_agent_proposals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_audit_events"
  ADD CONSTRAINT "pharmacy_agent_audit_events_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pharmacy_agent_audit_events"
  ADD CONSTRAINT "pharmacy_agent_audit_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "name", "description", "resource", "action", "isActive", "createdAt", "updatedAt")
VALUES
  ('perm_pharmacy_agent_use', 'pharmacy:agent:use', 'Use the embedded Agentic Pharmacy assistant', 'pharmacy_agent', 'use', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_pharmacy_agent_proposal_apply', 'pharmacy:agent:proposal:apply', 'Apply reviewed Agentic Pharmacy database proposals', 'pharmacy_agent', 'proposal:apply', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm_pharmacy_drug_create', 'pharmacy:drug:create', 'Create pharmacy drug master records', 'pharmacy_drug', 'create', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
