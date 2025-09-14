import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OneMgController } from './one-mg.controller';
import { OneMgService } from './one-mg.service';
import { PrismaModule } from '../../../shared/database/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [OneMgController],
  providers: [OneMgService],
  exports: [OneMgService],
})
export class OneMgModule {} 