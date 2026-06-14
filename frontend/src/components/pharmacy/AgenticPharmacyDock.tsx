"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { cn, getErrorMessage } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AgentMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  structured?: {
    chart?: ChartSpec | null;
    report?: Record<string, unknown> | null;
    proposals?: string[];
    error?: string;
  } | null;
  attachmentIds?: string[];
  createdAt?: string;
};

type AgentAttachment = {
  id: string;
  fileName: string;
  kind: string;
  status: string;
  summary?: Record<string, unknown> | null;
};

type AgentAction = {
  id: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  permissionRequired?: string | null;
  input?: Record<string, unknown>;
  preview?: Record<string, unknown>;
  status: string;
  error?: string | null;
};

type AgentProposal = {
  id: string;
  title: string;
  summary: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | string;
  status: string;
  actions: AgentAction[];
  createdAt?: string;
};

type AgentSession = {
  id: string;
  title?: string;
  status?: string;
  updatedAt?: string;
  lastMessage?: string | null;
  pendingProposalCount?: number;
  hasContent?: boolean;
  messages?: AgentMessage[];
  attachments?: AgentAttachment[];
  proposals?: AgentProposal[];
};

type AgentResponse = {
  message?: AgentMessage;
  proposals?: AgentProposal[];
  chart?: ChartSpec | null;
  report?: Record<string, unknown> | null;
  runId?: string;
};

type ChartSpec = {
  type?: "bar" | "line" | "pie" | string;
  title?: string;
  xKey?: string;
  yKeys?: string[];
  data?: Array<Record<string, unknown>>;
};

type ThreadActionState = {
  id: string;
  type: "archive" | "restore";
} | null;

const chartColors = ["#2563eb", "#059669", "#dc2626", "#9333ea", "#ea580c"];

const hasThreadContent = (thread: AgentSession) =>
  Boolean(thread.hasContent) ||
  Boolean(thread.lastMessage) ||
  Number(thread.pendingProposalCount || 0) > 0;

export function AgenticPharmacyDock() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [input, setInput] = useState("");
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>(
    [],
  );
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [codexReady, setCodexReady] = useState<boolean | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [threadAction, setThreadAction] = useState<ThreadActionState>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const creatingThreadPromiseRef = useRef<Promise<AgentSession> | null>(null);

  const isHistoryThread = session?.status === "ARCHIVED";

  const activeSessions = useMemo(() => {
    const active = sessions.filter((item) => item.status !== "ARCHIVED");
    const withContent = active.filter((item) => hasThreadContent(item));
    const drafts = active.filter((item) => !hasThreadContent(item));
    return [...withContent, ...drafts.slice(0, 1)].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
  }, [sessions]);

  const historySessions = useMemo(
    () =>
      sessions.filter(
        (item) => item.status === "ARCHIVED" && hasThreadContent(item),
      ),
    [sessions],
  );

  const pendingProposalCount = useMemo(
    () =>
      proposals.filter((proposal) => proposal.status === "PENDING_REVIEW")
        .length,
    [proposals],
  );

  const currentThreadHasContent = useMemo(
    () =>
      Boolean(session && hasThreadContent(session)) ||
      messages.length > 0 ||
      attachments.length > 0 ||
      proposals.length > 0,
    [attachments.length, messages.length, proposals.length, session],
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const mergeProposals = useCallback((next: AgentProposal[]) => {
    setProposals((prev) => {
      const byId = new Map(prev.map((proposal) => [proposal.id, proposal]));
      next.forEach((proposal) => byId.set(proposal.id, proposal));
      return Array.from(byId.values()).sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      );
    });
  }, []);

  const upsertSessionListItem = useCallback((next: AgentSession) => {
    setSessions((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]));
      byId.set(next.id, { ...byId.get(next.id), ...next });
      return Array.from(byId.values()).sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      );
    });
  }, []);

  const applySession = useCallback(
    (next: AgentSession) => {
      setSession(next);
      setMessages(next.messages || []);
      setAttachments(next.attachments || []);
      setProposals(next.proposals || []);
      setSelectedAttachmentIds([]);
      upsertSessionListItem({
        id: next.id,
        title: next.title,
        status: next.status,
        updatedAt: next.updatedAt,
        lastMessage:
          next.messages && next.messages.length > 0
            ? next.messages[next.messages.length - 1]?.content || null
            : null,
        pendingProposalCount: (next.proposals || []).filter(
          (proposal) => proposal.status === "PENDING_REVIEW",
        ).length,
        hasContent:
          (next.messages || []).length > 0 ||
          (next.attachments || []).length > 0 ||
          (next.proposals || []).length > 0,
      });
    },
    [upsertSessionListItem],
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      const loaded =
        await apiClient.getPharmacyAgentSession<AgentSession>(sessionId);
      applySession(loaded);
      return loaded;
    },
    [applySession],
  );

  const refreshThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const response = await apiClient.listPharmacyAgentSessions<{
        data?: AgentSession[];
      }>();
      const nextSessions = response.data || [];
      setSessions(nextSessions);
      return nextSessions;
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const createThread = useCallback(async () => {
    if (creatingThreadPromiseRef.current) {
      return creatingThreadPromiseRef.current;
    }
    setCreating(true);
    const request = apiClient
      .createPharmacyAgentSession<AgentSession>({
        title: "Agentic Pharmacy",
      })
      .then((created) => {
        applySession(created);
        return created;
      });
    creatingThreadPromiseRef.current = request;
    try {
      return await request;
    } finally {
      creatingThreadPromiseRef.current = null;
      setCreating(false);
    }
  }, [applySession]);

  const ensureSession = useCallback(async () => {
    if (session && session.status !== "ARCHIVED") return session;
    return createThread();
  }, [createThread, session]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      const nextSessions = await refreshThreads();
      const active = nextSessions.find((item) => item.status !== "ARCHIVED");
      if (active) {
        await loadSession(active.id);
      } else {
        await createThread();
      }
    })().catch((error) => {
      toast({
        variant: "destructive",
        title: "Agent unavailable",
        description: getErrorMessage(error),
      });
    });
  }, [createThread, loadSession, refreshThreads]);

  useEffect(() => {
    void apiClient
      .getPharmacyAgentStatus<{ configured: boolean }>()
      .then((status) => setCodexReady(Boolean(status.configured)))
      .catch(() => setCodexReady(false));
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const uploadFile = async (file: File) => {
    const active = await ensureSession();
    setUploading(true);
    try {
      const attachment =
        await apiClient.uploadPharmacyAgentAttachment<AgentAttachment>(
          active.id,
          file,
        );
      setAttachments((prev) => [attachment, ...prev]);
      setSelectedAttachmentIds((prev) =>
        Array.from(new Set([attachment.id, ...prev])),
      );
      toast({
        variant: "success",
        title: "Attachment ready",
        description: attachment.fileName,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: getErrorMessage(error),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || isHistoryThread) return;
    const active = await ensureSession();
    const optimistic: AgentMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      attachmentIds: selectedAttachmentIds,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);
    try {
      const response = await apiClient.sendPharmacyAgentMessage<AgentResponse>(
        active.id,
        {
          message: text,
          attachmentIds: selectedAttachmentIds,
        },
      );
      if (response.message) {
        setMessages((prev) => [...prev, response.message as AgentMessage]);
      }
      if (response.proposals?.length) {
        mergeProposals(response.proposals);
      }
      void refreshThreads();
      setSelectedAttachmentIds([]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: getErrorMessage(error) || "Agent request failed.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const applyProposal = async (proposalId: string) => {
    try {
      const response = await apiClient.applyPharmacyAgentProposal<{
        proposal?: AgentProposal;
      }>(proposalId);
      if (response.proposal) mergeProposals([response.proposal]);
      toast({ variant: "success", title: "Proposal applied" });
      window.dispatchEvent(new CustomEvent("pharmacy-dashboard-refresh"));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Apply failed",
        description: getErrorMessage(error),
      });
    }
  };

  const rejectProposal = async (proposalId: string) => {
    try {
      const proposal =
        await apiClient.rejectPharmacyAgentProposal<AgentProposal>(
          proposalId,
          "Rejected from Pharmacy Desk",
        );
      mergeProposals([proposal]);
      toast({ title: "Proposal rejected" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Reject failed",
        description: getErrorMessage(error),
      });
    }
  };

  const selectThread = async (threadId: string) => {
    if (threadId === session?.id) return;
    try {
      await loadSession(threadId);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Thread unavailable",
        description: getErrorMessage(error),
      });
    }
  };

  const archiveThread = async (threadId: string) => {
    if (threadAction) return;
    const target = sessions.find((item) => item.id === threadId);
    if (target?.status === "ARCHIVED") return;
    const targetHasContent =
      threadId === session?.id
        ? currentThreadHasContent
        : Boolean(target && hasThreadContent(target));
    if (!targetHasContent) return;
    setThreadAction({ id: threadId, type: "archive" });
    try {
      const archived =
        await apiClient.archivePharmacyAgentSession<AgentSession>(threadId);
      upsertSessionListItem(archived);
      setShowHistory(true);
      toast({ title: "Thread archived" });
      const nextSessions = await refreshThreads();
      if (threadId === session?.id) {
        const nextActive = nextSessions.find(
          (item) => item.status !== "ARCHIVED" && item.id !== threadId,
        );
        if (nextActive) {
          await loadSession(nextActive.id);
        } else {
          await createThread();
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Archive failed",
        description: getErrorMessage(error),
      });
    } finally {
      setThreadAction(null);
    }
  };

  const restoreThread = async (threadId: string) => {
    if (threadAction) return;
    setThreadAction({ id: threadId, type: "restore" });
    try {
      const restored =
        await apiClient.restorePharmacyAgentSession<AgentSession>(threadId);
      upsertSessionListItem(restored);
      await loadSession(threadId);
      void refreshThreads();
      toast({ title: "Thread restored" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Restore failed",
        description: getErrorMessage(error),
      });
    } finally {
      setThreadAction(null);
    }
  };

  return (
    <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 text-slate-950">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <h3 className="truncate text-sm font-semibold">Agentic Pharmacy</h3>
            <Badge
              variant="outline"
              className={
                codexReady
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {codexReady === null
                ? "Checking"
                : codexReady
                  ? "Codex"
                  : "Codex offline"}
            </Badge>
            {pendingProposalCount > 0 && (
              <Badge className="bg-amber-400 text-slate-950">
                {pendingProposalCount} pending
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ask questions, attach pharmacy files, generate charts, and review
            proposed DB updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session && !isHistoryThread && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => void archiveThread(session.id)}
              disabled={
                creating ||
                sending ||
                !currentThreadHasContent ||
                Boolean(threadAction)
              }
            >
              {threadAction?.type === "archive" &&
              threadAction.id === session.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Archive
            </Button>
          )}
          {isHistoryThread && session && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => void restoreThread(session.id)}
              disabled={creating || sending || Boolean(threadAction)}
            >
              {threadAction?.type === "restore" &&
              threadAction.id === session.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Restore
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="gap-1"
            onClick={() => void createThread()}
            disabled={creating || sending}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New Thread
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[230px_minmax(0,1fr)_300px]">
        <ThreadRail
          sessions={activeSessions}
          historySessions={historySessions}
          currentSessionId={session?.id}
          loading={loadingThreads}
          showHistory={showHistory}
          onSelect={(threadId) => void selectThread(threadId)}
          onArchive={(threadId) => void archiveThread(threadId)}
          onRestore={(threadId) => void restoreThread(threadId)}
          onToggleHistory={() => setShowHistory((value) => !value)}
          threadAction={threadAction}
        />
        <div className="flex min-h-0 flex-col">
          <div
            ref={scrollRef}
            className="min-h-[360px] flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3"
          >
            {isHistoryThread && (
              <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This thread is in history. Restore it to continue the
                conversation.
              </div>
            )}
            {creating && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting session
              </div>
            )}
            {messages.length === 0 && !creating && (
              <div className="rounded-[8px] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                Ask about stock, billing, purchase invoices, ledger, compliance,
                or attach a pharmacy file.
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[86%] rounded-[8px] bg-slate-950 px-3 py-2 text-sm text-white"
                    : "mr-auto max-w-[92%] rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
                {message.structured?.chart && (
                  <AgentChart chart={message.structured.chart} />
                )}
                {message.structured?.report && (
                  <div className="mt-3 rounded-[8px] border border-blue-100 bg-blue-50 p-3 text-xs text-blue-950">
                    <div className="font-semibold">
                      {String(message.structured.report.title || "Report")}
                    </div>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(message.structured.report, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
            {proposals.length > 0 && (
              <div className="space-y-2 md:hidden">
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onApply={() => void applyProposal(proposal.id)}
                    onReject={() => void rejectProposal(proposal.id)}
                  />
                ))}
              </div>
            )}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Codex is working
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            {selectedAttachmentIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments
                  .filter((attachment) =>
                    selectedAttachmentIds.includes(attachment.id),
                  )
                  .map((attachment) => (
                    <button
                      key={attachment.id}
                      type="button"
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                      onClick={() =>
                        setSelectedAttachmentIds((prev) =>
                          prev.filter((id) => id !== attachment.id),
                        )
                      }
                    >
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{attachment.fileName}</span>
                      <X className="h-3 w-3 shrink-0" />
                    </button>
                  ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv,image/*,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={uploading || isHistoryThread}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ask Codex about pharmacy operations"
                disabled={isHistoryThread}
                className="max-h-28 min-h-11 resize-none"
              />
              <Button
                type="button"
                className="h-11 w-11 shrink-0"
                size="icon"
                disabled={sending || !input.trim() || isHistoryThread}
                onClick={() => void sendMessage()}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden min-h-0 border-l border-slate-200 bg-white md:flex md:flex-col">
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proposals
              </div>
              <Badge variant="secondary">{pendingProposalCount}</Badge>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {proposals.length === 0 ? (
              <div className="rounded-[8px] border border-slate-200 p-3 text-sm text-slate-500">
                No pending updates.
              </div>
            ) : (
              proposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onApply={() => void applyProposal(proposal.id)}
                  onReject={() => void rejectProposal(proposal.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ThreadRail({
  sessions,
  historySessions,
  currentSessionId,
  loading,
  showHistory,
  onSelect,
  onArchive,
  onRestore,
  onToggleHistory,
  threadAction,
}: {
  sessions: AgentSession[];
  historySessions: AgentSession[];
  currentSessionId?: string;
  loading: boolean;
  showHistory: boolean;
  onSelect: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  onRestore: (threadId: string) => void;
  onToggleHistory: () => void;
  threadAction: ThreadActionState;
}) {
  return (
    <aside className="border-b border-slate-200 bg-slate-50 md:min-h-0 md:border-b-0 md:border-r">
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Threads
          </div>
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          )}
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto p-2 md:min-h-0 md:max-h-none md:flex-1">
        <ThreadSection
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Active"
          emptyText="No active threads."
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={onSelect}
          onArchive={onArchive}
          threadAction={threadAction}
        />
        <button
          type="button"
          className="mt-4 flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800"
          onClick={onToggleHistory}
        >
          <span className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            History
          </span>
          <span className="flex items-center gap-1.5">
            <span>{historySessions.length}</span>
            {showHistory ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
        {showHistory && (
          <ThreadSection
            className="mt-2"
            icon={<History className="h-3.5 w-3.5" />}
            title="Archived"
            emptyText="No history yet."
            sessions={historySessions}
            currentSessionId={currentSessionId}
            onSelect={onSelect}
            onRestore={onRestore}
            threadAction={threadAction}
          />
        )}
      </div>
    </aside>
  );
}

function ThreadSection({
  className,
  icon,
  title,
  emptyText,
  sessions,
  currentSessionId,
  onSelect,
  onArchive,
  onRestore,
  threadAction,
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  emptyText: string;
  sessions: AgentSession[];
  currentSessionId?: string;
  onSelect: (threadId: string) => void;
  onArchive?: (threadId: string) => void;
  onRestore?: (threadId: string) => void;
  threadAction: ThreadActionState;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500">
        {icon}
        {title}
      </div>
      {sessions.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 bg-white px-2 py-2 text-xs text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1.5">
          {sessions.map((item) => (
            <ThreadListItem
              key={item.id}
              session={item}
              selected={item.id === currentSessionId}
              onSelect={() => onSelect(item.id)}
              onArchive={onArchive ? () => onArchive(item.id) : undefined}
              onRestore={onRestore ? () => onRestore(item.id) : undefined}
              threadAction={threadAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadListItem({
  session,
  selected,
  onSelect,
  onArchive,
  onRestore,
  threadAction,
}: {
  session: AgentSession;
  selected: boolean;
  onSelect: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  threadAction: ThreadActionState;
}) {
  const isArchived = session.status === "ARCHIVED";
  const isArchiving =
    threadAction?.type === "archive" && threadAction.id === session.id;
  const isRestoring =
    threadAction?.type === "restore" && threadAction.id === session.id;
  const actionInProgress = Boolean(threadAction);
  return (
    <div
      className={cn(
        "rounded-[8px] border bg-white p-2",
        selected ? "border-slate-900" : "border-slate-200",
      )}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={onSelect}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs font-semibold text-slate-900">
            {session.title || "Agentic Pharmacy"}
          </div>
          {session.pendingProposalCount ? (
            <Badge className="h-5 bg-amber-400 px-1.5 text-[10px] text-slate-950">
              {session.pendingProposalCount}
            </Badge>
          ) : null}
        </div>
        {session.lastMessage && (
          <div className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500">
            {session.lastMessage}
          </div>
        )}
        <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
          {isArchived ? "History" : "Active"}
        </div>
      </button>
      {!isArchived && onArchive && hasThreadContent(session) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full justify-start px-2 text-xs"
          onClick={onArchive}
          disabled={actionInProgress}
          aria-label={`Archive ${session.title || "Agentic Pharmacy"} thread`}
        >
          {isArchiving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          Archive
        </Button>
      )}
      {isArchived && onRestore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full justify-start px-2 text-xs"
          onClick={onRestore}
          disabled={actionInProgress}
        >
          {isRestoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restore
        </Button>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  onApply,
  onReject,
}: {
  proposal: AgentProposal;
  onApply: () => void;
  onReject: () => void;
}) {
  const pending = proposal.status === "PENDING_REVIEW";
  return (
    <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {proposal.title}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {proposal.summary}
          </p>
        </div>
        <Badge
          variant={
            proposal.status === "APPLIED"
              ? "default"
              : proposal.status === "REJECTED"
                ? "secondary"
                : proposal.riskLevel === "HIGH"
                  ? "destructive"
                  : "outline"
          }
        >
          {proposal.status === "PENDING_REVIEW"
            ? proposal.riskLevel
            : proposal.status}
        </Badge>
      </div>
      <div className="mt-2 space-y-1.5">
        {proposal.actions.map((action) => (
          <div
            key={action.id}
            className="rounded-md border border-white bg-white px-2 py-1.5 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">
                {action.actionType}
              </span>
              <span className="text-slate-400">{action.targetType}</span>
            </div>
            {action.permissionRequired && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <ShieldCheck className="h-3 w-3" />
                {action.permissionRequired}
              </div>
            )}
          </div>
        ))}
      </div>
      {pending && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" className="h-8 gap-1" onClick={onApply}>
            <CheckCircle2 className="h-4 w-4" />
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={onReject}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function AgentChart({ chart }: { chart: ChartSpec }) {
  const data = Array.isArray(chart.data) ? chart.data : [];
  const xKey = chart.xKey || "name";
  const yKeys =
    Array.isArray(chart.yKeys) && chart.yKeys.length > 0
      ? chart.yKeys
      : ["value"];
  if (data.length === 0) return null;

  return (
    <div className="mt-3 rounded-[8px] border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold text-slate-600">
        {chart.title || "Chart"}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {yKeys.map((key, index) => (
                <Line
                  key={key}
                  dataKey={key}
                  type="monotone"
                  stroke={chartColors[index % chartColors.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Tooltip />
              <Pie
                data={data}
                dataKey={yKeys[0]}
                nameKey={xKey}
                outerRadius={72}
              >
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={chartColors[index % chartColors.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              {yKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={chartColors[index % chartColors.length]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
