import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { PharmacyPrescriptionQueueService } from './pharmacy-prescription-queue.service';
import { QueryPrescriptionQueueDto } from './dto/pharmacy-prescription-queue.dto';
import {
  UpdateDispenseTaskLineDto,
  UpdateDispenseTaskStatusDto,
} from './dto/pharmacy-dispense-task.dto';

@ApiTags('Pharmacy Dispense Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pharmacy/dispense-tasks')
export class PharmacyDispenseTaskController {
  constructor(
    private readonly queueService: PharmacyPrescriptionQueueService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List persisted pharmacy dispense tasks' })
  @ApiResponse({ status: 200, description: 'Dispense tasks retrieved' })
  async findAll(
    @Query() query: QueryPrescriptionQueueDto,
    @Request() req: any,
  ) {
    return this.queueService.findAll(query, req.user.branchId);
  }

  @Patch(':taskId/status')
  @ApiOperation({ summary: 'Update dispense task status' })
  @ApiResponse({ status: 200, description: 'Dispense task status updated' })
  async updateStatus(
    @Param('taskId') taskId: string,
    @Body() body: UpdateDispenseTaskStatusDto,
    @Request() req: any,
  ) {
    return this.queueService.updateTaskStatus(
      taskId,
      body,
      req.user.branchId,
      req.user.id,
    );
  }

  @Patch(':taskId/lines/:lineId')
  @ApiOperation({ summary: 'Persist pharmacist review for one dispense line' })
  @ApiResponse({ status: 200, description: 'Dispense task line updated' })
  async updateLine(
    @Param('taskId') taskId: string,
    @Param('lineId') lineId: string,
    @Body() body: UpdateDispenseTaskLineDto,
    @Request() req: any,
  ) {
    return this.queueService.updateTaskLine(
      taskId,
      lineId,
      body,
      req.user.branchId,
      req.user.id,
    );
  }
}
