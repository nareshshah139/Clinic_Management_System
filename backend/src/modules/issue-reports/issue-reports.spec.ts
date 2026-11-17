import { ExecutionContext, INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../shared/logging/http-observability';
import { GithubIssuesClient } from './github-issues.client';
import { IssueReportsController } from './issue-reports.controller';
import { IssueReportsService } from './issue-reports.service';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('pixels')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('pixels')]);
const NOT_AN_IMAGE = Buffer.from('<html>definitely not an image</html>');

type FakeResponse = { status: number; body: unknown };
interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

describe('issue reports over HTTP', () => {
  let app: INestApplication;
  let env: Record<string, string | undefined>;
  let calls: Call[];
  let replies: FakeResponse[];
  const realFetch = global.fetch;

  const respond = (status: number, body: unknown = {}): FakeResponse => ({ status, body });

  beforeAll(async () => {
    const auth = {
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { id: 'u1', branchId: 'b1', role: req.headers['x-role'] };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [IssueReportsController],
      providers: [
        IssueReportsService,
        GithubIssuesClient,
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        { provide: APP_GUARD, useValue: auth },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await app.close();
  });

  beforeEach(() => {
    env = { GITHUB_ISSUES_TOKEN: 'ghp_secret_token' };
    calls = [];
    replies = [];
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    jest.setSystemTime(new Date('2026-11-17T05:12:00Z'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const next = replies.shift() ?? respond(500, { message: 'unexpected call' });
      return new Response(JSON.stringify(next.body), { status: next.status });
    }) as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const post = (role = 'RECEPTION') =>
    request(app.getHttpServer()).post('/issue-reports').set('x-role', role);

  it('reports status as enabled only when a token is configured', async () => {
    const on = await request(app.getHttpServer()).get('/issue-reports/status').set('x-role', 'NURSE');
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ enabled: true });

    env = {};
    const off = await request(app.getHttpServer()).get('/issue-reports/status').set('x-role', 'NURSE');
    expect(off.body).toEqual({ enabled: false });
  });

  it('keeps patients and lab technicians out', async () => {
    expect((await request(app.getHttpServer()).get('/issue-reports/status').set('x-role', 'PATIENT')).status).toBe(403);
    expect((await post('LAB_TECHNICIAN').field('kind', 'bug').field('title', 'Broken')).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('uploads screenshots in order to a fresh branch then files the issue', async () => {
    replies = [
      respond(404, { message: 'Not Found' }),
      respond(200, { default_branch: 'main' }),
      respond(200, { object: { sha: 'abc123' } }),
      respond(201, {}),
      respond(201, {}),
      respond(201, {}),
      respond(201, { number: 42, html_url: 'https://github.com/nareshshah139/Clinic_Management_System/issues/42' }),
    ];

    const res = await post()
      .field('kind', 'bug')
      .field('title', '  Save fails  ')
      .field('description', 'Nothing happens')
      .attach('screenshots', PNG, 'a.png')
      .attach('screenshots', JPEG, 'b.jpg');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ number: 42, url: 'https://github.com/nareshshah139/Clinic_Management_System/issues/42' });

    const repo = 'https://api.github.com/repos/nareshshah139/Clinic_Management_System';
    expect(calls.map((c) => `${c.method} ${c.url.replace(repo, '')}`)).toEqual([
      'GET /git/ref/heads/issue-attachments',
      'GET ',
      'GET /git/ref/heads/main',
      'POST /git/refs',
      expect.stringMatching(/^PUT \/contents\/reports\/2026\/11\/[0-9a-f-]{36}\/screenshot-1\.png$/),
      expect.stringMatching(/^PUT \/contents\/reports\/2026\/11\/[0-9a-f-]{36}\/screenshot-2\.jpg$/),
      'POST /issues',
    ]);
    expect(calls[3].body).toEqual({ ref: 'refs/heads/issue-attachments', sha: 'abc123' });
    expect(calls[4].body).toEqual({
      message: 'Add screenshot 1 for a user report',
      content: PNG.toString('base64'),
      branch: 'issue-attachments',
    });
    expect(calls[0].headers).toMatchObject({
      Authorization: 'Bearer ghp_secret_token',
      'X-GitHub-Api-Version': '2022-11-28',
    });

    const folder = calls[4].url.match(/contents\/(reports\/2026\/11\/[0-9a-f-]{36})\//)![1];
    const issue = calls[6].body as { title: string; labels: string[]; body: string };
    expect(issue.title).toBe('[Bug] Save fails');
    expect(issue.labels).toEqual(['user-report', 'bug']);
    expect(issue.body).toContain(
      `![Screenshot 1](https://github.com/nareshshah139/Clinic_Management_System/blob/issue-attachments/${folder}/screenshot-1.png?raw=true)`,
    );
    expect(issue.body).toContain('| Reported by | role RECEPTION · user `u1` · branch `b1` |');
  });

  it('sends the branch and screenshots to the attachments repo and the issue to the issues repo', async () => {
    env = {
      ...env,
      GITHUB_ISSUES_REPO: 'acme/clinic',
      GITHUB_ISSUES_ATTACHMENTS_REPO: ' acme/clinic-attachments ',
    };
    replies = [
      respond(404),
      respond(200, { default_branch: 'main' }),
      respond(200, { object: { sha: 'abc123' } }),
      respond(201, {}),
      respond(201, {}),
      respond(201, { number: 3, html_url: 'https://github.com/acme/clinic/issues/3' }),
    ];

    const res = await post().field('kind', 'bug').field('title', 'Private shot').attach('screenshots', PNG, 'a.png');

    expect(res.status).toBe(201);
    const folder = calls[4].url.match(/contents\/(reports\/2026\/11\/[0-9a-f-]{36})\//)![1];
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.github.com/repos/acme/clinic-attachments/git/ref/heads/issue-attachments',
      'GET https://api.github.com/repos/acme/clinic-attachments',
      'GET https://api.github.com/repos/acme/clinic-attachments/git/ref/heads/main',
      'POST https://api.github.com/repos/acme/clinic-attachments/git/refs',
      `PUT https://api.github.com/repos/acme/clinic-attachments/contents/${folder}/screenshot-1.png`,
      'POST https://api.github.com/repos/acme/clinic/issues',
    ]);
    expect((calls[5].body as { body: string }).body).toContain(
      `![Screenshot 1](https://github.com/acme/clinic-attachments/blob/issue-attachments/${folder}/screenshot-1.png?raw=true)`,
    );
  });

  it('skips the branch when the report has no screenshots and the branch already exists', async () => {
    replies = [respond(201, { number: 7, html_url: 'https://github.com/o/r/issues/7' })];
    const res = await post().field('kind', 'question').field('title', 'How do I?');
    expect(res.status).toBe(201);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://api.github.com/repos/nareshshah139/Clinic_Management_System/issues',
    ]);

    calls = [];
    replies = [respond(200, {}), respond(201, {}), respond(201, { number: 8, html_url: 'https://github.com/o/r/issues/8' })];
    const withShot = await post().field('kind', 'idea').field('title', 'Nice').attach('screenshots', PNG, 'a.png');
    expect(withShot.body).toEqual({ number: 8, url: 'https://github.com/o/r/issues/8' });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'POST']);
  });

  it('treats a concurrent branch creation as success', async () => {
    replies = [
      respond(404),
      respond(200, { default_branch: 'main' }),
      respond(200, { object: { sha: 'abc123' } }),
      respond(422, { message: 'Reference already exists' }),
      respond(201, {}),
      respond(201, { number: 9, html_url: 'https://github.com/o/r/issues/9' }),
    ];
    const res = await post().field('kind', 'bug').field('title', 'Race').attach('screenshots', PNG, 'a.png');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ number: 9, url: 'https://github.com/o/r/issues/9' });
  });

  it('answers 503 without calling GitHub when no token is configured', async () => {
    env = {};
    const res = await post().field('kind', 'bug').field('title', 'Broken');
    expect(res.status).toBe(503);
    expect(res.body.message).toBe("Issue reporting isn't set up yet. Ask an admin to add a GitHub token.");
    expect(calls).toEqual([]);
  });

  it('rejects a file whose bytes are not an image even when it claims image/png', async () => {
    const res = await post()
      .field('kind', 'bug')
      .field('title', 'Broken')
      .attach('screenshots', NOT_AN_IMAGE, { filename: 'fake.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Screenshot 1 isn't a PNG, JPEG or WebP image.");
    expect(calls).toEqual([]);
  });

  it.each([
    [{ kind: 'rant', title: 'Broken' }, 'Pick bug, idea or question as the kind.'],
    [{ kind: 'bug', title: 'ab' }, 'The title needs 3 to 120 characters.'],
    [{ kind: 'bug', title: 'Fine', description: 'x'.repeat(5001) }, 'The description can be at most 5000 characters.'],
    [{ kind: 'bug', title: 'Fine', context: '{nope' }, "Technical details aren't valid JSON."],
  ])('rejects invalid fields %#', async (fields, message) => {
    const res = await post().field(fields as Record<string, string>);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    expect(calls).toEqual([]);
  });

  it('answers 502 with the plain message and never leaks the token when GitHub returns 401', async () => {
    replies = [respond(401, { message: 'Bad credentials' })];
    const res = await post().field('kind', 'bug').field('title', 'Broken');
    expect(res.status).toBe(502);
    expect(res.body.message).toBe("GitHub didn't accept the report. Try again in a minute.");
    expect(JSON.stringify(res.body)).not.toContain('ghp_secret_token');
    const logged = (Logger.prototype.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('returned 401: {"message":"Bad credentials"}');
    expect(logged).not.toContain('ghp_secret_token');
  });

  it('answers 502 when GitHub is unreachable', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('socket hang up');
    }) as typeof fetch;
    const res = await post().field('kind', 'bug').field('title', 'Broken');
    expect(res.status).toBe(502);
  });
});
