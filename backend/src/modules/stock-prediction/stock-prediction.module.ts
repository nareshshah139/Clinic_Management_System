import { Module } from '@nestjs/common';
import { StockPredictionController } from './stock-prediction.controller';
import { StockPredictionService } from './stock-prediction.service';
import { PrismaModule } from '../../shared/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StockPredictionController],
  providers: [StockPredictionService],
  exports: [StockPredictionService],
})
export class StockPredictionModule {}

