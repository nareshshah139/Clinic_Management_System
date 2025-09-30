import { PrismaClient, InventoryItemType, UnitType, InventoryStatus, StockStatus } from '@prisma/client';

const prisma = new PrismaClient();

// List of 30 common dermatology drugs with their details
const DERM_DRUGS = [
  // Topical Retinoids & Acne Treatments
  { name: 'Adapalene Gel 0.1%', manufacturerName: 'Galderma', price: 450.00, category: 'Dermatology', dosageForm: 'Gel', strength: '0.1%', description: 'Topical retinoid for acne treatment' },
  { name: 'Tretinoin Cream 0.025%', manufacturerName: 'Johnson & Johnson', price: 320.00, category: 'Dermatology', dosageForm: 'Cream', strength: '0.025%', description: 'Topical retinoid for acne and photoaging' },
  { name: 'Tretinoin Cream 0.05%', manufacturerName: 'Johnson & Johnson', price: 380.00, category: 'Dermatology', dosageForm: 'Cream', strength: '0.05%', description: 'Stronger topical retinoid for acne' },
  { name: 'Clindamycin Gel 1%', manufacturerName: 'Cipla', price: 180.00, category: 'Dermatology', dosageForm: 'Gel', strength: '1%', description: 'Topical antibiotic for acne' },
  { name: 'Benzoyl Peroxide Gel 2.5%', manufacturerName: 'Galderma', price: 220.00, category: 'Dermatology', dosageForm: 'Gel', strength: '2.5%', description: 'Antibacterial agent for acne' },
  { name: 'Benzoyl Peroxide Gel 5%', manufacturerName: 'Galderma', price: 280.00, category: 'Dermatology', dosageForm: 'Gel', strength: '5%', description: 'Stronger antibacterial for acne' },
  { name: 'Azelaic Acid Gel 10%', manufacturerName: 'Bayer', price: 350.00, category: 'Dermatology', dosageForm: 'Gel', strength: '10%', description: 'Anti-inflammatory for acne and rosacea' },
  { name: 'Azelaic Acid Cream 20%', manufacturerName: 'Bayer', price: 480.00, category: 'Dermatology', dosageForm: 'Cream', strength: '20%', description: 'Stronger azelaic acid formulation' },

  // Oral Medications
  { name: 'Doxycycline Capsules 100mg', manufacturerName: 'Sun Pharma', price: 120.00, category: 'Dermatology', dosageForm: 'Capsule', strength: '100mg', description: 'Oral antibiotic for acne' },
  { name: 'Minocycline Tablets 50mg', manufacturerName: 'Ranbaxy', price: 180.00, category: 'Dermatology', dosageForm: 'Tablet', strength: '50mg', description: 'Oral antibiotic for acne' },
  { name: 'Isotretinoin Capsules 10mg', manufacturerName: 'Cipla', price: 650.00, category: 'Dermatology', dosageForm: 'Capsule', strength: '10mg', description: 'Oral retinoid for severe acne' },
  { name: 'Isotretinoin Capsules 20mg', manufacturerName: 'Cipla', price: 1200.00, category: 'Dermatology', dosageForm: 'Capsule', strength: '20mg', description: 'Higher dose oral retinoid' },

  // Antifungals
  { name: 'Ketoconazole Shampoo 2%', manufacturerName: 'Johnson & Johnson', price: 280.00, category: 'Dermatology', dosageForm: 'Shampoo', strength: '2%', description: 'Antifungal shampoo for dandruff' },
  { name: 'Clotrimazole Cream 1%', manufacturerName: 'Bayer', price: 95.00, category: 'Dermatology', dosageForm: 'Cream', strength: '1%', description: 'Topical antifungal' },
  { name: 'Terbinafine Cream 1%', manufacturerName: 'Novartis', price: 180.00, category: 'Dermatology', dosageForm: 'Cream', strength: '1%', description: 'Antifungal for skin infections' },
  { name: 'Itraconazole Capsules 100mg', manufacturerName: 'Janssen', price: 450.00, category: 'Dermatology', dosageForm: 'Capsule', strength: '100mg', description: 'Oral antifungal' },
  { name: 'Itraconazole Capsules 200mg', manufacturerName: 'Janssen', price: 850.00, category: 'Dermatology', dosageForm: 'Capsule', strength: '200mg', description: 'Higher dose oral antifungal' },

  // Topical Steroids
  { name: 'Mometasone Furoate Cream 0.1%', manufacturerName: 'Merck', price: 320.00, category: 'Dermatology', dosageForm: 'Cream', strength: '0.1%', description: 'Potent topical corticosteroid' },
  { name: 'Betamethasone Valerate Cream 0.1%', manufacturerName: 'GSK', price: 150.00, category: 'Dermatology', dosageForm: 'Cream', strength: '0.1%', description: 'Topical corticosteroid for inflammation' },
  { name: 'Hydrocortisone Cream 1%', manufacturerName: 'HHC', price: 45.00, category: 'Dermatology', dosageForm: 'Cream', strength: '1%', description: 'Low-potency topical steroid' },
  { name: 'Tacrolimus Ointment 0.03%', manufacturerName: 'Astellas', price: 850.00, category: 'Dermatology', dosageForm: 'Ointment', strength: '0.03%', description: 'Calcineurin inhibitor for eczema' },
  { name: 'Tacrolimus Ointment 0.1%', manufacturerName: 'Astellas', price: 1200.00, category: 'Dermatology', dosageForm: 'Ointment', strength: '0.1%', description: 'Stronger calcineurin inhibitor' },
  { name: 'Pimecrolimus Cream 1%', manufacturerName: 'Novartis', price: 950.00, category: 'Dermatology', dosageForm: 'Cream', strength: '1%', description: 'Calcineurin inhibitor for eczema' },

  // Topical Antibiotics
  { name: 'Mupirocin Ointment 2%', manufacturerName: 'GSK', price: 180.00, category: 'Dermatology', dosageForm: 'Ointment', strength: '2%', description: 'Topical antibiotic for bacterial infections' },
  { name: 'Fusidic Acid Cream 2%', manufacturerName: 'Leo Pharma', price: 220.00, category: 'Dermatology', dosageForm: 'Cream', strength: '2%', description: 'Topical antibiotic' },

  // Hair & Scalp Treatments
  { name: 'Minoxidil Solution 2%', manufacturerName: 'Johnson & Johnson', price: 380.00, category: 'Dermatology', dosageForm: 'Solution', strength: '2%', description: 'Hair regrowth solution for women' },
  { name: 'Minoxidil Solution 5%', manufacturerName: 'Johnson & Johnson', price: 480.00, category: 'Dermatology', dosageForm: 'Solution', strength: '5%', description: 'Hair regrowth solution for men' },
  { name: 'Finasteride Tablets 1mg', manufacturerName: 'Merck', price: 650.00, category: 'Dermatology', dosageForm: 'Tablet', strength: '1mg', description: 'Oral treatment for male pattern baldness' },

  // Keratolytics & Pigmentation
  { name: 'Hydroquinone Cream 4%', manufacturerName: 'Valeant', price: 420.00, category: 'Dermatology', dosageForm: 'Cream', strength: '4%', description: 'Skin lightening agent' },
  { name: 'Salicylic Acid Solution 2%', manufacturerName: 'Cipla', price: 150.00, category: 'Dermatology', dosageForm: 'Solution', strength: '2%', description: 'Keratolytic for acne and warts' },
  { name: 'Urea Cream 10%', manufacturerName: 'Stiefel', price: 180.00, category: 'Dermatology', dosageForm: 'Cream', strength: '10%', description: 'Moisturizing and keratolytic agent' }
];

async function main() {
  console.log('🏥 Starting dermatology inventory population...');

  // Get the first branch
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    throw new Error('No branch found. Please run the main seed script first.');
  }

  console.log(`📍 Using branch: ${branch.name} (${branch.id})`);

  let drugsCreated = 0;
  let inventoryItemsCreated = 0;

  for (const drugData of DERM_DRUGS) {
    try {
      // Create or get the drug
      const existingDrug = await prisma.drug.findFirst({
        where: {
          name: drugData.name,
          branchId: branch.id
        }
      });

      const drug = existingDrug || await prisma.drug.create({
        data: {
          name: drugData.name,
          price: drugData.price,
          manufacturerName: drugData.manufacturerName,
          type: 'allopathy',
          packSizeLabel: '1 unit',
          category: drugData.category,
          dosageForm: drugData.dosageForm,
          strength: drugData.strength,
          description: drugData.description,
          branchId: branch.id,
          composition1: drugData.strength ? `${drugData.name.split(' ')[0]} ${drugData.strength}` : drugData.name.split(' ')[0],
          minStockLevel: 10,
          maxStockLevel: 200,
          expiryMonths: 24,
          isActive: true,
          isDiscontinued: false,
        },
      });

      drugsCreated++;
      console.log(`💊 Drug: ${drug.name} (${drug.id})`);

      // Create inventory item with 50 units
      const inventoryItem = await prisma.inventoryItem.create({
        data: {
          name: drugData.name,
          description: drugData.description,
          type: InventoryItemType.MEDICINE,
          category: drugData.category,
          subCategory: 'Dermatology',
          manufacturer: drugData.manufacturerName,
          supplier: drugData.manufacturerName,
          brandName: drugData.name,
          genericName: drugData.name.split(' ')[0],
          packSize: 1,
          unit: UnitType.PIECES,
          costPrice: drugData.price * 0.7, // Assume 30% markup
          sellingPrice: drugData.price,
          mrp: drugData.price * 1.1, // 10% above selling price
          currentStock: 50,
          minStockLevel: 10,
          maxStockLevel: 200,
          reorderLevel: 20,
          stockStatus: StockStatus.IN_STOCK,
          status: InventoryStatus.ACTIVE,
          storageLocation: 'Pharmacy-Dermatology',
          requiresPrescription: true,
          isControlled: drugData.name.includes('Isotretinoin') || drugData.name.includes('Finasteride'),
          expiryDate: new Date(Date.now() + 24 * 30 * 24 * 60 * 60 * 1000), // 24 months from now
          batchNumber: `DERM${Date.now().toString().slice(-6)}`,
          sku: `DERM-${drug.id.slice(-6).toUpperCase()}`,
          barcode: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
          tags: JSON.stringify(['dermatology', 'skin', 'topical']),
          branchId: branch.id,
          // drugId: drug.id, // Remove this as it's not in the schema
        },
      });

      inventoryItemsCreated++;
      console.log(`📦 Inventory: ${inventoryItem.name} - Stock: ${inventoryItem.currentStock}`);

    } catch (error) {
      console.error(`❌ Error processing ${drugData.name}:`, error.message);
    }
  }

  console.log('\n✅ Dermatology inventory population completed!');
  console.log(`📊 Summary:`);
  console.log(`   • Drugs processed: ${drugsCreated}/${DERM_DRUGS.length}`);
  console.log(`   • Inventory items created: ${inventoryItemsCreated}/${DERM_DRUGS.length}`);
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