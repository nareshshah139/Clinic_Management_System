import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

interface CreateTemplateDto {
  name: string;
  touchpoint: string;
  language?: string;
  contentHtml?: string;
  contentText: string;
  variables?: string[];
}

interface UpdateTemplateDto extends Partial<CreateTemplateDto> {
  isActive?: boolean;
}

@Injectable()
export class WhatsAppTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(branchId: string, ownerId: string | null, dto: CreateTemplateDto) {
    const tpl = await this.prisma.whatsAppTemplate.create({
      data: {
        branchId,
        ownerId: ownerId || null,
        name: dto.name,
        touchpoint: dto.touchpoint,
        language: dto.language || null,
        contentHtml: dto.contentHtml || null,
        contentText: dto.contentText,
        variables: dto.variables ? JSON.stringify(dto.variables) : null,
      },
    });
    return this.hydrate(tpl);
  }

  async findAll(branchId: string, ownerId?: string | null, touchpoint?: string) {
    const where: any = { branchId };
    if (touchpoint) where.touchpoint = touchpoint;
    // Admins can see all; doctors see their own plus branch-level (ownerId null)
    if (ownerId) {
      where.OR = [{ ownerId }, { ownerId: null }];
    }
    const list = await this.prisma.whatsAppTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return list.map((r) => this.hydrate(r));
  }

  async findOne(branchId: string, id: string) {
    const tpl = await this.prisma.whatsAppTemplate.findFirst({ where: { id, branchId } });
    if (!tpl) throw new NotFoundException('Template not found');
    return this.hydrate(tpl);
  }

  async update(branchId: string, id: string, requesterId: string, isAdminOrOwner: boolean, dto: UpdateTemplateDto) {
    // Enforce ownership unless admin
    const existing = await this.prisma.whatsAppTemplate.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Template not found');
    if (!isAdminOrOwner && existing.ownerId && existing.ownerId !== requesterId) {
      throw new ForbiddenException('Not allowed to edit this template');
    }

    const updated = await this.prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        touchpoint: dto.touchpoint ?? undefined,
        language: dto.language ?? undefined,
        contentHtml: dto.contentHtml ?? undefined,
        contentText: dto.contentText ?? undefined,
        variables: dto.variables ? JSON.stringify(dto.variables) : undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    return this.hydrate(updated);
  }

  async remove(branchId: string, id: string, requesterId: string, isAdminOrOwner: boolean) {
    const existing = await this.prisma.whatsAppTemplate.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException('Template not found');
    if (!isAdminOrOwner && existing.ownerId && existing.ownerId !== requesterId) {
      throw new ForbiddenException('Not allowed to delete this template');
    }
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { success: true };
  }

  private hydrate(row: any) {
    return {
      ...row,
      variables: row.variables ? (JSON.parse(row.variables) as string[]) : [],
    };
  }
}


