import { PrismaClient, InventoryItemType, UnitType, InventoryStatus, StockStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

interface LinaeDrugData {
  'Drug name': string;
  'Manufacturer': string;
  'Primary compositions': string;
  'Category': string;
  'Dosage form': string;
  'Pack size': string;
  'Approx. Price (INR)': number;
}

function parseStrength(compositions: string): string | null {
  // Try to extract strength/percentage from compositions
  const strengthMatch = compositions.match(/(\d+\.?\d*\s*(?:mg|g|%|ml|mcg|IU))/i);
  return strengthMatch ? strengthMatch[1] : null;
}

function parsePrimaryComposition(compositions: string): string {
  // Extract the main active ingredient
  // Remove extra info in parentheses and take first part
  const cleaned = compositions.replace(/\(.*?\)/g, '').trim();
  const parts = cleaned.split(/[;,+]/);
  return parts[0].trim();
}

function parsePackSize(packSizeStr: string): { size: number; unit: string } {
  // Parse pack size like "50 g", "Strip of 10", "30 ml"
  const match = packSizeStr.match(/(\d+\.?\d*)\s*([a-z]+)/i);
  if (match) {
    return { size: parseFloat(match[1]), unit: match[2] };
  }
  // Try "Strip of X" format
  const stripMatch = packSizeStr.match(/Strip of (\d+)/i);
  if (stripMatch) {
    return { size: parseInt(stripMatch[1]), unit: 'pieces' };
  }
  return { size: 1, unit: 'pieces' };
}

function mapUnitType(unit: string): UnitType {
  const unitLower = unit.toLowerCase();
  switch (unitLower) {
    case 'ml':
    case 'l':
      return UnitType.BOTTLES;
    case 'g':
    case 'kg':
      return UnitType.TUBES;
    case 'pieces':
    case 'strip':
    case 'tablet':
    case 'capsule':
      return UnitType.STRIPS;
    case 'box':
      return UnitType.BOXES;
    default:
      return UnitType.PIECES;
  }
}

async function main() {
  console.log('🏥 Starting Linae pharmacy data import...');

  // Get the first branch
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    throw new Error('No branch found. Please run the main seed script first.');
  }

  console.log(`📍 Using branch: ${branch.name} (${branch.id})`);

  // Read Excel file
  const excelPath = path.join(__dirname, '../../linae_pharmacy_prices_india.xlsx');
  console.log(`📄 Reading Excel file: ${excelPath}`);
  
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data: LinaeDrugData[] = XLSX.utils.sheet_to_json(sheet);

  console.log(`📊 Found ${data.length} drugs to import`);

  let drugsCreated = 0;
  let drugsUpdated = 0;
  let inventoryItemsCreated = 0;
  let errors = 0;

  for (const row of data) {
    try {
      const drugName = row['Drug name'].trim();
      const manufacturer = row['Manufacturer'].trim();
      const compositions = row['Primary compositions'].trim();
      const category = row['Category'].trim();
      const dosageForm = row['Dosage form'].trim();
      const packSizeLabel = row['Pack size'].trim();
      const price = row['Approx. Price (INR)'];

      console.log(`\n💊 Processing: ${drugName}`);

      const strength = parseStrength(compositions);
      const primaryComposition = parsePrimaryComposition(compositions);
      const { size: packSize, unit: packUnit } = parsePackSize(packSizeLabel);

      // Check if drug already exists
      const existingDrug = await prisma.drug.findFirst({
        where: {
          name: drugName,
          branchId: branch.id
        }
      });

      let drug;
      if (existingDrug) {
        // Update existing drug
        drug = await prisma.drug.update({
          where: { id: existingDrug.id },
          data: {
            price: price,
            manufacturerName: manufacturer,
            packSizeLabel: packSizeLabel,
            category: category,
            dosageForm: dosageForm,
            strength: strength,
            description: compositions,
            composition1: primaryComposition,
            isActive: true,
            isDiscontinued: false,
          },
        });
        drugsUpdated++;
        console.log(`   ✏️  Updated existing drug`);
      } else {
        // Create new drug
        drug = await prisma.drug.create({
          data: {
            name: drugName,
            price: price,
            manufacturerName: manufacturer,
            type: 'allopathy',
            packSizeLabel: packSizeLabel,
            category: category,
            dosageForm: dosageForm,
            strength: strength,
            description: compositions,
            composition1: primaryComposition,
            branchId: branch.id,
            minStockLevel: 10,
            maxStockLevel: 200,
            expiryMonths: 24,
            isActive: true,
            isDiscontinued: false,
          },
        });
        drugsCreated++;
        console.log(`   ✅ Created new drug`);
      }

      console.log(`   ID: ${drug.id}`);
      console.log(`   Category: ${category}`);
      console.log(`   Form: ${dosageForm}`);
      console.log(`   Price: ₹${price}`);

      // Check if inventory item exists
      const existingInventory = await prisma.inventoryItem.findFirst({
        where: {
          name: drugName,
          branchId: branch.id
        }
      });

      if (!existingInventory) {
        // Create inventory item with initial stock of 50 units
        const unitType = mapUnitType(packUnit);
        const inventoryItem = await prisma.inventoryItem.create({
          data: {
            name: drugName,
            description: compositions,
            type: InventoryItemType.MEDICINE,
            category: category,
            subCategory: category,
            manufacturer: manufacturer,
            supplier: manufacturer,
            brandName: drugName,
            genericName: primaryComposition,
            packSize: packSize,
            unit: unitType,
            costPrice: price * 0.75, // Assume 25% markup
            sellingPrice: price,
            mrp: price * 1.1, // 10% above selling price
            currentStock: 50,
            minStockLevel: 10,
            maxStockLevel: 200,
            reorderLevel: 20,
            stockStatus: StockStatus.IN_STOCK,
            status: InventoryStatus.ACTIVE,
            storageLocation: 'Pharmacy-Main',
            requiresPrescription: category.toLowerCase().includes('anti') || 
                                 category.toLowerCase().includes('retinoid') ||
                                 dosageForm.toLowerCase().includes('tablet') ||
                                 dosageForm.toLowerCase().includes('capsule'),
            isControlled: drugName.toLowerCase().includes('isotretinoin') || 
                          drugName.toLowerCase().includes('steroid'),
            expiryDate: new Date(Date.now() + 24 * 30 * 24 * 60 * 60 * 1000), // 24 months from now
            batchNumber: `LINAE${Date.now().toString().slice(-6)}`,
            sku: `LINAE-${drug.id.slice(-6).toUpperCase()}`,
            barcode: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
            tags: JSON.stringify(['linae', category.split('/')[0].trim().toLowerCase()]),
            branchId: branch.id,
          },
        });

        inventoryItemsCreated++;
        console.log(`   📦 Created inventory item - Stock: ${inventoryItem.currentStock}`);
      } else {
        console.log(`   ⏩ Inventory item already exists`);
      }

    } catch (error: any) {
      errors++;
      console.error(`   ❌ Error processing ${row['Drug name']}:`, error.message);
    }
  }

  console.log('\n✅ Linae pharmacy data import completed!');
  console.log(`\n📊 Summary:`);
  console.log(`   • Total rows processed: ${data.length}`);
  console.log(`   • Drugs created: ${drugsCreated}`);
  console.log(`   • Drugs updated: ${drugsUpdated}`);
  console.log(`   • Inventory items created: ${inventoryItemsCreated}`);
  console.log(`   • Errors: ${errors}`);
  console.log(`   • Total stock units added: ${inventoryItemsCreated * 50}`);
}

main()
  .catch((e) => {
    console.error('❌ Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

