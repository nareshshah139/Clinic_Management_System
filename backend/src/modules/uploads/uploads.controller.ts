import {
  Controller,
  Get,
  Param,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

interface AuthenticatedRequest {
  branchId?: string;
  user: { id: string; branchId: string; role: string };
}

@ApiTags('Uploads')
@Controller('uploads')
@Roles(...CLINIC_STAFF_ROLES)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * @cc [owner:nareshshah139,label:security] uploads-require-clinic-staff
   * Files under uploads/ MUST be served only by this route, to signed-in clinic staff, scoped to
   * the request branch. The response MUST be private and uncacheable and MUST forbid type sniffing.
   */
  @Get('*path')
  async read(
    @Param('path') path: string | string[],
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, contentType } = await this.uploads.read(
      path,
      req.branchId ?? req.user.branchId,
    );
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(data);
  }
}
