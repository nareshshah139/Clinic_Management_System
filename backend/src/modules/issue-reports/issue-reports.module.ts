import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubIssuesClient } from './github-issues.client';
import { IssueReportsController } from './issue-reports.controller';
import { IssueReportsService } from './issue-reports.service';

@Module({
  imports: [ConfigModule],
  controllers: [IssueReportsController],
  providers: [IssueReportsService, GithubIssuesClient],
})
export class IssueReportsModule {}
