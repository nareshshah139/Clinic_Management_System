import { Body, Controller, Get, Param, Post, Request, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AssignMessageDto, LogCallDto, ResolveItemDto, StaffReplyDto } from './dto/worklist.dto';
import { Staff, WorklistService } from './worklist.service';

type Req = { user: { id: string; branchId: string; role: UserRole }; branchId?: string };

const staff = (req: Req): Staff => ({ id: req.user.id, role: req.user.role, branchId: req.branchId ?? req.user.branchId });

/**
 * @cc [owner:nareshshah139,label:security] worklist-roles
 * The follow-up worklist and clinic inbox MUST admit doctors, nurses, reception, managers, admins
 * and owners only (PP-47).
 */
@ApiTags('Follow-ups')
@Controller('follow-ups')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorklistController {
  constructor(private readonly worklist: WorklistService) {}

  @Get('items')
  items(@Request() req: Req) {
    return this.worklist.listItems(staff(req).branchId);
  }

  @Get('items/:id')
  item(@Param('id') id: string, @Request() req: Req) {
    return this.worklist.getItem(id, staff(req));
  }

  @Post('items/:id/claim')
  claim(@Param('id') id: string, @Request() req: Req) {
    return this.worklist.claim(id, staff(req));
  }

  @Post('items/:id/release')
  release(@Param('id') id: string, @Request() req: Req) {
    return this.worklist.release(id, staff(req));
  }

  @Post('items/:id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveItemDto, @Request() req: Req) {
    return this.worklist.resolve(id, staff(req), dto.code, dto.note);
  }

  @Post('items/:id/read')
  read(@Param('id') id: string, @Request() req: Req) {
    return this.worklist.markRead(id, staff(req));
  }

  @Post('items/:id/reply')
  reply(@Param('id') id: string, @Body() dto: StaffReplyDto, @Request() req: Req) {
    return this.worklist.reply(id, staff(req), dto.body);
  }

  @Post('items/:id/log-call')
  logCall(@Param('id') id: string, @Body() dto: LogCallDto, @Request() req: Req) {
    return this.worklist.logCall(id, staff(req), dto.note);
  }

  @Post('messages/:id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignMessageDto, @Request() req: Req) {
    return this.worklist.assignMessage(id, staff(req), dto.patientId);
  }

  @Post('messages/:id/confirm')
  confirm(@Param('id') id: string, @Request() req: Req) {
    return this.worklist.confirmMessage(id, staff(req));
  }

  @Get('waiting')
  waiting(@Request() req: Req) {
    return this.worklist.listWaiting(staff(req).branchId);
  }

  @Get('threads')
  threads(@Request() req: Req) {
    return this.worklist.listThreads(staff(req).branchId);
  }

  @Get('patients/:patientId/timeline')
  timeline(@Param('patientId') patientId: string, @Request() req: Req) {
    return this.worklist.timeline(patientId, staff(req).branchId);
  }

  @Get('attachments/:id')
  async attachment(@Param('id') id: string, @Request() req: Req, @Res({ passthrough: true }) res: Response) {
    const { bytes, contentType } = await this.worklist.attachment(id, staff(req).branchId);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(bytes);
  }
}
