import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GithubIssuesClient, type CreatedIssue } from './github-issues.client';
import { buildIssue } from './issue-report.body';
import type { IssueReport, Reporter } from './issue-report';

export const NOT_CONFIGURED_MESSAGE = "Issue reporting isn't set up yet. Ask an admin to add a GitHub token.";

@Injectable()
export class IssueReportsService {
  constructor(private readonly github: GithubIssuesClient) {}

  isEnabled(): boolean {
    return this.github.enabled;
  }

  async submit(report: IssueReport, reporter: Reporter): Promise<CreatedIssue> {
    if (!this.github.enabled) throw new ServiceUnavailableException(NOT_CONFIGURED_MESSAGE);
    const now = new Date();
    const urls = await this.uploadScreenshots(report, now);
    return this.github.createIssue(buildIssue(report, reporter, urls, now));
  }

  private async uploadScreenshots(report: IssueReport, now: Date): Promise<string[]> {
    if (report.screenshots.length === 0) return [];
    await this.github.ensureBranch();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const folder = `reports/${now.getUTCFullYear()}/${month}/${randomUUID()}`;
    const urls: string[] = [];
    for (const [index, shot] of report.screenshots.entries()) {
      const path = `${folder}/screenshot-${index + 1}.${shot.extension}`;
      await this.github.putFile(path, shot.bytes, `Add screenshot ${index + 1} for a user report`);
      urls.push(this.github.attachmentUrl(path));
    }
    return urls;
  }
}
