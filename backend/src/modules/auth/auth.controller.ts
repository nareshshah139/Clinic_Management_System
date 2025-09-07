import { Body, Controller, HttpException, HttpStatus, Post, Res, SetMetadata, Get, Request } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { PrismaService } from '../../shared/database/prisma.service';

export const Public = () => SetMetadata('isPublic', true);

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const { phone, password } = body || {};
    if (!phone || !password) {
      throw new HttpException('phone and password are required', HttpStatus.BAD_REQUEST);
    }
    const user = await this.authService.validateUser(phone, password);
    if (!user) {
      throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
    const { access_token } = await this.authService.login(user);
    res.cookie('auth_token', access_token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { access_token, user };
  }

  @Get('statistics')
  async getStatistics(@Request() req: AuthenticatedRequest) {
    const branchId = req.user.branchId;
    
    try {
      const [userCount, branchCount] = await Promise.all([
        this.prisma.user.count({ where: { branchId, isActive: true } }),
        this.prisma.branch.count({ where: { isActive: true } }),
      ]);

      return {
        users: {
          total: userCount,
          active: userCount,
        },
        branches: {
          total: branchCount,
          active: branchCount,
        },
        system: {
          status: 'operational',
          version: '1.0.0',
          uptime: process.uptime(),
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new HttpException('Failed to fetch statistics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
