import { BadRequestException, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CLINIC_STAFF_ROLES } from '../../shared/decorators/clinic-staff-roles';
import { Roles } from '../../shared/decorators/roles.decorator';
import { PrismaService } from '../../shared/database/prisma.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/email')
@Roles(...CLINIC_STAFF_ROLES)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  status() {
    return this.notifications.emailStatus();
  }

  @Post('test')
  async test(@Request() req: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true },
    });
    if (!user?.email) {
      throw new BadRequestException('Your account has no email address to send a test to.');
    }
    await this.notifications.sendEmail({
      to: user.email,
      subject: 'Test email from your clinic',
      text: 'Email sending is working.',
    });
    return { sent: true, to: user.email };
  }
}
