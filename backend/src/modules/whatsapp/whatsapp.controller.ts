import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Public } from '../auth/auth.controller';
import { hasValidMetaSignature, parseStatusUpdates } from './message-status';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppService } from './whatsapp.service';

const MANAGE = [UserRole.OWNER, UserRole.ADMIN];

interface AuthenticatedRequest {
  user: { id: string; branchId: string; role: string };
}

class LinkWhatsAppDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  accessToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  phoneNumberId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessAccountId?: string;
}

class PrescriptionTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string | null;

  @ValidateIf((dto: PrescriptionTemplateDto) => dto.name != null)
  @IsString()
  @IsNotEmpty()
  language?: string;
}

class TestPrescriptionDto {
  @IsString()
  @IsNotEmpty()
  to!: string;
}

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
@Roles(...CLINIC_STAFF_ROLES)
export class WhatsAppController {
  constructor(
    private readonly connections: WhatsAppConnectionService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Get('connection')
  connection(@Request() req: AuthenticatedRequest) {
    return this.connections.view(req.user.branchId, { fresh: true });
  }

  @Put('connection')
  @Roles(...MANAGE)
  link(@Request() req: AuthenticatedRequest, @Body() body: LinkWhatsAppDto) {
    return this.connections.link(req.user, body);
  }

  @Patch('connection/prescription-template')
  @Roles(...MANAGE)
  setPrescriptionTemplate(
    @Request() req: AuthenticatedRequest,
    @Body() body: PrescriptionTemplateDto,
  ) {
    return this.connections.setPrescriptionTemplate(
      req.user.branchId,
      body.name ? { name: body.name, language: body.language! } : null,
    );
  }

  @Get('connection/templates')
  @Roles(...MANAGE)
  templates(@Request() req: AuthenticatedRequest) {
    return this.connections.templates(req.user.branchId);
  }

  @Post('connection/test')
  @HttpCode(200)
  @Roles(...MANAGE)
  sendTest(
    @Request() req: AuthenticatedRequest,
    @Body() body: TestPrescriptionDto,
  ) {
    return this.connections.sendTestPrescription(req.user, body.to);
  }

  @Delete('connection')
  @Roles(...MANAGE)
  unlink(@Request() req: AuthenticatedRequest) {
    return this.connections.unlink(req.user.branchId);
  }

  @Get('messages')
  @Roles(...MANAGE)
  messages(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.connections.recentMessages(
      req.user.branchId,
      Number(limit ?? 20),
    );
  }

  /**
   * @cc [owner:nareshshah139,label:security] whatsapp-webhook-public
   * The webhook routes MUST work without a login. Verification MUST echo hub.challenge only when
   * hub.verify_token equals WHATSAPP_WEBHOOK_VERIFY_TOKEN. When META_APP_SECRET is set, a status
   * delivery MUST be rejected unless X-Hub-Signature-256 signs the exact request bytes.
   */
  @Public()
  @Get('webhook')
  @Header('Content-Type', 'text/plain')
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode !== 'subscribe' || !expected || token !== expected || !challenge)
      throw new ForbiddenException('Webhook verification failed');
    return challenge;
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(@Req() req: ExpressRequest & { rawBody?: Buffer }) {
    const secret = process.env.META_APP_SECRET;
    if (
      secret &&
      !hasValidMetaSignature(
        req.rawBody,
        req.header('x-hub-signature-256'),
        secret,
      )
    )
      throw new UnauthorizedException('Invalid webhook signature');
    return {
      updated: await this.whatsapp.applyStatusUpdates(
        parseStatusUpdates(req.body),
      ),
    };
  }
}
