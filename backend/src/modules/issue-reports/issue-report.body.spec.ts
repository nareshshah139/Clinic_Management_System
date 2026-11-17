import { buildIssue } from './issue-report.body';
import type { IssueReport } from './issue-report';

const reporter = { id: 'user-1', role: 'DOCTOR', branchId: 'branch-1' };
const now = new Date('2026-11-17T05:12:00Z');

const fullReport: IssueReport = {
  kind: 'bug',
  title: 'Save fails',
  description: 'Clicking save does nothing.',
  screenshots: [],
  context: {
    page: '/dashboard/patients/:id',
    appVersion: 'abc123',
    userAgent: 'Mozilla/5.0 | Test',
    viewport: '1440x900 @2x',
    timezone: 'Asia/Kolkata',
    occurredAt: '2026-11-17T05:12:00Z',
    recentRequests: [
      {
        timestamp: '2026-11-17T05:11:58Z',
        requestId: 'req-9',
        resource: '/api/patients/:id',
        method: 'PATCH',
        status: 500,
        code: 'internal_error',
        durationMs: 120,
      },
    ],
    recentErrors: [{ at: '2026-11-17T05:11:59Z', message: 'Boom', stack: 'at save (app.js:1)' }],
  },
};

describe('buildIssue', () => {
  it('renders the full bug report with screenshots and technical details', () => {
    const issue = buildIssue(
      fullReport,
      reporter,
      ['https://github.com/o/r/blob/issue-attachments/reports/2026/11/x/screenshot-1.png?raw=true'],
      now,
    );

    expect(issue.title).toBe('[Bug] Save fails');
    expect(issue.labels).toEqual(['user-report', 'bug']);
    expect(issue.body).toBe(`Clicking save does nothing.

### Screenshots
![Screenshot 1](https://github.com/o/r/blob/issue-attachments/reports/2026/11/x/screenshot-1.png?raw=true)

### Context
| | |
|---|---|
| Page | \`/dashboard/patients/:id\` |
| Reported by | role DOCTOR · user \`user-1\` · branch \`branch-1\` |
| When | 2026-11-17 10:42 IST (Asia/Kolkata) |
| Browser | Mozilla/5.0 \\| Test |
| Viewport | 1440x900 @2x |
| App version | abc123 |

<details><summary>Recent requests (1)</summary>

| Time | Method | Resource | Status | Result | ms | Reference |
|---|---|---|---|---|---|---|
| 2026-11-17T05:11:58Z | PATCH | \`/api/patients/:id\` | 500 | internal_error | 120 | \`req-9\` |

</details>

<details><summary>Recent errors (1)</summary>

\`\`\`text
2026-11-17T05:11:59Z Boom
at save (app.js:1)
\`\`\`

</details>

<sub>Filed from the clinic app's "Report a problem" button.</sub>`);
  });

  it('renders a minimal idea with no description, screenshots or technical details', () => {
    const issue = buildIssue(
      { kind: 'idea', title: 'Dark mode', description: '', screenshots: [] },
      reporter,
      [],
      now,
    );

    expect(issue.title).toBe('[Idea] Dark mode');
    expect(issue.labels).toEqual(['user-report', 'enhancement']);
    expect(issue.body).toBe(`_No description given._

### Context
| | |
|---|---|
| Reported by | role DOCTOR · user \`user-1\` · branch \`branch-1\` |
| When | 2026-11-17 05:12 UTC (UTC) |

<sub>Filed from the clinic app's "Report a problem" button.</sub>`);
  });

  it('labels questions and keeps table cells on one line', () => {
    const issue = buildIssue(
      {
        kind: 'question',
        title: 'How?',
        description: 'x',
        screenshots: [],
        context: { ...fullReport.context!, userAgent: 'a\nb`c', recentRequests: [], recentErrors: [] },
      },
      reporter,
      [],
      now,
    );

    expect(issue.title).toBe('[Question] How?');
    expect(issue.labels).toEqual(['user-report', 'question']);
    expect(issue.body).toContain('| Browser | a b\\`c |');
    expect(issue.body).not.toContain('<details>');
  });
});
