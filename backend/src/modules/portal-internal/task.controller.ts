import { Body, Controller, HttpCode, Post, UseFilters } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { LinkInactiveFilter } from '../portal/link-inactive';
import { SubmitDto } from '../portal/task.dto';
import { TaskPageService } from '../portal/task.service';
import { Caller, PortalInternal } from './portal-internal.decorator';
import type { PortalCaller } from './portal-call';
import { taskLinkOf } from './task-link-caller';

/** The task-link page for the portal service. Both routes are POST; no GET reveals anything (PP-37). */
@Controller('internal/portal/task')
@PortalInternal()
@UseFilters(LinkInactiveFilter)
export class InternalTaskController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TaskPageService,
  ) {}

  @Post('questions')
  @HttpCode(200)
  async questions(@Caller() caller: PortalCaller) {
    return this.tasks.page(await taskLinkOf(this.prisma, caller));
  }

  @Post('responses')
  @HttpCode(200)
  async submit(@Caller() caller: PortalCaller, @Body() body: SubmitDto) {
    return this.tasks.submit(await taskLinkOf(this.prisma, caller), body);
  }
}
