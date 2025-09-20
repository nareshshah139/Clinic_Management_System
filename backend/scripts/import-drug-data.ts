import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';

const prisma = new PrismaClient();

interface DrugCsvRow {
  id: string;
  name: string;
  'price(₹)': string;
  Is_discontinued: string;
  manufacturer_name: string;
  type: string;
  pack_size_label: string;
  short_composition1?: string;
  short_composition2?: string;
}

async function importDrugData() {
  try {
    console.log('🚀 Starting drug data import...');
    
    // Get default branch (assuming first branch exists)
    const defaultBranch = await prisma.branch.findFirst();
    if (!defaultBranch) {
      throw new Error('No branch found. Please create a branch first.');
    }
    
    console.log(`📍 Using branch: ${defaultBranch.name} (${defaultBranch.id})`);
    
    const csvFilePath = path.join(__dirname, '../src/data/indian_medicine_data.csv');
    const drugs: any[] = [];
    let processedCount = 0;
    let errorCount = 0;
    
    return new Promise<void>((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row: DrugCsvRow) => {
          try {
            // Parse price, handling potential formatting issues
            let price = 0;
            if (row['price(₹)']) {
              price = parseFloat(row['price(₹)'].toString().replace(/[^\d.]/g, ''));
              if (isNaN(price)) price = 0;
            }
            
            // Clean and validate data
            const drugData = {
              name: row.name?.trim() || 'Unknown Medicine',
              price: price,
              isDiscontinued: row.Is_discontinued?.toLowerCase() === 'true',
              manufacturerName: row.manufacturer_name?.trim() || 'Unknown Manufacturer',
              type: row.type?.trim() || 'allopathy',
              packSizeLabel: row.pack_size_label?.trim() || 'Unknown Pack',
              composition1: row.short_composition1?.trim() || null,
              composition2: row.short_composition2?.trim() || null,
              branchId: defaultBranch.id,
              isActive: true,
              category: extractCategory(row.name),
              dosageForm: extractDosageForm(row.pack_size_label),
              strength: extractStrength(row.short_composition1),
            };
            
            drugs.push(drugData);
            processedCount++;
            
            // Log progress every 1000 records
            if (processedCount % 1000 === 0) {
              console.log(`📊 Processed ${processedCount} records...`);
            }
            
          } catch (error) {
            errorCount++;
            console.error(`❌ Error processing row ${processedCount + 1}:`, error);
          }
        })
        .on('end', async () => {
          try {
            console.log(`\n📈 Total records processed: ${processedCount}`);
            console.log(`❌ Errors encountered: ${errorCount}`);
            console.log('💾 Inserting drugs into database...');
            
            // Insert drugs in batches to avoid memory issues
            const batchSize = 1000;
            let insertedCount = 0;
            
            for (let i = 0; i < drugs.length; i += batchSize) {
              const batch = drugs.slice(i, i + batchSize);
              
              try {
                await prisma.drug.createMany({
                  data: batch,
                  skipDuplicates: true,
                });
                
                insertedCount += batch.length;
                console.log(`✅ Inserted batch ${Math.ceil((i + 1) / batchSize)} - Total: ${insertedCount}`);
              } catch (batchError) {
                console.error(`❌ Error inserting batch ${Math.ceil((i + 1) / batchSize)}:`, batchError);
              }
            }
            
            console.log(`\n🎉 Drug import completed!`);
            console.log(`📊 Successfully imported ${insertedCount} drugs`);
            
            // Show some statistics
            const totalDrugs = await prisma.drug.count();
            const activeDrugs = await prisma.drug.count({ where: { isActive: true } });
            const discontinuedDrugs = await prisma.drug.count({ where: { isDiscontinued: true } });
            
            console.log(`\n📈 Database Statistics:`);
            console.log(`   Total drugs: ${totalDrugs}`);
            console.log(`   Active drugs: ${activeDrugs}`);
            console.log(`   Discontinued drugs: ${discontinuedDrugs}`);
            
            resolve();
          } catch (error) {
            console.error('❌ Error during database insertion:', error);
            reject(error);
          }
        })
        .on('error', (error: any) => {
          console.error('❌ Error reading CSV file:', error);
          reject(error);
        });
    });
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Helper functions to extract additional information
function extractCategory(name: string): string {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('tablet')) return 'Tablets';
  if (lowerName.includes('syrup')) return 'Syrups';
  if (lowerName.includes('capsule')) return 'Capsules';
  if (lowerName.includes('injection')) return 'Injections';
  if (lowerName.includes('cream') || lowerName.includes('ointment')) return 'Topical';
  if (lowerName.includes('drops')) return 'Drops';
  if (lowerName.includes('inhaler')) return 'Inhalers';
  if (lowerName.includes('suspension')) return 'Suspensions';
  
  return 'Others';
}

function extractDosageForm(packSizeLabel: string): string {
  const lowerPack = packSizeLabel.toLowerCase();
  
  if (lowerPack.includes('tablet')) return 'Tablet';
  if (lowerPack.includes('capsule')) return 'Capsule';
  if (lowerPack.includes('syrup')) return 'Syrup';
  if (lowerPack.includes('injection')) return 'Injection';
  if (lowerPack.includes('cream')) return 'Cream';
  if (lowerPack.includes('ointment')) return 'Ointment';
  if (lowerPack.includes('drops')) return 'Drops';
  if (lowerPack.includes('inhaler')) return 'Inhaler';
  if (lowerPack.includes('suspension')) return 'Suspension';
  
  return 'Other';
}

function extractStrength(composition: string | undefined): string | null {
  if (!composition) return null;
  
  // Extract strength from composition (e.g., "Amoxycillin (500mg)" -> "500mg")
  const strengthMatch = composition.match(/\(([^)]+mg|[^)]+mcg|[^)]+g)\)/);
  return strengthMatch ? strengthMatch[1] : null;
}

// Run the import
if (require.main === module) {
  importDrugData()
    .then(() => {
      console.log('✅ Drug data import completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Drug data import failed:', error);
      process.exit(1);
    });
}

export default importDrugData; 