import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { PharmacyAgentService } from './pharmacy-agent.service';
import {
  CreatePharmacyAgentSessionDto,
  RejectPharmacyAgentProposalDto,
  SendPharmacyAgentMessageDto,
} from './dto/pharmacy-agent.dto';

const AGENT_ATTACHMENT_LIMIT_BYTES = (() => {
  const mb = Number(process.env.PHARMACY_AGENT_MAX_FILE_MB || 25);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
})();

function agentAttachmentFilter(_req: any, file: any, cb: any) {
  const mime = file?.mimetype || '';
  const name = file?.originalname || '';
  const allowed =
    /^image\//i.test(mime) ||
    mime === 'application/pdf' ||
    mime === 'text/csv' ||
    /\.(xlsx|xls|csv|pdf)$/i.test(name);
  if (!allowed) {
    cb(new Error('Only Excel, CSV, image, and PDF files are supported'), false);
    return;
  }
  cb(null, true);
}

@ApiTags('Pharmacy Agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.MANAGER, UserRole.DOCTOR)
@Permissions('pharmacy:agent:use')
@Controller('pharmacy/agent')
export class PharmacyAgentController {
  constructor(private readonly pharmacyAgentService: PharmacyAgentService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check embedded Codex OAuth status' })
  getCodexStatus() {
    return this.pharmacyAgentService.getCodexStatus();
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List Agentic Pharmacy sessions for the user' })
  listSessions(@Request() req: any) {
    return this.pharmacyAgentService.listSessions(req.user);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Create an Agentic Pharmacy session' })
  createSession(
    @Body() dto: CreatePharmacyAgentSessionDto,
    @Request() req: any,
  ) {
    return this.pharmacyAgentService.createSession(dto, req.user);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get an Agentic Pharmacy session' })
  getSession(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.pharmacyAgentService.getSession(sessionId, req.user);
  }

  @Post('sessions/:sessionId/archive')
  @ApiOperation({ summary: 'Move an Agentic Pharmacy thread to history' })
  archiveSession(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.pharmacyAgentService.archiveSession(sessionId, req.user);
  }

  @Post('sessions/:sessionId/restore')
  @ApiOperation({ summary: 'Restore an Agentic Pharmacy thread from history' })
  restoreSession(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.pharmacyAgentService.restoreSession(sessionId, req.user);
  }

  @Post('sessions/:sessionId/messages')
  @ApiOperation({
    summary: 'Send a message to embedded Codex for pharmacy work',
  })
  sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendPharmacyAgentMessageDto,
    @Request() req: any,
  ) {
    return this.pharmacyAgentService.sendMessage(sessionId, dto, req.user);
  }

  @Post('sessions/:sessionId/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach Excel, CSV, image, or PDF context' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: agentAttachmentFilter,
      limits: {
        fileSize: AGENT_ATTACHMENT_LIMIT_BYTES,
        files: 1,
      },
    }),
  )
  attachFile(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.pharmacyAgentService.attachFile(sessionId, file, req.user);
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get a Codex run status/output' })
  getRun(@Param('runId') runId: string, @Request() req: any) {
    return this.pharmacyAgentService.getRun(runId, req.user);
  }

  @Get('sessions/:sessionId/proposals')
  @ApiOperation({ summary: 'List staged Agentic Pharmacy proposals' })
  listProposals(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.pharmacyAgentService.listProposals(sessionId, req.user);
  }

  @Post('proposals/:proposalId/apply')
  @Permissions('pharmacy:agent:use', 'pharmacy:agent:proposal:apply')
  @ApiOperation({ summary: 'Apply a reviewed Agentic Pharmacy proposal' })
  applyProposal(@Param('proposalId') proposalId: string, @Request() req: any) {
    return this.pharmacyAgentService.applyProposal(proposalId, req.user);
  }

  @Post('proposals/:proposalId/reject')
  @ApiOperation({ summary: 'Reject a staged Agentic Pharmacy proposal' })
  rejectProposal(
    @Param('proposalId') proposalId: string,
    @Body() dto: RejectPharmacyAgentProposalDto,
    @Request() req: any,
  ) {
    return this.pharmacyAgentService.rejectProposal(proposalId, dto, req.user);
  }
}
