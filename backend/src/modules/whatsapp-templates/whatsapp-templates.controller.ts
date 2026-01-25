import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';

class CreateTemplateBody {
  name!: string;
  touchpoint!: string;
  language?: string;
  contentHtml?: string;
  contentText!: string;
  variables?: string[];
  ownerScope?: 'ME' | 'BRANCH';
}

class UpdateTemplateBody {
  name?: string;
  touchpoint?: string;
  language?: string;
  contentHtml?: string;
  contentText?: string;
  variables?: string[];
  isActive?: boolean;
}

class GenerateTemplateBody {
  touchpoint!: string;
  language?: string;
  variables?: string[];
  hints?: string;
  tone?: 'formal' | 'friendly' | 'concise' | 'detailed';
}

class SendTestBody {
  to!: string; // E.164
  variables?: Record<string, string>;
}

@ApiTags('WhatsApp Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('whatsapp/templates')
export class WhatsAppTemplatesController {
  constructor(private readonly svc: WhatsAppTemplatesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'List WhatsApp templates (doctor sees own + branch, admin sees all)' })
  async list(@Query('touchpoint') touchpoint: string | undefined, @Request() req: any) {
    const role: string = req.user?.role;
    const isAdmin = role === 'ADMIN' || role === 'OWNER';
    const ownerId = isAdmin ? null : req.user?.id;
    return this.svc.findAll(req.user.branchId, ownerId, touchpoint);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Create a WhatsApp template (doctor can create personal; admin can create branch-level)' })
  async create(@Body() body: CreateTemplateBody, @Request() req: any) {
    const role: string = req.user?.role;
    const isAdmin = role === 'ADMIN' || role === 'OWNER';
    const ownerScope = body.ownerScope || 'ME';
    const ownerId = isAdmin && ownerScope === 'BRANCH' ? null : req.user.id;
    return this.svc.create(req.user.branchId, ownerId, body);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Update a WhatsApp template' })
  async update(@Param('id') id: string, @Body() body: UpdateTemplateBody, @Request() req: any) {
    const role: string = req.user?.role;
    const isAdminOrOwner = role === 'ADMIN' || role === 'OWNER';
    return this.svc.update(req.user.branchId, id, req.user.id, isAdminOrOwner, body);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Delete a WhatsApp template' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const role: string = req.user?.role;
    const isAdminOrOwner = role === 'ADMIN' || role === 'OWNER';
    return this.svc.remove(req.user.branchId, id, req.user.id, isAdminOrOwner);
  }

  @Post('generate')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Generate a WhatsApp template suggestion via OpenAI GPT' })
  async generate(@Body() body: GenerateTemplateBody) {
    return this.svc.generate(body);
  }

  @Post(':id/test')
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Send a test WhatsApp message using this template' })
  async sendTest(@Param('id') id: string, @Body() body: SendTestBody, @Request() req: any) {
    const role: string = req.user?.role;
    const isAdminOrOwner = role === 'ADMIN' || role === 'OWNER';
    return this.svc.sendTest({
      templateId: id,
      branchId: req.user.branchId,
      requesterId: req.user.id,
      isAdminOrOwner,
      toPhoneE164: body.to,
      variables: body.variables,
    });
  }
}


