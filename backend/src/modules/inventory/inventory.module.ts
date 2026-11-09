import { InventoryIdentityRecoveryService } from './inventory-identity-recovery.service';
import { InventoryStocktakeController } from './inventory-stocktake.controller';
import { InventoryPurchaseActionsService } from './inventory-purchase-actions.service';
import { InventoryPurchaseActionsController } from './inventory-purchase-actions.controller';
import { InventoryReplenishmentService } from './inventory-replenishment.service';
import { InventoryLabelService } from './inventory-label.service';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { InventoryIntakeService } from './inventory-intake.service';
import { InventoryWorkflowScheduler } from './inventory-workflow-scheduler.service';
import { InventoryWorkflowController } from './inventory-workflow.controller';
import { InventoryWorkflowService } from './inventory-workflow.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';
import { InventoryReconciliationService } from './reconciliation/inventory-reconciliation.service';
import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryImportService } from './inventory-import.service';
import { InventoryItemRequestService } from './inventory-item-request.service';
import { InventoryItemRequestController } from './inventory-item-request.controller';
import { PrismaModule } from '../../shared/database/prisma.module';

@Module({
  imports: [PrismaModule, PharmacyModule],
  controllers: [InventoryItemRequestController, InventoryStocktakeController, InventoryPurchaseActionsController, InventoryController, InventoryWorkflowController],
  providers: [InventoryItemRequestService, InventoryIdentityRecoveryService, InventoryPurchaseActionsService, InventoryReplenishmentService, InventoryService, InventoryImportService, InventoryWorkflowService, InventoryWorkspaceService, InventoryWorkflowScheduler, InventoryIntakeService, InventoryLabelService, InventoryReconciliationService],
  exports: [InventoryService, InventoryItemRequestService],
})
export class InventoryModule {}
