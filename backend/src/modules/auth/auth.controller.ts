import { Body, Controller, HttpException, HttpStatus, Post, Res, SetMetadata, Get, Request } from '@nestjs/common';
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
      const execAsync = promisify(exec);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupDir = path.join(process.cwd(), '..', 'backups', timestamp);
      
      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });
      
      // Database backup using docker exec
      const backupCommand = `docker exec cms-postgres pg_dump -U cms -d cms > ${backupDir}/cms_full_backup.sql`;
      await execAsync(backupCommand);
      
      // Copy schema and migrations
      const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
      const migrationsPath = path.join(process.cwd(), 'prisma', 'migrations');
      const seedPath = path.join(process.cwd(), 'scripts', 'fresh-seed.ts');
      
      await Promise.all([
        fs.copyFile(schemaPath, path.join(backupDir, 'schema.prisma')),
        fs.cp(migrationsPath, path.join(backupDir, 'migrations'), { recursive: true }).catch(() => {}),
        fs.copyFile(seedPath, path.join(backupDir, 'fresh-seed.ts')).catch(() => {}),
      ]);
      
      // Create README
      const readmeContent = `# Database Backup - ${new Date().toLocaleString()}

## Backup Information
- **Created**: ${new Date().toLocaleString()}
- **Created by**: ${user.id} (${user.role})
- **Branch**: ${user.branchId}

## Files
- cms_full_backup.sql - Complete database backup
- schema.prisma - Prisma schema
- migrations/ - Database migrations
- fresh-seed.ts - Seed script

## Restore Command
\`\`\`bash
docker exec -i cms-postgres psql -U cms -d cms < cms_full_backup.sql
\`\`\`

⚠️ **Security**: This backup contains sensitive data. Store securely.
`;
      
      await fs.writeFile(path.join(backupDir, 'README.md'), readmeContent);
      
      // Get backup file sizes
      const stats = await fs.stat(path.join(backupDir, 'cms_full_backup.sql'));
      
      return {
        success: true,
        message: 'Database backup created successfully',
        backup: {
          timestamp,
          directory: `backups/${timestamp}`,
          size: stats.size,
          createdBy: user.id,
          createdAt: new Date(),
        },
      };
      
    } catch (error) {
      console.error('Backup creation failed:', error);
      throw new HttpException(
        `Backup creation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
