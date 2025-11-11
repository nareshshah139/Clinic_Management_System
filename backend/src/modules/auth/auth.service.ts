import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/database/prisma.service';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(identifier: string, password: string): Promise<any> {
    const trimmedIdentifier = identifier?.trim();
    if (!trimmedIdentifier) {
      throw new HttpException('Phone number or email is required', HttpStatus.BAD_REQUEST);
    }

    let lookupField:
      | { email: { equals: string; mode: 'insensitive' }; phone?: undefined }
      | { email?: undefined; phone: string };

    if (trimmedIdentifier.includes('@')) {
      const emailCandidate = trimmedIdentifier.toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailCandidate)) {
        throw new HttpException('Valid email address is required', HttpStatus.BAD_REQUEST);
      }
      lookupField = { email: { equals: emailCandidate, mode: 'insensitive' } };
    } else {
      // Normalize phone number: remove all non-digit characters except leading +
      let normalizedPhone = trimmedIdentifier.replace(/[^\d+]/g, '');
      // Remove leading + if present for database lookup (we store without +)
      if (normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.substring(1);
      }
      // Validate: must have at least 7 digits (minimum international format) and max 15 digits (E.164 max)
      if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
        throw new HttpException('Phone number must be between 7 and 15 digits', HttpStatus.BAD_REQUEST);
      }
      // Ensure it starts with a valid country code (1-9)
      if (!/^[1-9]/.test(normalizedPhone)) {
        throw new HttpException('Phone number must start with a valid country code', HttpStatus.BAD_REQUEST);
      }
      lookupField = { phone: normalizedPhone };
    }

    const user = await this.prisma.user.findFirst({ where: lookupField });

    if (!user) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    if (user.status !== UserStatus.ACTIVE || user.isActive === false) {
      const statusMessage = user.status === UserStatus.SUSPENDED
        ? 'Account suspended'
        : 'Account disabled';
      throw new HttpException(statusMessage, HttpStatus.FORBIDDEN);
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw new HttpException('Invalid password', HttpStatus.UNAUTHORIZED);
    }

    const { password: _password, ...result } = user as any;
    return result;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }
}
