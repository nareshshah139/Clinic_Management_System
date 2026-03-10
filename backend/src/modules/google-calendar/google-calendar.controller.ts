import { Controller, Get, Post, Query, Body, Param, Request, UseGuards, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';

interface AuthenticatedRequest {
  user: { sub: string; id?: string };
}

@ApiTags('GoogleCalendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(private readonly googleCalendar: GoogleCalendarService) {}

  @Get('configured')
  async configured() {
    return { configured: this.googleCalendar.isConfigured() };
  }

  @Get('status')
  async status(@Request() req: AuthenticatedRequest) {
    const userId = req.user?.sub || req.user?.id;
    return this.googleCalendar.getStatus(userId);
  }

  @Get('status/:doctorId')
  async doctorStatus(@Param('doctorId') doctorId: string) {
    return this.googleCalendar.getStatus(doctorId);
  }

  @Get('auth-url')
  async authUrl(@Request() req: AuthenticatedRequest, @Query('redirect') redirect?: string) {
    const state = redirect || '/dashboard/appointments';
    const url = await this.googleCalendar.generateAuthUrl(state);
    return { url };
  }

  @Post('exchange')
  async exchange(
    @Request() req: AuthenticatedRequest,
    @Body('code') code: string,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const result = await this.googleCalendar.handleOAuthCallback(userId, code);
    return { success: true, ...result };
  }

  @Post('disconnect')
  async disconnect(@Request() req: AuthenticatedRequest) {
    const userId = req.user?.sub || req.user?.id;
    await this.googleCalendar.disconnect(userId);
    return { success: true };
  }

  @Get('callback')
  async callback(
    @Request() req: AuthenticatedRequest,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const userId = req.user?.sub || req.user?.id;
    await this.googleCalendar.handleOAuthCallback(userId, code);

    const redirect = typeof state === 'string' && state ? state : '/dashboard/appointments';
    res.redirect(303, redirect);
  }
}

