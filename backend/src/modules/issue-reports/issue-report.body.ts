import type { IssueKind, IssueReport, IssueReportContext, Reporter } from './issue-report';

export interface BuiltIssue {
  title: string;
  body: string;
  labels: string[];
}

const KIND_TABLE: Record<IssueKind, { prefix: string; label: string }> = {
  bug: { prefix: 'Bug', label: 'bug' },
  idea: { prefix: 'Idea', label: 'enhancement' },
  question: { prefix: 'Question', label: 'question' },
};

const BASE_LABEL = 'user-report';
const NO_DESCRIPTION = '_No description given._';
const FOOTER = `<sub>Filed from the clinic app's "Report a problem" button.</sub>`;

const cell = (text: string): string =>
  text.replace(/\r?\n|\r/g, ' ').replace(/[|`]/g, (char) => `\\${char}`);

const code = (text: string): string => `\`${cell(text)}\``;

const fence = (text: string): string => text.replaceAll('```', "'''");

const formatWhen = (instant: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')} ${part('timeZoneName')} (${timezone})`;
};

const table = (rows: ReadonlyArray<readonly [string, string]>): string =>
  ['| | |', '|---|---|', ...rows.map(([name, value]) => `| ${name} | ${value} |`)].join('\n');

const details = (summary: string, content: string): string =>
  `<details><summary>${summary}</summary>\n\n${content}\n\n</details>`;

const screenshotsSection = (urls: readonly string[]): string[] =>
  urls.length === 0
    ? []
    : [`### Screenshots\n${urls.map((url, i) => `![Screenshot ${i + 1}](${url})`).join('\n')}`];

const contextRows = (
  reporter: Reporter,
  context: IssueReportContext | undefined,
  now: Date,
): Array<readonly [string, string]> => {
  const reportedBy: readonly [string, string] = [
    'Reported by',
    `role ${cell(reporter.role)} · user ${code(reporter.id)} · branch ${code(reporter.branchId)}`,
  ];
  if (!context) return [reportedBy, ['When', formatWhen(now, 'UTC')]];
  return [
    ['Page', code(context.page)],
    reportedBy,
    ['When', cell(formatWhen(new Date(context.occurredAt), context.timezone))],
    ['Browser', cell(context.userAgent)],
    ['Viewport', cell(context.viewport)],
    ...(context.appVersion ? ([['App version', cell(context.appVersion)]] as const) : []),
  ];
};

const requestsSection = (context: IssueReportContext | undefined): string[] => {
  const requests = context?.recentRequests ?? [];
  if (requests.length === 0) return [];
  const rows = requests.map(
    (r) =>
      `| ${cell(r.timestamp)} | ${cell(r.method)} | ${code(r.resource)} | ${r.status} | ${cell(r.code)} | ${r.durationMs} | ${code(r.requestId)} |`,
  );
  const header = ['| Time | Method | Resource | Status | Result | ms | Reference |', '|---|---|---|---|---|---|---|'];
  return [details(`Recent requests (${requests.length})`, [...header, ...rows].join('\n'))];
};

const errorsSection = (context: IssueReportContext | undefined): string[] => {
  const errors = context?.recentErrors ?? [];
  if (errors.length === 0) return [];
  const text = errors
    .map((e) => [`${e.at} ${e.message}`, ...(e.stack ? [e.stack] : [])].join('\n'))
    .join('\n\n');
  return [details(`Recent errors (${errors.length})`, `\`\`\`text\n${fence(text)}\n\`\`\``)];
};

export function buildIssue(
  report: IssueReport,
  reporter: Reporter,
  screenshotUrls: readonly string[],
  now: Date,
): BuiltIssue {
  const kind = KIND_TABLE[report.kind];
  const sections = [
    report.description || NO_DESCRIPTION,
    ...screenshotsSection(screenshotUrls),
    `### Context\n${table(contextRows(reporter, report.context, now))}`,
    ...requestsSection(report.context),
    ...errorsSection(report.context),
    FOOTER,
  ];
  return {
    title: `[${kind.prefix}] ${report.title}`,
    body: sections.join('\n\n'),
    labels: [BASE_LABEL, kind.label],
  };
}
