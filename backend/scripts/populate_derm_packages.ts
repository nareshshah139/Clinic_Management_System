import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sample dermatology packages with common treatment combinations
const DERM_PACKAGES = [
  {
    name: 'Complete Acne Treatment Kit - Mild',
    description: 'Comprehensive 4-week acne treatment regimen for mild acne',
    category: 'Dermatology',
    subcategory: 'Acne Treatment',
    duration: '4 weeks',
    instructions: 'Start with cleanser, then apply treatments in sequence: morning and evening routine',
    indications: 'Mild to moderate acne vulgaris, comedonal acne',
    contraindications: 'Pregnancy (for retinoids), known allergies to ingredients',
    isPublic: true,
    items: [
      { drugName: 'Adapalene Gel 0.1%', quantity: 1, dosage: 'Apply thin layer', frequency: 'Once daily at night', duration: '4 weeks', sequence: 1 },
      { drugName: 'Clindamycin Gel 1%', quantity: 1, dosage: 'Apply thin layer', frequency: 'Twice daily', duration: '4 weeks', sequence: 2 },
      { drugName: 'Benzoyl Peroxide Gel 2.5%', quantity: 1, dosage: 'Apply to affected areas', frequency: 'Once daily in morning', duration: '4 weeks', sequence: 3 },
    ]
  },
  {
    name: 'Severe Acne Treatment Package',
    description: 'Intensive treatment for severe acne with oral and topical medications',
    category: 'Dermatology',
    subcategory: 'Acne Treatment',
    duration: '8-12 weeks',
    instructions: 'Take oral medications with food, apply topicals as directed. Monitor for side effects.',
    indications: 'Severe nodulocystic acne, acne not responding to topical treatment',
    contraindications: 'Pregnancy, breastfeeding, liver disease (for isotretinoin)',
    isPublic: true,
    items: [
      { drugName: 'Isotretinoin Capsules 20mg', quantity: 30, dosage: '20mg', frequency: 'Once daily with food', duration: '8 weeks', sequence: 1 },
      { drugName: 'Doxycycline Capsules 100mg', quantity: 28, dosage: '100mg', frequency: 'Once daily', duration: '4 weeks', sequence: 2 },
      { drugName: 'Tretinoin Cream 0.025%', quantity: 1, dosage: 'Pea-sized amount', frequency: 'Once daily at night', duration: '8 weeks', sequence: 3 },
    ]
  },
  {
    name: 'Anti-Aging Starter Kit',
    description: 'Complete anti-aging regimen for beginners',
    category: 'Dermatology',
    subcategory: 'Anti-aging',
    duration: '6 weeks',
    instructions: 'Start with lower concentrations and gradually increase. Always use sunscreen during the day.',
    indications: 'Fine lines, mild photoaging, age spots',
    contraindications: 'Pregnancy, breastfeeding, active eczema',
    isPublic: true,
    items: [
      { drugName: 'Tretinoin Cream 0.025%', quantity: 1, dosage: 'Pea-sized amount', frequency: 'Every other night initially', duration: '6 weeks', sequence: 1 },
      { drugName: 'Hydroquinone Cream 4%', quantity: 1, dosage: 'Apply to dark spots', frequency: 'Twice daily', duration: '6 weeks', sequence: 2 },
      { drugName: 'Urea Cream 10%', quantity: 1, dosage: 'Apply as moisturizer', frequency: 'Twice daily', duration: '6 weeks', sequence: 3 },
    ]
  },
  {
    name: 'Hair Loss Treatment - Male Pattern Baldness',
    description: 'Comprehensive hair loss treatment for men',
    category: 'Dermatology',
    subcategory: 'Hair Care',
    duration: '3 months minimum',
    instructions: 'Apply minoxidil to dry scalp, take finasteride with or without food',
    indications: 'Male pattern baldness (androgenic alopecia)',
    contraindications: 'Women of childbearing age (finasteride), scalp irritation',
    isPublic: true,
    items: [
      { drugName: 'Minoxidil Solution 5%', quantity: 2, dosage: '1ml twice daily', frequency: 'Twice daily', duration: '3 months', sequence: 1 },
      { drugName: 'Finasteride Tablets 1mg', quantity: 90, dosage: '1mg', frequency: 'Once daily', duration: '3 months', sequence: 2 },
      { drugName: 'Ketoconazole Shampoo 2%', quantity: 1, dosage: 'Apply to wet hair', frequency: '2-3 times per week', duration: '3 months', sequence: 3 },
    ]
  },
  {
    name: 'Hair Loss Treatment - Female',
    description: 'Safe hair loss treatment regimen for women',
    category: 'Dermatology',
    subcategory: 'Hair Care',
    duration: '3 months minimum',
    instructions: 'Apply minoxidil to dry scalp, use gentle shampoo',
    indications: 'Female pattern hair loss, telogen effluvium',
    contraindications: 'Pregnancy, breastfeeding, scalp conditions',
    isPublic: true,
    items: [
      { drugName: 'Minoxidil Solution 2%', quantity: 2, dosage: '1ml twice daily', frequency: 'Twice daily', duration: '3 months', sequence: 1 },
      { drugName: 'Ketoconazole Shampoo 2%', quantity: 1, dosage: 'Apply to wet hair', frequency: '2-3 times per week', duration: '3 months', sequence: 2 },
    ]
  },
  {
    name: 'Pigmentation Treatment Package',
    description: 'Complete melasma and hyperpigmentation treatment',
    category: 'Dermatology',
    subcategory: 'Pigmentation',
    duration: '8-12 weeks',
    instructions: 'Use hydroquinone for maximum 3 months, always apply sunscreen',
    indications: 'Melasma, post-inflammatory hyperpigmentation, age spots',
    contraindications: 'Pregnancy, breastfeeding, ochronosis',
    isPublic: true,
    items: [
      { drugName: 'Hydroquinone Cream 4%', quantity: 2, dosage: 'Apply to dark spots', frequency: 'Twice daily', duration: '8 weeks', sequence: 1 },
      { drugName: 'Tretinoin Cream 0.05%', quantity: 1, dosage: 'Thin layer', frequency: 'Once daily at night', duration: '8 weeks', sequence: 2 },
      { drugName: 'Mometasone Furoate Cream 0.1%', quantity: 1, dosage: 'Thin layer', frequency: 'Once daily', duration: '2 weeks only', sequence: 3 },
    ]
  },
  {
    name: 'Eczema Management Kit',
    description: 'Complete eczema treatment and maintenance package',
    category: 'Dermatology',
    subcategory: 'Eczema/Psoriasis',
    duration: '4-6 weeks',
    instructions: 'Use steroid cream for flares only, moisturize regularly',
    indications: 'Atopic dermatitis, eczema flares',
    contraindications: 'Viral skin infections, bacterial infections',
    isPublic: true,
    items: [
      { drugName: 'Tacrolimus Ointment 0.03%', quantity: 1, dosage: 'Thin layer', frequency: 'Twice daily', duration: '4 weeks', sequence: 1 },
      { drugName: 'Betamethasone Valerate Cream 0.1%', quantity: 1, dosage: 'Thin layer', frequency: 'Once daily for flares', duration: '1 week max', sequence: 2 },
      { drugName: 'Urea Cream 10%', quantity: 2, dosage: 'Liberal application', frequency: 'Multiple times daily', duration: '6 weeks', sequence: 3 },
    ]
  },
  {
    name: 'Fungal Infection Treatment',
    description: 'Comprehensive antifungal treatment package',
    category: 'Dermatology',
    subcategory: 'Fungal Infections',
    duration: '4-6 weeks',
    instructions: 'Continue treatment for 2 weeks after symptoms clear',
    indications: 'Tinea corporis, tinea pedis, candidal infections',
    contraindications: 'Liver disease (for oral antifungals), pregnancy',
    isPublic: true,
    items: [
      { drugName: 'Clotrimazole Cream 1%', quantity: 1, dosage: 'Apply to affected area', frequency: 'Twice daily', duration: '4 weeks', sequence: 1 },
      { drugName: 'Terbinafine Cream 1%', quantity: 1, dosage: 'Apply to affected area', frequency: 'Once daily', duration: '2 weeks', sequence: 2 },
      { drugName: 'Itraconazole Capsules 100mg', quantity: 14, dosage: '100mg', frequency: 'Once daily with food', duration: '2 weeks', sequence: 3 },
    ]
  },
  {
    name: 'Post-Procedure Care Kit',
    description: 'Complete post-procedure healing and care package',
    category: 'Dermatology',
    subcategory: 'Post-procedure Care',
    duration: '2-4 weeks',
    instructions: 'Keep area clean and moisturized, avoid sun exposure',
    indications: 'Post laser treatment, post chemical peel, post surgical procedures',
    contraindications: 'Active infection, open wounds',
    isPublic: true,
    items: [
      { drugName: 'Mupirocin Ointment 2%', quantity: 1, dosage: 'Thin layer', frequency: 'Twice daily', duration: '1 week', sequence: 1 },
      { drugName: 'Mometasone Furoate Cream 0.1%', quantity: 1, dosage: 'Thin layer', frequency: 'Once daily', duration: '1 week', sequence: 2 },
      { drugName: 'Urea Cream 10%', quantity: 1, dosage: 'Liberal application', frequency: 'Multiple times daily', duration: '4 weeks', sequence: 3 },
    ]
  }
];

async function main() {
  console.log('🏥 Starting dermatology packages population...');

  // Get the first branch
  const branch = await prisma.branch.findFirst();
  if (!branch) {
    throw new Error('No branch found. Please run the main seed script first.');
  }

  // Get a doctor to be the creator of public packages
  const doctor = await prisma.user.findFirst({
    where: { 
      role: 'DOCTOR',
      department: 'Dermatology'
    }
  });

  if (!doctor) {
    console.log('⚠️  No dermatology doctor found. Creating packages without a specific creator.');
  }

  console.log(`📍 Using branch: ${branch.name} (${branch.id})`);
  if (doctor) {
    console.log(`👨‍⚕️ Creator: Dr. ${doctor.firstName} ${doctor.lastName}`);
  }

  let packagesCreated = 0;
  let itemsCreated = 0;

  for (const packageData of DERM_PACKAGES) {
    try {
      // Find drugs for this package
      const packageItems = [];
      let originalPrice = 0;

      for (const itemData of packageData.items) {
        const drug = await prisma.drug.findFirst({
          where: {
            name: { contains: itemData.drugName, mode: 'insensitive' },
            branchId: branch.id,
            isActive: true
          }
        });

        if (drug) {
          packageItems.push({
            drugId: drug.id,
            quantity: itemData.quantity,
            dosage: itemData.dosage,
            frequency: itemData.frequency,
            duration: itemData.duration,
            sequence: itemData.sequence,
          });
          originalPrice += drug.price * itemData.quantity;
        } else {
          console.log(`⚠️  Drug not found: ${itemData.drugName}`);
        }
      }

      if (packageItems.length === 0) {
        console.log(`⚠️  No drugs found for package: ${packageData.name}`);
        continue;
      }

      // Calculate package price (15-25% discount)
      const discountPercent = Math.random() * 10 + 15; // 15-25% discount
      const packagePrice = originalPrice * (1 - discountPercent / 100);

      // Create the package
      const package_ = await prisma.pharmacyPackage.create({
        data: {
          name: packageData.name,
          description: packageData.description,
          category: packageData.category,
          subcategory: packageData.subcategory,
          originalPrice,
          packagePrice: Math.round(packagePrice * 100) / 100, // Round to 2 decimal places
          discountPercent: Math.round(discountPercent * 100) / 100,
          duration: packageData.duration,
          instructions: packageData.instructions,
          indications: packageData.indications,
          contraindications: packageData.contraindications,
          createdBy: doctor?.id,
          isPublic: packageData.isPublic,
          branchId: branch.id,
        }
      });

      // Create package items
      for (const itemData of packageItems) {
        await prisma.pharmacyPackageItem.create({
          data: {
            packageId: package_.id,
            ...itemData
          }
        });
        itemsCreated++;
      }

      packagesCreated++;
      console.log(`✅ Created package: ${packageData.name} (${packageItems.length} items)`);
      console.log(`   💰 Original: ₹${originalPrice.toFixed(2)} → Package: ₹${packagePrice.toFixed(2)} (${discountPercent.toFixed(1)}% off)`);

    } catch (error) {
      console.error(`❌ Error creating package ${packageData.name}:`, error);
    }
  }

  console.log('\n✅ Dermatology packages population completed!');
  console.log(`📦 Summary:`);
  console.log(`   • Packages created: ${packagesCreated}/${DERM_PACKAGES.length}`);
  console.log(`   • Package items created: ${itemsCreated}`);
  console.log(`   • Branch: ${branch.name}`);
  if (doctor) {
    console.log(`   • Created by: Dr. ${doctor.firstName} ${doctor.lastName}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error populating dermatology packages:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 