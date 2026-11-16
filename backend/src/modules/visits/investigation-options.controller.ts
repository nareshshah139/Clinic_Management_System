import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { InvestigationOptionsService } from './investigation-options.service';

class InvestigationNameDto {
  @IsString()
  @MaxLength(160)
  name!: string;
}

class InvestigationRevisionDto {
  @IsInt()
  @Min(0)
  version!: number;
}

class InvestigationUpdateDto extends InvestigationNameDto {
  @IsInt()
  @Min(0)
  version!: number;
}

type CatalogRequest = { user: { branchId: string } };

/**
 * @cc [owner:nareshshah139,label:security] investigation-catalog-authority
 * Only authenticated doctors, owners and administrators may change the catalog.
 * Authenticated clinical staff may read the available options.
 * The branch MUST come from authentication, never from the submitted payload.
 */
@Controller('investigation-options')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR, UserRole.OWNER, UserRole.ADMIN)
export class InvestigationOptionsController {
  constructor(private readonly catalog: InvestigationOptionsService) {}

  @Get()
  @Roles(UserRole.DOCTOR, UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.NURSE, UserRole.RECEPTION, UserRole.LAB_TECH)
  list(@Request() req: CatalogRequest) { return this.catalog.list(req.user.branchId); }

  @Post()
  create(@Request() req: CatalogRequest, @Body() body: InvestigationNameDto) {
    return this.catalog.create(req.user.branchId, body.name);
  }

  @Patch(':id')
  update(@Request() req: CatalogRequest, @Param('id') id: string, @Body() body: InvestigationUpdateDto) {
    return this.catalog.update(req.user.branchId, id, body.name, body.version);
  }

  @Post(':id/archive')
  archive(@Request() req: CatalogRequest, @Param('id') id: string, @Body() body: InvestigationRevisionDto) {
    return this.catalog.archive(req.user.branchId, id, body.version);
  }
}
