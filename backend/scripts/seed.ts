import { PrismaClient, UserRole, UserStatus, InventoryItemType, UnitType, InventoryStatus, StockStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Determine branch: create only if branches table is empty; otherwise reuse first existing
    const branchCount = await prisma.branch.count();
    let branch = await prisma.branch.findFirst();
    if (branchCount === 0 || !branch) {
      branch = await prisma.branch.create({
        data: {
        id: 'branch-seed-1',
        name: 'Main Branch',
        address: 'Hyderabad',
        city: 'Hyderabad',
        state: 'TS',
        pincode: '500001',
        phone: '9999999999',
        email: 'main@clinic.test',
        website: 'https://clinic.test',
        isActive: true,
      },
    });
    }

    // Users: create demo doctor and receptionist only if no users exist
    const userCount = await prisma.user.count();
    let doctor = await prisma.user.findFirst({ where: { role: UserRole.DOCTOR, branchId: branch.id } });
    let receptionist = await prisma.user.findFirst({ where: { role: UserRole.RECEPTION, branchId: branch.id } });
    if (userCount === 0) {
    const passwordHash = await bcrypt.hash('password123', 10);
      doctor = await prisma.user.create({
        data: {
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'doctor1@clinic.test',
        phone: '9000000001',
        password: passwordHash,
        role: UserRole.DOCTOR,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });
      receptionist = await prisma.user.create({
        data: {
        firstName: 'Riya',
        lastName: 'Sharma',
        email: 'reception@clinic.test',
        phone: '9000000002',
        password: await bcrypt.hash('password123', 10),
        role: UserRole.RECEPTION,
        status: UserStatus.ACTIVE,
        branchId: branch.id,
        isActive: true,
      },
    });
    }

      // Rooms: create one only if rooms table is empty
  const roomCount = await prisma.room.count();
  let room = await prisma.room.findFirst({ where: { branchId: branch.id } });
  if (roomCount === 0) {
    // Create 2 Consultation Rooms and 3 Procedure Rooms as requested
    const rooms = await Promise.all([
      prisma.room.create({
        data: {
          id: 'room-seed-1',
          name: 'Consultation Room 1',
          type: 'Consultation',
          capacity: 2,
          isActive: true,
          branchId: branch.id,
        },
      }),
      prisma.room.create({
        data: {
          id: 'room-seed-2',
          name: 'Consultation Room 2',
          type: 'Consultation',
          capacity: 3,
          isActive: true,
          branchId: branch.id,
        },
      }),
      prisma.room.create({
        data: {
          id: 'room-seed-3',
          name: 'Procedure Room A',
          type: 'Procedure',
          capacity: 3,
          isActive: true,
          branchId: branch.id,
        },
      }),
      prisma.room.create({
        data: {
          id: 'room-seed-4',
          name: 'Procedure Room B',
          type: 'Procedure',
          capacity: 4,
          isActive: true,
          branchId: branch.id,
        },
      }),
      prisma.room.create({
        data: {
          id: 'room-seed-5',
          name: 'Procedure Room C',
          type: 'Procedure',
          capacity: 2,
          isActive: true,
          branchId: branch.id,
        },
      }),
      // Optional: Add one telemedicine room for completeness
      prisma.room.create({
        data: {
          id: 'room-seed-6',
          name: 'Telemedicine Suite',
          type: 'Telemed',
          capacity: 1,
          isActive: true,
          branchId: branch.id,
        },
      }),
    ]);
    room = rooms[0]; // Use first room as default
    console.log(`Created ${rooms.length} rooms: 2 Consultation, 3 Procedure, 1 Telemedicine`);
  }

    // Patients: create one only if patients table is empty
    const patientCount = await prisma.patient.count();
    let patient = await prisma.patient.findFirst({ where: { branchId: branch.id } });
    if (patientCount === 0) {
      patient = await prisma.patient.create({
        data: {
        id: 'patient-seed-1',
        name: 'John Doe',
        gender: 'M',
        dob: new Date('1990-01-01'),
        phone: '9000001000',
        email: 'john.doe@patient.test',
        address: 'Hyderabad',
        branchId: branch.id,
      },
    });
    }

    // Dermatology-focused inventory items (India relevant)
    const inventoryItems: Array<{
      sku: string;
      name: string;
      genericName?: string;
      brandName?: string;
      type: InventoryItemType;
      category?: string;
      subCategory?: string;
      manufacturer?: string;
      requiresPrescription?: boolean;
      unit: UnitType;
      packSize?: number;
      packUnit?: string;
      costPrice: number;
      sellingPrice: number;
      mrp?: number;
      gstRate?: number;
      currentStock: number;
      storageLocation?: string;
      tags?: string[];
    }> = [
      // Acne management
      { sku: 'MED-ADAPALENE-15G', name: 'Adapalene 0.1% Gel 15g', genericName: 'Adapalene', brandName: 'Adaferin/Adaclene', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Topical Retinoid', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', requiresPrescription: true, costPrice: 90, sellingPrice: 110, mrp: 120, gstRate: 12, currentStock: 60, tags: ['ACNE','RETINOID'] },
      { sku: 'MED-BPO-2.5-30G', name: 'Benzoyl Peroxide 2.5% Gel 30g', genericName: 'Benzoyl Peroxide', brandName: 'Brevoxyl/Panoxyl', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Antibacterial', unit: UnitType.TUBES, packSize: 30, packUnit: 'g', costPrice: 120, sellingPrice: 145, mrp: 160, gstRate: 12, currentStock: 45, tags: ['ACNE'] },
      { sku: 'MED-CLINDAGEL-20G', name: 'Clindamycin 1% Gel 20g', genericName: 'Clindamycin Phosphate', brandName: 'Clindac A', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Antibiotic', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', requiresPrescription: true, costPrice: 85, sellingPrice: 105, mrp: 115, gstRate: 12, currentStock: 50, tags: ['ACNE','ANTIBIOTIC'] },
      { sku: 'MED-TRETINOIN-20G', name: 'Tretinoin 0.05% Cream 20g', genericName: 'Tretinoin', brandName: 'Retino-A', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Topical Retinoid', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', requiresPrescription: true, costPrice: 95, sellingPrice: 120, mrp: 130, gstRate: 12, currentStock: 40, tags: ['ACNE','RETINOID'] },
      { sku: 'MED-DAPSONE-20G', name: 'Dapsone 5% Gel 20g', genericName: 'Dapsone', brandName: 'Acnedap', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Anti-inflammatory', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', requiresPrescription: true, costPrice: 160, sellingPrice: 195, mrp: 210, gstRate: 12, currentStock: 30, tags: ['ACNE'] },
      { sku: 'MED-SALICYLIC-60ML', name: 'Salicylic Acid 2% Face Wash 60ml', genericName: 'Salicylic Acid', brandName: 'Saslic/Saliface', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Keratolytic', unit: UnitType.BOTTLES, packSize: 60, packUnit: 'ml', costPrice: 140, sellingPrice: 170, mrp: 185, gstRate: 18, currentStock: 55, tags: ['ACNE','FACEWASH'] },
      { sku: 'MED-ISOTRET-10MG', name: 'Isotretinoin 10 mg Capsules (Strip of 10)', genericName: 'Isotretinoin', brandName: 'Accufine/Isotroin', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Systemic Retinoid', unit: UnitType.STRIPS, packSize: 10, packUnit: 'caps', requiresPrescription: true, costPrice: 110, sellingPrice: 140, mrp: 150, gstRate: 12, currentStock: 80, tags: ['ACNE','ORAL'] },
      { sku: 'MED-ISOTRET-20MG', name: 'Isotretinoin 20 mg Capsules (Strip of 10)', genericName: 'Isotretinoin', brandName: 'Accufine/Isotroin', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Systemic Retinoid', unit: UnitType.STRIPS, packSize: 10, packUnit: 'caps', requiresPrescription: true, costPrice: 190, sellingPrice: 230, mrp: 250, gstRate: 12, currentStock: 60, tags: ['ACNE','ORAL'] },
      { sku: 'MED-DOXY-100MG', name: 'Doxycycline 100 mg Tablets (Strip of 10)', genericName: 'Doxycycline', brandName: 'Doxicip', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Antibiotic', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', requiresPrescription: true, costPrice: 18, sellingPrice: 28, mrp: 30, gstRate: 12, currentStock: 120, tags: ['ACNE','ANTIBIOTIC'] },
      { sku: 'MED-AZITHRO-500MG', name: 'Azithromycin 500 mg Tablets (Strip of 3)', genericName: 'Azithromycin', brandName: 'Azithral', type: InventoryItemType.MEDICINE, category: 'Bacterial', subCategory: 'Antibiotic', unit: UnitType.STRIPS, packSize: 3, packUnit: 'tabs', requiresPrescription: true, costPrice: 55, sellingPrice: 70, mrp: 78, gstRate: 12, currentStock: 70, tags: ['ANTIBIOTIC'] },

      // Antifungals
      { sku: 'MED-CLOT-15G', name: 'Clotrimazole 1% Cream 15g', genericName: 'Clotrimazole', brandName: 'Candid', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', costPrice: 48, sellingPrice: 60, mrp: 65, gstRate: 12, currentStock: 100, tags: ['FUNGAL'] },
      { sku: 'MED-KETO-SHAM-100', name: 'Ketoconazole 2% Shampoo 100ml', genericName: 'Ketoconazole', brandName: 'Nizral', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Shampoo', unit: UnitType.BOTTLES, packSize: 100, packUnit: 'ml', costPrice: 220, sellingPrice: 265, mrp: 280, gstRate: 18, currentStock: 40, tags: ['FUNGAL','DANDRUFF'] },
      { sku: 'MED-TERBI-250', name: 'Terbinafine 250 mg Tablets (Strip of 7)', genericName: 'Terbinafine', brandName: 'Sebifin', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Oral', unit: UnitType.STRIPS, packSize: 7, packUnit: 'tabs', requiresPrescription: true, costPrice: 85, sellingPrice: 105, mrp: 115, gstRate: 12, currentStock: 65, tags: ['FUNGAL','ORAL'] },
      { sku: 'MED-ITRA-100', name: 'Itraconazole 100 mg Capsules (Strip of 10)', genericName: 'Itraconazole', brandName: 'Itrasys/Candiforce', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Oral', unit: UnitType.STRIPS, packSize: 10, packUnit: 'caps', requiresPrescription: true, costPrice: 210, sellingPrice: 250, mrp: 270, gstRate: 12, currentStock: 55, tags: ['FUNGAL','ORAL'] },
      { sku: 'MED-ECON-30G', name: 'Econazole 1% Cream 30g', genericName: 'Econazole', brandName: 'Ecoderm', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 30, packUnit: 'g', costPrice: 125, sellingPrice: 160, mrp: 175, gstRate: 12, currentStock: 35, tags: ['FUNGAL'] },

      // Steroids and anti-inflammatory
      { sku: 'MED-HC-1-15G', name: 'Hydrocortisone 1% Cream 15g', genericName: 'Hydrocortisone', brandName: 'HHC', type: InventoryItemType.MEDICINE, category: 'Steroid', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', costPrice: 28, sellingPrice: 40, mrp: 45, gstRate: 12, currentStock: 85, tags: ['DERM','STEROID'] },
      { sku: 'MED-MOME-15G', name: 'Mometasone 0.1% Cream 15g', genericName: 'Mometasone Furoate', brandName: 'Elocon/Momesone', type: InventoryItemType.MEDICINE, category: 'Steroid', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', requiresPrescription: true, costPrice: 135, sellingPrice: 170, mrp: 185, gstRate: 12, currentStock: 40, tags: ['DERM','STEROID'] },
      { sku: 'MED-BETNOVATE-20G', name: 'Betamethasone Valerate 0.1% Cream 20g', genericName: 'Betamethasone', brandName: 'Betnovate', type: InventoryItemType.MEDICINE, category: 'Steroid', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', costPrice: 55, sellingPrice: 72, mrp: 80, gstRate: 12, currentStock: 70, tags: ['DERM','STEROID'] },

      // Pigmentation/Acne adjuncts
      { sku: 'MED-HQ-2-30G', name: 'Hydroquinone 2% Cream 30g', genericName: 'Hydroquinone', brandName: 'Melalite', type: InventoryItemType.MEDICINE, category: 'Pigmentation', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 30, packUnit: 'g', requiresPrescription: true, costPrice: 95, sellingPrice: 125, mrp: 135, gstRate: 12, currentStock: 25, tags: ['PIGMENT'] },
      { sku: 'MED-AZELAIC-20-15G', name: 'Azelaic Acid 20% Cream 15g', genericName: 'Azelaic Acid', brandName: 'Aziderm', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', costPrice: 155, sellingPrice: 190, mrp: 205, gstRate: 12, currentStock: 30, tags: ['ACNE'] },
      { sku: 'MED-KOJIC-30G', name: 'Kojic Acid Cream 30g', genericName: 'Kojic Acid + Vitamin C', brandName: 'Kojivit', type: InventoryItemType.MEDICINE, category: 'Pigmentation', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 30, packUnit: 'g', costPrice: 165, sellingPrice: 210, mrp: 225, gstRate: 12, currentStock: 20, tags: ['PIGMENT'] },

      // Antipruritic/Allergy
      { sku: 'MED-CETIRIZINE-10', name: 'Cetirizine 10 mg Tablets (Strip of 10)', genericName: 'Cetirizine', brandName: 'Cetzine', type: InventoryItemType.MEDICINE, category: 'Allergy', subCategory: 'Antihistamine', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', costPrice: 10, sellingPrice: 15, mrp: 18, gstRate: 12, currentStock: 150, tags: ['ALLERGY'] },
      { sku: 'MED-LEVOCET-5', name: 'Levocetirizine 5 mg Tablets (Strip of 10)', genericName: 'Levocetirizine', brandName: 'Xyzal/Levocet', type: InventoryItemType.MEDICINE, category: 'Allergy', subCategory: 'Antihistamine', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', costPrice: 16, sellingPrice: 22, mrp: 26, gstRate: 12, currentStock: 120, tags: ['ALLERGY'] },
      { sku: 'MED-FEXO-180', name: 'Fexofenadine 180 mg Tablets (Strip of 10)', genericName: 'Fexofenadine', brandName: 'Allegra', type: InventoryItemType.MEDICINE, category: 'Allergy', subCategory: 'Antihistamine', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', costPrice: 145, sellingPrice: 180, mrp: 195, gstRate: 12, currentStock: 45, tags: ['ALLERGY'] },

      // Scabies and lice
      { sku: 'MED-PERM-5-60G', name: 'Permethrin 5% Cream 60g', genericName: 'Permethrin', brandName: 'Permite', type: InventoryItemType.MEDICINE, category: 'Scabies', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 60, packUnit: 'g', costPrice: 185, sellingPrice: 230, mrp: 245, gstRate: 12, currentStock: 25, tags: ['SCABIES'] },

      // Psoriasis
      { sku: 'MED-CALCIP-20G', name: 'Calcipotriol 0.005% Ointment 20g', genericName: 'Calcipotriol', brandName: 'Supatret-C / Daivonex', type: InventoryItemType.MEDICINE, category: 'Psoriasis', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', costPrice: 320, sellingPrice: 380, mrp: 400, gstRate: 12, currentStock: 18, tags: ['PSORIASIS'] },
      { sku: 'MED-CALBET-20G', name: 'Calcipotriol + Betamethasone Ointment 20g', genericName: 'Calcipotriol + Betamethasone', brandName: 'Tacroz Forte/Daivobet', type: InventoryItemType.MEDICINE, category: 'Psoriasis', subCategory: 'Combo', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', costPrice: 420, sellingPrice: 495, mrp: 520, gstRate: 12, currentStock: 12, tags: ['PSORIASIS'] },
      { sku: 'MED-COALTAR-SHAM', name: 'Coal Tar + Salicylic Acid Shampoo 150ml', genericName: 'Coal Tar + Salicylic Acid', brandName: 'Protar', type: InventoryItemType.MEDICINE, category: 'Psoriasis', subCategory: 'Shampoo', unit: UnitType.BOTTLES, packSize: 150, packUnit: 'ml', costPrice: 160, sellingPrice: 195, mrp: 210, gstRate: 18, currentStock: 22, tags: ['PSORIASIS'] },
      { sku: 'MED-MTX-2.5', name: 'Methotrexate 2.5 mg Tablets (Strip of 10)', genericName: 'Methotrexate', brandName: 'Folitrax', type: InventoryItemType.MEDICINE, category: 'Psoriasis', subCategory: 'Oral', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', requiresPrescription: true, costPrice: 35, sellingPrice: 48, mrp: 52, gstRate: 12, currentStock: 30, tags: ['PSORIASIS','ORAL'] },

      // Vitiligo / Atopic dermatitis
      { sku: 'MED-TAC-0.1-10G', name: 'Tacrolimus 0.1% Ointment 10g', genericName: 'Tacrolimus', brandName: 'Tacroz 0.1%', type: InventoryItemType.MEDICINE, category: 'Atopic/Vitiligo', subCategory: 'Topical Calcineurin Inhibitor', unit: UnitType.TUBES, packSize: 10, packUnit: 'g', costPrice: 280, sellingPrice: 335, mrp: 350, gstRate: 12, currentStock: 28, tags: ['ATOPIC','VITILIGO'] },
      { sku: 'MED-TAC-0.03-10G', name: 'Tacrolimus 0.03% Ointment 10g', genericName: 'Tacrolimus', brandName: 'Tacroz 0.03%', type: InventoryItemType.MEDICINE, category: 'Atopic', subCategory: 'Topical Calcineurin Inhibitor', unit: UnitType.TUBES, packSize: 10, packUnit: 'g', costPrice: 210, sellingPrice: 255, mrp: 270, gstRate: 12, currentStock: 26, tags: ['ATOPIC'] },

      // Hair loss
      { sku: 'MED-MINOX-5-60ML', name: 'Minoxidil 5% Solution 60ml', genericName: 'Minoxidil', brandName: 'Tugain/Rogaine', type: InventoryItemType.MEDICINE, category: 'Hair', subCategory: 'Topical', unit: UnitType.BOTTLES, packSize: 60, packUnit: 'ml', costPrice: 420, sellingPrice: 495, mrp: 520, gstRate: 18, currentStock: 35, tags: ['ALOPECIA'] },
      { sku: 'MED-FINA-1MG', name: 'Finasteride 1 mg Tablets (Strip of 10)', genericName: 'Finasteride', brandName: 'Finax', type: InventoryItemType.MEDICINE, category: 'Hair', subCategory: 'Oral', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', requiresPrescription: true, costPrice: 65, sellingPrice: 85, mrp: 95, gstRate: 12, currentStock: 40, tags: ['ALOPECIA','ORAL'] },

      // Antivirals
      { sku: 'MED-ACV-400', name: 'Acyclovir 400 mg Tablets (Strip of 10)', genericName: 'Acyclovir', brandName: 'Acivir', type: InventoryItemType.MEDICINE, category: 'Antiviral', subCategory: 'Oral', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', requiresPrescription: true, costPrice: 75, sellingPrice: 95, mrp: 110, gstRate: 12, currentStock: 30, tags: ['HSV','ANTIVIRAL'] },
      { sku: 'MED-ACV-CREAM-10G', name: 'Acyclovir 5% Cream 10g', genericName: 'Acyclovir', brandName: 'Acivir Cream', type: InventoryItemType.MEDICINE, category: 'Antiviral', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 10, packUnit: 'g', costPrice: 110, sellingPrice: 135, mrp: 145, gstRate: 12, currentStock: 18, tags: ['HSV','TOPICAL'] },

      // Emollients & sunscreens
      { sku: 'MED-EMOLLIENT-50G', name: 'Light Liquid Paraffin + White Soft Paraffin Cream 50g', genericName: 'LLP + WSP', brandName: 'Moisturex', type: InventoryItemType.MEDICINE, category: 'Emollient', subCategory: 'Moisturizer', unit: UnitType.TUBES, packSize: 50, packUnit: 'g', costPrice: 105, sellingPrice: 130, mrp: 140, gstRate: 12, currentStock: 100, tags: ['EMOLLIENT'] },
      { sku: 'MED-UREA-10-100G', name: 'Urea 10% Cream 100g', genericName: 'Urea', brandName: 'Ureaderm', type: InventoryItemType.MEDICINE, category: 'Emollient', subCategory: 'Keratolytic', unit: UnitType.TUBES, packSize: 100, packUnit: 'g', costPrice: 140, sellingPrice: 170, mrp: 185, gstRate: 12, currentStock: 40, tags: ['EMOLLIENT'] },
      { sku: 'MED-SUNSCREEN-SPF50', name: 'Broad Spectrum Sunscreen SPF 50 50ml', genericName: 'Sunscreen', brandName: 'Suncros/UV Doux', type: InventoryItemType.MEDICINE, category: 'Sun Care', subCategory: 'Sunscreen', unit: UnitType.BOTTLES, packSize: 50, packUnit: 'ml', costPrice: 480, sellingPrice: 560, mrp: 590, gstRate: 18, currentStock: 25, tags: ['SUNCARE'] },

      // Misc dermatology consumables/instruments
      { sku: 'CONS-GLOVES-M', name: 'Nitrile Examination Gloves - Medium (Box of 100)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Gloves', unit: UnitType.BOXES, packSize: 100, packUnit: 'pcs', costPrice: 280, sellingPrice: 330, mrp: 350, gstRate: 12, currentStock: 20, tags: ['CLINIC'] },
      { sku: 'CONS-GAUZE-100', name: 'Sterile Gauze Swabs 10x10cm (Pack of 100)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Dressings', unit: UnitType.PACKS, packSize: 100, packUnit: 'pcs', costPrice: 120, sellingPrice: 150, mrp: 160, gstRate: 12, currentStock: 35, tags: ['CLINIC'] },
      { sku: 'CONS-ALCO-SWABS-100', name: 'Alcohol Swabs (Pack of 100)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Antiseptic', unit: UnitType.PACKS, packSize: 100, packUnit: 'pcs', costPrice: 60, sellingPrice: 85, mrp: 95, gstRate: 12, currentStock: 50, tags: ['CLINIC'] },
      { sku: 'CONS-COTTON-500G', name: 'Absorbent Cotton Roll 500g', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Dressings', unit: UnitType.PACKS, packSize: 1, packUnit: 'roll', costPrice: 110, sellingPrice: 135, mrp: 150, gstRate: 12, currentStock: 20, tags: ['CLINIC'] },
      { sku: 'CONS-MICROPORE-1IN', name: 'Micropore Surgical Tape 1 inch x 9.1m', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Tape', unit: UnitType.PIECES, packSize: 1, packUnit: 'roll', costPrice: 45, sellingPrice: 60, mrp: 65, gstRate: 12, currentStock: 40, tags: ['CLINIC'] },
      { sku: 'CONS-BANDAGE-ELASTIC', name: 'Elastic Adhesive Bandage 10cm x 4m', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Bandage', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 90, sellingPrice: 115, mrp: 125, gstRate: 12, currentStock: 25, tags: ['CLINIC'] },
      { sku: 'CONS-SYRINGE-5ML', name: 'Disposable Syringe 5ml (Box of 100)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Syringe', unit: UnitType.BOXES, packSize: 100, packUnit: 'pcs', costPrice: 230, sellingPrice: 280, mrp: 300, gstRate: 12, currentStock: 12, tags: ['CLINIC'] },
      { sku: 'CONS-NEEDLES-26G', name: 'Disposable Needles 26G (Box of 100)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Needles', unit: UnitType.BOXES, packSize: 100, packUnit: 'pcs', costPrice: 140, sellingPrice: 175, mrp: 190, gstRate: 12, currentStock: 15, tags: ['CLINIC'] },
      { sku: 'EQP-COMEDONE-EXTRACT', name: 'Comedone Extractor (Stainless Steel)', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Extraction', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 85, sellingPrice: 120, mrp: 140, gstRate: 18, currentStock: 10, tags: ['INSTRUMENT'] },
      { sku: 'EQP-DERMAROL-1.0', name: 'Dermaroller 1.0 mm', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Microneedling', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 550, sellingPrice: 700, mrp: 750, gstRate: 18, currentStock: 8, tags: ['INSTRUMENT','AESTHETIC'] },
      { sku: 'EQP-DERMAROL-0.5', name: 'Dermaroller 0.5 mm', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Microneedling', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 520, sellingPrice: 660, mrp: 710, gstRate: 18, currentStock: 9, tags: ['INSTRUMENT','AESTHETIC'] },
      { sku: 'EQP-BIOPSY-PUNCH-3', name: 'Skin Biopsy Punch 3 mm (Pack of 10)', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Biopsy', unit: UnitType.PACKS, packSize: 10, packUnit: 'pcs', costPrice: 260, sellingPrice: 320, mrp: 350, gstRate: 18, currentStock: 6, tags: ['INSTRUMENT'] },
      { sku: 'EQP-CRYO-SPRAY', name: 'Cryo Spray (Liquid Nitrogen) - Refillable', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Cryotherapy', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 3500, sellingPrice: 4200, mrp: 4500, gstRate: 18, currentStock: 2, tags: ['INSTRUMENT'] },
      { sku: 'EQP-CAUTERY-TIPS', name: 'Electrocautery Tips (Pack of 10)', type: InventoryItemType.SUPPLY, category: 'Instruments', subCategory: 'Cautery', unit: UnitType.PACKS, packSize: 10, packUnit: 'pcs', costPrice: 280, sellingPrice: 340, mrp: 360, gstRate: 18, currentStock: 5, tags: ['INSTRUMENT'] },

      // Additional staples to reach 50+
      { sku: 'MED-METRONIDAZOLE-20G', name: 'Metronidazole 1% Gel 20g', genericName: 'Metronidazole', brandName: 'Metrogyl Gel', type: InventoryItemType.MEDICINE, category: 'Rosacea', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 20, packUnit: 'g', costPrice: 60, sellingPrice: 85, mrp: 95, gstRate: 12, currentStock: 22, tags: ['ROSACEA'] },
      { sku: 'MED-CLINDABPO-15G', name: 'Clindamycin 1% + BPO 5% Gel 15g', genericName: 'Clindamycin + Benzoyl Peroxide', brandName: 'Clindoxyl', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Combo', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', costPrice: 165, sellingPrice: 205, mrp: 220, gstRate: 12, currentStock: 18, tags: ['ACNE','COMBO'] },
      { sku: 'MED-NIACIN-10', name: 'Niacinamide 10% Serum 30ml', genericName: 'Niacinamide', brandName: 'The Derma Co', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'Serum', unit: UnitType.BOTTLES, packSize: 30, packUnit: 'ml', costPrice: 210, sellingPrice: 260, mrp: 280, gstRate: 18, currentStock: 16, tags: ['ACNE','SERUM'] },
      { sku: 'MED-MUPI-5-5G', name: 'Mupirocin 2% Ointment 5g', genericName: 'Mupirocin', brandName: 'Bactroban/Mupi', type: InventoryItemType.MEDICINE, category: 'Bacterial', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 5, packUnit: 'g', costPrice: 85, sellingPrice: 110, mrp: 120, gstRate: 12, currentStock: 24, tags: ['ANTIBIOTIC'] },
      { sku: 'MED-SELEN-SEL-60', name: 'Selenium Sulfide 2.5% Shampoo 60ml', genericName: 'Selenium Sulfide', brandName: 'Selsun', type: InventoryItemType.MEDICINE, category: 'Dandruff', subCategory: 'Shampoo', unit: UnitType.BOTTLES, packSize: 60, packUnit: 'ml', costPrice: 95, sellingPrice: 125, mrp: 135, gstRate: 18, currentStock: 20, tags: ['DANDRUFF'] },
      { sku: 'MED-ASCORBIC-20-30', name: 'Vitamin C 20% Serum 30ml', genericName: 'Ascorbic Acid', brandName: 'VC-20', type: InventoryItemType.MEDICINE, category: 'Pigmentation', subCategory: 'Serum', unit: UnitType.BOTTLES, packSize: 30, packUnit: 'ml', costPrice: 330, sellingPrice: 395, mrp: 420, gstRate: 18, currentStock: 14, tags: ['PIGMENT','SERUM'] },
      { sku: 'MED-HCQ-200', name: 'Hydroxychloroquine 200 mg Tablets (Strip of 10)', genericName: 'Hydroxychloroquine', brandName: 'HCQ', type: InventoryItemType.MEDICINE, category: 'Autoimmune', subCategory: 'Oral', unit: UnitType.STRIPS, packSize: 10, packUnit: 'tabs', requiresPrescription: true, costPrice: 90, sellingPrice: 115, mrp: 125, gstRate: 12, currentStock: 12, tags: ['DERM','ORAL'] },
      { sku: 'MED-CLTRIM-POW-75', name: 'Clotrimazole Dusting Powder 1% 75g', genericName: 'Clotrimazole', brandName: 'Candid Powder', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Powder', unit: UnitType.TUBES, packSize: 75, packUnit: 'g', costPrice: 110, sellingPrice: 140, mrp: 150, gstRate: 12, currentStock: 34, tags: ['FUNGAL'] },
      { sku: 'MED-HYALO-HA-30', name: 'Hyaluronic Acid Serum 30ml', genericName: 'Sodium Hyaluronate', brandName: 'Hyalu Serum', type: InventoryItemType.MEDICINE, category: 'Hydration', subCategory: 'Serum', unit: UnitType.BOTTLES, packSize: 30, packUnit: 'ml', costPrice: 250, sellingPrice: 305, mrp: 320, gstRate: 18, currentStock: 18, tags: ['HYDRATION'] },
      { sku: 'MED-GLYCOLIC-6-30', name: 'Glycolic Acid 6% Cream 30g', genericName: 'Glycolic Acid', brandName: 'Glyco 6', type: InventoryItemType.MEDICINE, category: 'Acne', subCategory: 'AHA', unit: UnitType.TUBES, packSize: 30, packUnit: 'g', costPrice: 120, sellingPrice: 155, mrp: 165, gstRate: 12, currentStock: 22, tags: ['ACNE','AHA'] },
      { sku: 'MED-CLOBET-0.05-25', name: 'Clobetasol Propionate 0.05% Cream 25g', genericName: 'Clobetasol', brandName: 'Tenovate', type: InventoryItemType.MEDICINE, category: 'Steroid', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 25, packUnit: 'g', costPrice: 85, sellingPrice: 110, mrp: 120, gstRate: 12, currentStock: 18, tags: ['STEROID'] },
      { sku: 'MED-EMOL-SYLO-200', name: 'Syndet Moisturizing Lotion 200ml', genericName: 'Moisturizing Lotion', brandName: 'Cetaphil/Physiogel', type: InventoryItemType.MEDICINE, category: 'Emollient', subCategory: 'Lotion', unit: UnitType.BOTTLES, packSize: 200, packUnit: 'ml', costPrice: 620, sellingPrice: 695, mrp: 730, gstRate: 18, currentStock: 10, tags: ['EMOLLIENT'] },
      { sku: 'MED-ACNE-PATCH-24', name: 'Hydrocolloid Acne Patches (Pack of 24)', type: InventoryItemType.CONSUMABLE, category: 'Acne', subCategory: 'Patch', unit: UnitType.PACKS, packSize: 24, packUnit: 'pcs', costPrice: 120, sellingPrice: 160, mrp: 175, gstRate: 18, currentStock: 20, tags: ['ACNE'] },
      { sku: 'MED-SILICONE-GEL-15', name: 'Silicone Scar Gel 15g', genericName: 'Silicone Gel', brandName: 'ScarRedu', type: InventoryItemType.MEDICINE, category: 'Scar', subCategory: 'Topical', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', costPrice: 260, sellingPrice: 320, mrp: 340, gstRate: 18, currentStock: 8, tags: ['SCAR'] },
      { sku: 'MED-HCL-CHLORHEX-0.2', name: 'Chlorhexidine Mouthwash 0.2% 200ml', genericName: 'Chlorhexidine', brandName: 'Hexidine', type: InventoryItemType.MEDICINE, category: 'Antiseptic', subCategory: 'Mouthwash', unit: UnitType.BOTTLES, packSize: 200, packUnit: 'ml', costPrice: 110, sellingPrice: 135, mrp: 145, gstRate: 18, currentStock: 12, tags: ['ANTISEPTIC'] },
      { sku: 'MED-RETINOL-0.3-30', name: 'Retinol 0.3% Serum 30ml', genericName: 'Retinol', brandName: 'Retinol Serum', type: InventoryItemType.MEDICINE, category: 'Antiaging', subCategory: 'Serum', unit: UnitType.BOTTLES, packSize: 30, packUnit: 'ml', costPrice: 380, sellingPrice: 450, mrp: 480, gstRate: 18, currentStock: 9, tags: ['ANTIAGING'] },
      { sku: 'MED-CALAMINE-100', name: 'Calamine Lotion 100ml', genericName: 'Calamine + Zinc Oxide', brandName: 'SurgiCalamine', type: InventoryItemType.MEDICINE, category: 'Itch', subCategory: 'Lotion', unit: UnitType.BOTTLES, packSize: 100, packUnit: 'ml', costPrice: 60, sellingPrice: 85, mrp: 95, gstRate: 12, currentStock: 26, tags: ['ITCH'] },
      { sku: 'MED-LACTIC-12-100', name: 'Lactic Acid 12% Lotion 100ml', genericName: 'Lactic Acid', brandName: 'LactoCal', type: InventoryItemType.MEDICINE, category: 'Keratolytic', subCategory: 'Lotion', unit: UnitType.BOTTLES, packSize: 100, packUnit: 'ml', costPrice: 140, sellingPrice: 175, mrp: 185, gstRate: 12, currentStock: 14, tags: ['KERATOLYTIC'] },
      { sku: 'MED-UREA-20-50', name: 'Urea 20% Cream 50g', genericName: 'Urea', brandName: 'Ureaderm 20', type: InventoryItemType.MEDICINE, category: 'Emollient', subCategory: 'Keratolytic', unit: UnitType.TUBES, packSize: 50, packUnit: 'g', costPrice: 165, sellingPrice: 205, mrp: 220, gstRate: 12, currentStock: 15, tags: ['EMOLLIENT'] },
      { sku: 'MED-COOL-ANTIF-15', name: 'Clotrimazole + Beclomethasone Cream 15g', genericName: 'Clotrimazole + Beclomethasone', brandName: 'Candid-B', type: InventoryItemType.MEDICINE, category: 'Antifungal', subCategory: 'Combo', unit: UnitType.TUBES, packSize: 15, packUnit: 'g', costPrice: 95, sellingPrice: 125, mrp: 135, gstRate: 12, currentStock: 22, tags: ['FUNGAL','COMBO'] },
      { sku: 'MED-SALICYLIC-12-50', name: 'Salicylic Acid 12% Ointment 50g', genericName: 'Salicylic Acid', brandName: 'Salicylix', type: InventoryItemType.MEDICINE, category: 'Keratolytic', subCategory: 'Ointment', unit: UnitType.TUBES, packSize: 50, packUnit: 'g', costPrice: 120, sellingPrice: 155, mrp: 165, gstRate: 12, currentStock: 16, tags: ['KERATOLYTIC'] },
      { sku: 'MED-GLUTATHIONE-600', name: 'Glutathione 600 mg Injection (Vial)', genericName: 'Glutathione', brandName: 'Glutashot', type: InventoryItemType.MEDICINE, category: 'Aesthetic', subCategory: 'Injection', unit: UnitType.VIALS, packSize: 1, packUnit: 'vial', requiresPrescription: true, costPrice: 850, sellingPrice: 980, mrp: 1050, gstRate: 5, currentStock: 6, tags: ['AESTHETIC'] },
      { sku: 'EQP-DERMA-PEN-TIPS', name: 'Dermapen Cartridges (Pack of 10)', type: InventoryItemType.SUPPLY, category: 'Instruments', subCategory: 'Microneedling', unit: UnitType.PACKS, packSize: 10, packUnit: 'pcs', costPrice: 450, sellingPrice: 540, mrp: 580, gstRate: 18, currentStock: 7, tags: ['INSTRUMENT','AESTHETIC'] },
      { sku: 'CONS-PARAFFIN-GAUZE', name: 'Paraffin Gauze Dressing 10x10cm (Pack of 10)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Dressings', unit: UnitType.PACKS, packSize: 10, packUnit: 'pcs', costPrice: 160, sellingPrice: 195, mrp: 210, gstRate: 12, currentStock: 10, tags: ['CLINIC'] },
      { sku: 'CONS-SUTURE-3-0', name: 'Suture 3-0 (Pack of 12)', type: InventoryItemType.CONSUMABLE, category: 'Clinic', subCategory: 'Sutures', unit: UnitType.PACKS, packSize: 12, packUnit: 'pcs', costPrice: 420, sellingPrice: 500, mrp: 540, gstRate: 12, currentStock: 6, tags: ['CLINIC'] },
      { sku: 'EQP-WOOD-LAMP', name: 'Wood’s Lamp (Dermatology)', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Diagnostics', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 2200, sellingPrice: 2600, mrp: 2800, gstRate: 18, currentStock: 2, tags: ['INSTRUMENT','DIAGNOSTIC'] },
      { sku: 'EQP-DERMASCOPE', name: 'Dermatoscope (Handheld)', type: InventoryItemType.EQUIPMENT, category: 'Instruments', subCategory: 'Diagnostics', unit: UnitType.PIECES, packSize: 1, packUnit: 'pc', costPrice: 8500, sellingPrice: 9800, mrp: 10500, gstRate: 18, currentStock: 1, tags: ['INSTRUMENT','DIAGNOSTIC'] },
    ];

    // Inventory: seed only if inventory is empty (non-destructive)
    const invCount = await prisma.inventoryItem.count();
    let createdInventory = 0;
    if (invCount === 0) {
      for (const item of inventoryItems) {
        await prisma.inventoryItem.create({
          data: {
            branchId: branch.id,
            sku: item.sku,
            name: item.name,
            description: null,
            genericName: item.genericName || null,
            brandName: item.brandName || null,
            type: item.type,
            category: item.category || null,
            subCategory: item.subCategory || null,
            manufacturer: item.manufacturer || null,
            supplier: null,
            barcode: null,
            costPrice: item.costPrice,
            sellingPrice: item.sellingPrice,
            mrp: item.mrp || null,
            unit: item.unit,
            packSize: item.packSize || null,
            packUnit: item.packUnit || null,
            currentStock: item.currentStock,
            minStockLevel: 5,
            maxStockLevel: 500,
            reorderLevel: 10,
            reorderQuantity: 20,
            expiryDate: null,
            batchNumber: null,
            hsnCode: null,
            gstRate: item.gstRate || null,
            requiresPrescription: !!item.requiresPrescription,
            isControlled: false,
            storageLocation: item.storageLocation || null,
            storageConditions: null,
            tags: item.tags ? JSON.stringify(item.tags) : null,
            status: InventoryStatus.ACTIVE,
            stockStatus: item.currentStock > 0 ? StockStatus.IN_STOCK : StockStatus.OUT_OF_STOCK,
            metadata: null,
          },
        });
        createdInventory += 1;
      }
    }

    console.log('Seed complete (non-destructive):', {
      branch: branch.id,
      usersCreated: userCount === 0,
      roomCreated: roomCount === 0,
      patientCreated: patientCount === 0,
      inventorySeeded: invCount === 0 ? createdInventory : 0,
    });
  } finally {
    await (await import('@prisma/client')).Prisma.sql`SELECT 1`;
    await (await new PrismaClient()).$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}); 