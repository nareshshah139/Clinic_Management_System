import { InventoryReplenishmentService } from './inventory-replenishment.service';
import { InventoryLabelService } from './inventory-label.service';
import { Res } from '@nestjs/common';
import { InventoryIntakeService } from './inventory-intake.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { InventoryWorkflowScheduler } from './inventory-workflow-scheduler.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';
import {
  SaveWorkflowDocumentDto,
  TransitionWorkflowDto,
} from './inventory-workflow.types';

@Controller('inventory/workspace')
@UseGuards(JwtAuthGuard)
export class InventoryWorkflowController {
  constructor(
    private readonly replenishment: InventoryReplenishmentService,
    private readonly workflow: InventoryWorkflowService,
    private readonly workspace: InventoryWorkspaceService,
    private readonly scheduler: InventoryWorkflowScheduler,
    private readonly intakeService: InventoryIntakeService,
    private readonly labels: InventoryLabelService,
  ) {}
  @Get('replenishment/manual-targets') manualTargets(
    @Request() r: any,
    @Query() q: any,
  ) {
    return this.replenishment.manualTargets(r.user, q);
  }
  @Post('replenishment/manual-targets') saveManualTargets(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.saveManualTargets(r.user, b);
  }
  @Get('replenishment/status') replenishmentStatus(@Request() r: any) {
    return this.replenishment.automationStatus(r.user);
  }
  @Get('replenishment/monitor') monitor(@Request() r: any, @Query() q: any) {
    return this.replenishment.monitor(r.user, q);
  }
  @Get('replenishment/suppliers/:id') suggestions(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.replenishment.supplierSuggestions(r.user, id);
  }
  @Post('replenishment/shortbook/:id/supplier') chooseSupplier(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.saveSupplierChoice(r.user, id, b);
  }
  @Post('replenishment/targets/:id/review') reviewTargets(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.reviewTargets(r.user, id, b);
  }
  @Get('replenishment/orders/:id/receipt') receiptContext(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.replenishment.receiptContext(r.user, id);
  }
  @Post('replenishment/orders/:id/dispatch') dispatchOrder(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.dispatchOrder(r.user, id, b);
  }
  @Post('replenishment/orders/:id/cancel-remaining') cancelRemaining(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.cancelRemaining(r.user, id, b);
  }
  @Post('automation/run') run(@Request() r: any) {
    return this.scheduler.run(r.user);
  }
  @Post('intake/csv')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  csv(@Request() r: any, @UploadedFile() file: Express.Multer.File) {
    return this.intakeService.csv(r.user, file);
  }
  @Get('gmail/status') gmailStatus(@Request() r: any) {
    return this.intakeService.mailboxStatus(r.user);
  }
  @Post('gmail/connect') gmailConnect(@Request() r: any) {
    return this.intakeService.connect(r.user);
  }
  @Post('gmail/exchange') gmailExchange(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.intakeService.exchange(r.user, b.code, b.state);
  }
  @Post('gmail/disconnect') gmailDisconnect(@Request() r: any) {
    return this.intakeService.disconnect(r.user);
  }
  @Get('gmail/messages') gmailMessages(@Request() r: any, @Query() q: any) {
    return this.intakeService.messages(r.user, q.search, q.pageToken);
  }
  @Post('gmail/import') gmailImport(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.intakeService.importAttachment(r.user, b);
  }
  @Get('labels/:id') async label(
    @Request() r: any,
    @Param('id') id: string,
    @Query('document') document: string,
    @Res() response: any,
  ) {
    const pdf = await this.labels.label(r.user, id, document === 'true');
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      'inline; filename=inventory-label.pdf',
    );
    response.send(pdf);
  }
  @Get('capabilities') capabilities(@Request() r: any) {
    return this.workflow.capabilities(r.user);
  }
  @Get('overview') overview(@Request() r: any) {
    return this.workspace.overview(r.user);
  }
  @Post('stock/bulk-location') bulkLocations(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.workspace.bulkLocations(r.user, b);
  }
  @Get('stock') stock(@Request() r: any, @Query() q: any) {
    return this.workspace.stock(r.user, q);
  }
  @Get('stock/:id') item(@Request() r: any, @Param('id') id: string) {
    return this.workspace.item(r.user, id);
  }
  @Patch('stock/:id') saveItem(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: Record<string, any>,
  ) {
    return this.workspace.saveItem(r.user, id, b);
  }
  @Get('suppliers') suppliers(@Request() r: any) {
    return this.workspace.suppliers(r.user);
  }
  @Get('owners') owners(@Request() r: any) {
    return this.workspace.owners(r.user);
  }
  @Get('settings') settings(@Request() r: any) {
    return this.workflow.settings(r.user);
  }
  @Patch('settings') saveSettings(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.workflow.saveSettings(r.user, b);
  }
  @Get('documents') documents(@Request() r: any, @Query() q: any) {
    return this.workflow.documents(r.user, q);
  }
  @Get('documents/:id') document(@Request() r: any, @Param('id') id: string) {
    return this.workflow.document(r.user, id);
  }
  @Post('documents') create(
    @Request() r: any,
    @Body() b: SaveWorkflowDocumentDto,
  ) {
    return this.workflow.saveDocument(r.user, b);
  }
  @Patch('documents/:id') save(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: SaveWorkflowDocumentDto,
  ) {
    return this.workflow.saveDocument(r.user, b, id);
  }
  @Post('documents/:id/transition') transition(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: TransitionWorkflowDto,
  ) {
    return this.workflow.transition(r.user, id, b);
  }
  @Get('intake') intakeList(@Request() r: any) {
    return this.workspace.intake(r.user);
  }
  @Post('intake') intake(@Request() r: any, @Body() b: Record<string, any>) {
    return this.workspace.intake(r.user, b);
  }
  @Get('credits') credits(@Request() r: any) {
    return this.workspace.credits(r.user);
  }
  @Post('credits/allocate') allocate(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.workspace.allocateCredit(r.user, b);
  }
  @Post('credits/allocations/:id/reverse') reverseCredit(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: Record<string, any>,
  ) {
    return this.workspace.reverseAllocation(r.user, id, b.reason);
  }
  @Post('counts') count(@Request() r: any, @Body() b: Record<string, any>) {
    return this.workspace.createCount(r.user, b);
  }
  @Post('targets/propose') targets(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.proposeTargets(r.user, b);
  }
  @Post('shortbook/refresh') replenish(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.replenishment.refreshShortbook(r.user, b);
  }
  @Get('hold-sources') holdSources(@Request() r: any, @Query() q: any) {
    return this.workspace.holdSources(r.user, q);
  }
  @Get('sale-movements') sales(@Request() r: any, @Query() q: any) {
    return this.workspace.salesMovements(r.user, q);
  }
  @Post('movement-corrections') correct(
    @Request() r: any,
    @Body() b: Record<string, any>,
  ) {
    return this.workspace.correctMovement(r.user, b);
  }
}
