import { Body, Controller, HttpException, HttpStatus, Post, Res, SetMetadata, Get, Request, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

export const Public = () => SetMetadata('isPublic', true);

interface AuthenticatedRequest {
  user: {
    id: string;
    branchId: string;
    role: string;
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60, limit: 5 } })
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const { identifier, phone, email, password } = body || {};
    const loginIdentifier = (identifier ?? phone ?? email)?.trim();

    if (!loginIdentifier || !password) {
      throw new HttpException('Login identifier and password are required', HttpStatus.BAD_REQUEST);
    }

    const user = await this.authService.validateUser(loginIdentifier, password);
    const { access_token } = await this.authService.login(user);
    res.cookie('auth_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { access_token, user };
  }

  @Public()
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.cookie('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(0),
    });
    return { success: true };
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

  // Return current authenticated user
  @Get('me')
  async me(@Request() req: any) {
    // Passport attaches whatever JwtStrategy.validate returns to req.user
    const u = req.user || {};
    return {
      id: u.userId || u.id,
      role: u.role,
      branchId: u.branchId,
    };
  }

  // Database backup endpoint (admin only)
  @ApiBearerAuth()
  @Post('backup')
  async createBackup(@Request() req: AuthenticatedRequest) {
    const user = req.user;
    
    // Check if user is admin/owner
    if (!user.role || !['ADMIN', 'OWNER'].includes(user.role)) {
      throw new HttpException('Insufficient permissions. Admin access required.', HttpStatus.FORBIDDEN);
    }

    try {
      // Enqueue a background backup job and return a job id immediately
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const jobId = `backup-${timestamp}-${user.id}`;
      const jobsDir = path.join(process.cwd(), '..', 'backups', '.jobs');
      const jobFile = path.join(jobsDir, `${jobId}.json`);
      await fs.mkdir(jobsDir, { recursive: true });
      await fs.writeFile(jobFile, JSON.stringify({ id: jobId, status: 'QUEUED', createdAt: new Date().toISOString(), createdBy: user.id, branchId: user.branchId }));

      // Kick off child process detached to perform backup safely using a JSON-escaped inline script
      const jobsDirOnDisk = path.join(process.cwd(), '..', 'backups', '.jobs');
      const nodeInlineCode = [
        "const { exec } = require('child_process');",
        "const fs = require('fs');",
        "const path = require('path');",
        `const jobsDir = ${JSON.stringify(jobsDirOnDisk)};`,
        `const jobId = ${JSON.stringify(jobId)};`,
        "const jobFile = path.join(jobsDir, jobId + '.json');",
        "const backupsRoot = path.join(process.cwd(), '..', 'backups');",
        "const backupDir = path.join(backupsRoot, jobId.replace(/^backup-/, ''));",
        "const update = (obj) => fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, ...obj }));",
        "(async () => {",
        "  try {",
        "    update({ status: 'RUNNING', startedAt: new Date().toISOString() });",
        "    fs.mkdirSync(backupDir, { recursive: true });",
        "    const dumpFile = path.join(backupDir, 'cms_full_backup.sql');",
        "    const cmd = 'docker exec cms-postgres pg_dump -U cms -d cms';",
        "    const child = exec(cmd, { maxBuffer: 1024*1024*1024 }, (err) => {",
        "      if (err) {",
        "        update({ status: 'FAILED', error: String((err && err.message) || err), finishedAt: new Date().toISOString() });",
        "        return;",
        "      }",
        "    });",
        "    const write = fs.createWriteStream(dumpFile);",
        "    child.stdout && child.stdout.pipe(write);",
        "    child.stderr && child.stderr.on && child.stderr.on('data', () => {});",
        "    await new Promise((res, rej) => {",
        "      child.on('exit', (code) => code === 0 ? res(null) : rej(new Error('pg_dump exit ' + code)));",
        "    });",
        "    try { fs.copyFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), path.join(backupDir, 'schema.prisma')); } catch (e) {}",
        "    try { fs.cpSync(path.join(process.cwd(), 'prisma', 'migrations'), path.join(backupDir, 'migrations'), { recursive: true }); } catch (e) {}",
        "    try { fs.copyFileSync(path.join(process.cwd(), 'scripts', 'fresh-seed.ts'), path.join(backupDir, 'fresh-seed.ts')); } catch (e) {}",
        "    const size = fs.statSync(dumpFile).size;",
        "    update({ status: 'COMPLETED', finishedAt: new Date().toISOString(), directory: 'backups/' + jobId.replace(/^backup-/, ''), size });",
        "  } catch (e) {",
        "    update({ status: 'FAILED', error: String((e && e.message) || e), finishedAt: new Date().toISOString() });",
        "  }",
        "})();",
      ].join('\n');
      const cmd = `${process.execPath} -e ${JSON.stringify(nodeInlineCode)}`;
      promisify(exec)(cmd).catch(() => void 0);

      return { success: true, jobId };
    } catch (error) {
      throw new HttpException('Failed to enqueue backup job', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // Check backup job status
  @ApiBearerAuth()
  @Get('backup/:jobId')
  async getBackupStatus(@Param('jobId') jobId: string, @Request() req: AuthenticatedRequest) {
    const role = req.user?.role;
    if (!role || !['ADMIN', 'OWNER'].includes(role)) {
      throw new HttpException('Insufficient permissions. Admin access required.', HttpStatus.FORBIDDEN);
    }
    const jobsDir = path.join(process.cwd(), '..', 'backups', '.jobs');
    try {
      const raw = await fs.readFile(path.join(jobsDir, `${jobId}.json`), 'utf8');
      return JSON.parse(raw);
    } catch {
      throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
    }
  }
}
