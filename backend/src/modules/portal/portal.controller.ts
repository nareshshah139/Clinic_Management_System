import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Portal, TaskLink } from './portal.decorator';
import type { TaskLinkPrincipal } from './principal';
import { QuestionsDto, SubmitDto } from './task.dto';
import { TaskPageService } from './task.service';

/** Patient-facing task-link routes. Every route is POST: no GET changes or reveals anything (PP-37). */
@ApiTags('Portal')
@Controller('portal/task')
export class PortalController {
  constructor(private readonly tasks: TaskPageService) {}

  @Post('questions')
  @HttpCode(200)
  @Portal()
  questions(@TaskLink() principal: TaskLinkPrincipal, @Body() _: QuestionsDto) {
    return this.tasks.page(principal);
  }

  @Post('responses')
  @HttpCode(200)
  @Portal()
  submit(@TaskLink() principal: TaskLinkPrincipal, @Body() body: SubmitDto) {
    return this.tasks.submit(principal, body);
  }
}
