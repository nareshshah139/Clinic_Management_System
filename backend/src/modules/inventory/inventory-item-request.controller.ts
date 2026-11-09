import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import {
  InventoryItemRequestService,
  ItemRequestActor,
} from './inventory-item-request.service';
import { ReviewInventoryItemRequestDto } from './dto/inventory-item-request.dto';

interface AuthenticatedRequest {
  user: ItemRequestActor;
}

@Controller('inventory/item-requests')
@UseGuards(JwtAuthGuard)
export class InventoryItemRequestController {
  constructor(private readonly requests: InventoryItemRequestService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions('inventory:item:read')
  list(@Query('status') status: string, @Request() req: AuthenticatedRequest) {
    return this.requests.list(req.user, status);
  }

  @Get('pending-count')
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.RECEPTION)
  @Permissions('inventory:item:read')
  pendingCount(@Request() req: AuthenticatedRequest) {
    return this.requests.pendingCount(req.user);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @Permissions('inventory:item:approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewInventoryItemRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.requests.approve(id, req.user, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.DOCTOR)
  @Permissions('inventory:item:approve')
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewInventoryItemRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.requests.reject(id, req.user, dto.note);
  }
}
