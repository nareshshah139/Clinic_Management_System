import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const GITHUB_REJECTED_MESSAGE = "GitHub didn't accept the report. Try again in a minute.";

const API = 'https://api.github.com';
const DEFAULT_REPO = 'nareshshah139/Clinic_Management_System';
const DEFAULT_ATTACHMENTS_REPO = 'nareshshah139/clinic-issue-attachments';
const DEFAULT_BRANCH = 'issue-attachments';
const LOGGED_BODY_CHARS = 500;
const REQUEST_TIMEOUT_MS = 20_000;

interface GithubResponse {
  status: number;
  body: string;
}

export interface CreatedIssue {
  number: number;
  url: string;
}

@Injectable()
export class GithubIssuesClient {
  private readonly logger = new Logger(GithubIssuesClient.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.token;
  }

  attachmentUrl(path: string): string {
    return `https://github.com/${this.attachmentsRepo}/blob/${this.branch}/${path}?raw=true`;
  }

  async ensureBranch(): Promise<void> {
    const ref = `/repos/${this.attachmentsRepo}/git/ref/heads/${this.branch}`;
    const existing = await this.send('GET', ref);
    if (existing.status === 200) return;
    if (existing.status !== 404) throw this.reject('GET', ref, existing);

    const repo = await this.expectOk('GET', `/repos/${this.attachmentsRepo}`);
    const defaultBranch = this.field<string>(repo, 'default_branch');
    const head = await this.expectOk('GET', `/repos/${this.attachmentsRepo}/git/ref/heads/${defaultBranch}`);
    const sha = this.field<string>(head, 'object', 'sha');

    const createPath = `/repos/${this.attachmentsRepo}/git/refs`;
    const created = await this.send('POST', createPath, { ref: `refs/heads/${this.branch}`, sha });
    const alreadyExists = created.status === 422 && created.body.includes('already exists');
    if (created.status !== 201 && !alreadyExists) throw this.reject('POST', createPath, created);
  }

  async putFile(path: string, bytes: Buffer, message: string): Promise<void> {
    await this.expectOk('PUT', `/repos/${this.attachmentsRepo}/contents/${path}`, {
      message,
      content: bytes.toString('base64'),
      branch: this.branch,
    });
  }

  async createIssue(issue: { title: string; body: string; labels: string[] }): Promise<CreatedIssue> {
    const created = await this.expectOk('POST', `/repos/${this.repo}/issues`, issue);
    return { number: this.field<number>(created, 'number'), url: this.field<string>(created, 'html_url') };
  }

  private get token(): string | undefined {
    return this.config.get<string>('GITHUB_ISSUES_TOKEN')?.trim() || undefined;
  }

  private get repo(): string {
    return this.config.get<string>('GITHUB_ISSUES_REPO')?.trim() || DEFAULT_REPO;
  }

  private get attachmentsRepo(): string {
    return this.config.get<string>('GITHUB_ISSUES_ATTACHMENTS_REPO')?.trim() || DEFAULT_ATTACHMENTS_REPO;
  }

  private get branch(): string {
    return this.config.get<string>('GITHUB_ISSUES_ATTACHMENTS_BRANCH')?.trim() || DEFAULT_BRANCH;
  }

  private async send(method: string, path: string, payload?: unknown): Promise<GithubResponse> {
    try {
      const response = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return { status: response.status, body: await response.text() };
    } catch (error) {
      this.logger.error(`GitHub ${method} ${path} failed before a response: ${(error as Error).message}`);
      throw new BadGatewayException(GITHUB_REJECTED_MESSAGE);
    }
  }

  private async expectOk(method: string, path: string, payload?: unknown): Promise<unknown> {
    const response = await this.send(method, path, payload);
    if (response.status < 200 || response.status >= 300) throw this.reject(method, path, response);
    try {
      return JSON.parse(response.body);
    } catch {
      throw this.reject(method, path, response);
    }
  }

  private reject(method: string, path: string, response: GithubResponse): BadGatewayException {
    this.logger.error(
      `GitHub ${method} ${path} returned ${response.status}: ${response.body.slice(0, LOGGED_BODY_CHARS)}`,
    );
    return new BadGatewayException(GITHUB_REJECTED_MESSAGE);
  }

  private field<T>(value: unknown, ...keys: string[]): T {
    const found = keys.reduce<unknown>(
      (node, key) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[key] : undefined),
      value,
    );
    if (found === undefined || found === null) {
      this.logger.error(`GitHub response is missing ${keys.join('.')}`);
      throw new BadGatewayException(GITHUB_REJECTED_MESSAGE);
    }
    return found as T;
  }
}
