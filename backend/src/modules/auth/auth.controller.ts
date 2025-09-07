import { Body, Controller, HttpException, HttpStatus, Post, Res, SetMetadata } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';

export const Public = () => SetMetadata('isPublic', true);

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
} 