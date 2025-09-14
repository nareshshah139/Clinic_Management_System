/*
  Ingest curated dermatology drugs for India into the Drug table.
  Usage (from backend/):
    npx ts-node --compiler-options '{"module":"commonjs"}' scripts/import_derm_drugs.ts
*/

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Minimal curated set of common dermatology drugs/products in India
// Fields: name (brand/trade), genericName, strength, form, route, manufacturer, composition, brandNames[], isGeneric
const DERM_DRUGS: Array<Record<string, any>> = [
  // Acne topical retinoids / antibiotics
  { name: 'Adapalene', genericName: 'Adapalene', strength: '0.1%', form: 'Gel', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Adaferin', 'Deriva'], composition: 'Adapalene 0.1% w/w' },
  { name: 'Tretinoin', genericName: 'Tretinoin', strength: '0.025%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Retino-A 0.025%'], composition: 'Tretinoin 0.025% w/w' },
  { name: 'Tretinoin', genericName: 'Tretinoin', strength: '0.05%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Retino-A 0.05%'], composition: 'Tretinoin 0.05% w/w' },
  { name: 'Clindamycin', genericName: 'Clindamycin', strength: '1%', form: 'Gel', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Clindac-A'], composition: 'Clindamycin Phosphate eq. to Clindamycin 1% w/w' },
  { name: 'Benzoyl Peroxide', genericName: 'Benzoyl Peroxide', strength: '2.5%', form: 'Gel', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Benzac AC 2.5%'], composition: 'Benzoyl Peroxide 2.5% w/w' },
  { name: 'Benzoyl Peroxide', genericName: 'Benzoyl Peroxide', strength: '5%', form: 'Gel', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Benzac AC 5%'], composition: 'Benzoyl Peroxide 5% w/w' },
  { name: 'Clindamycin + Nicotinamide', genericName: 'Clindamycin + Nicotinamide', strength: '1% + 4%', form: 'Gel', route: 'Topical', manufacturer: 'Generic', brandNames: ['Clindac-A Plus'], composition: 'Clindamycin 1% + Nicotinamide 4% w/w' },
  { name: 'Azelaic Acid', genericName: 'Azelaic Acid', strength: '10%', form: 'Gel', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Aziderm 10%'], composition: 'Azelaic Acid 10% w/w' },
  { name: 'Azelaic Acid', genericName: 'Azelaic Acid', strength: '20%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Aziderm 20%'], composition: 'Azelaic Acid 20% w/w' },

  // Oral antibiotics & retinoids for acne
  { name: 'Doxycycline', genericName: 'Doxycycline', strength: '100 mg', form: 'Capsule', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Doxicip 100'], composition: 'Doxycycline 100 mg' },
  { name: 'Minocycline', genericName: 'Minocycline', strength: '50 mg', form: 'Tablet', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Minoz 50'], composition: 'Minocycline 50 mg' },
  { name: 'Isotretinoin', genericName: 'Isotretinoin', strength: '10 mg', form: 'Softgel Capsule', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Isotroin 10'], composition: 'Isotretinoin 10 mg' },
  { name: 'Isotretinoin', genericName: 'Isotretinoin', strength: '20 mg', form: 'Softgel Capsule', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Isotroin 20'], composition: 'Isotretinoin 20 mg' },

  // Antifungals
  { name: 'Ketoconazole', genericName: 'Ketoconazole', strength: '2%', form: 'Shampoo', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Nizral 2%'], composition: 'Ketoconazole 2% w/v' },
  { name: 'Clotrimazole', genericName: 'Clotrimazole', strength: '1%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Candid 1%'], composition: 'Clotrimazole 1% w/w' },
  { name: 'Terbinafine', genericName: 'Terbinafine', strength: '1%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Sebifin 1%'], composition: 'Terbinafine Hydrochloride 1% w/w' },
  { name: 'Itraconazole', genericName: 'Itraconazole', strength: '100 mg', form: 'Capsule', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Canditral 100'], composition: 'Itraconazole 100 mg' },
  { name: 'Itraconazole', genericName: 'Itraconazole', strength: '200 mg', form: 'Capsule', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Canditral 200'], composition: 'Itraconazole 200 mg' },

  // Topical steroids & calcineurin inhibitors (use with caution)
  { name: 'Mometasone Furoate', genericName: 'Mometasone Furoate', strength: '0.1%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Elocon (brand ref)'], composition: 'Mometasone Furoate 0.1% w/w' },
  { name: 'Betamethasone Valerate', genericName: 'Betamethasone Valerate', strength: '0.1%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Betnovate (brand ref)'], composition: 'Betamethasone Valerate 0.1% w/w' },
  { name: 'Tacrolimus', genericName: 'Tacrolimus', strength: '0.03%', form: 'Ointment', route: 'Topical', manufacturer: 'Generic', brandNames: ['Protopic 0.03% (ref)'], composition: 'Tacrolimus 0.03% w/w' },
  { name: 'Tacrolimus', genericName: 'Tacrolimus', strength: '0.1%', form: 'Ointment', route: 'Topical', manufacturer: 'Generic', brandNames: ['Protopic 0.1% (ref)'], composition: 'Tacrolimus 0.1% w/w' },
  { name: 'Pimecrolimus', genericName: 'Pimecrolimus', strength: '1%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Elidel (ref)'], composition: 'Pimecrolimus 1% w/w' },

  // Antibiotic topicals
  { name: 'Mupirocin', genericName: 'Mupirocin', strength: '2%', form: 'Ointment', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Bactroban (ref)'], composition: 'Mupirocin 2% w/w' },
  { name: 'Fusidic Acid', genericName: 'Fusidic Acid', strength: '2%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Fucidin (ref)'], composition: 'Fusidic Acid 2% w/w' },

  // Hair & scalp
  { name: 'Minoxidil', genericName: 'Minoxidil', strength: '2%', form: 'Solution', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Mintop 2%'], composition: 'Minoxidil 2% w/v' },
  { name: 'Minoxidil', genericName: 'Minoxidil', strength: '5%', form: 'Solution', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Mintop 5%'], composition: 'Minoxidil 5% w/v' },
  { name: 'Finasteride', genericName: 'Finasteride', strength: '1 mg', form: 'Tablet', route: 'Oral', manufacturer: 'Generic', isGeneric: true, brandNames: ['Finax 1 mg'], composition: 'Finasteride 1 mg' },

  // Pigmentation & keratolytics
  { name: 'Hydroquinone', genericName: 'Hydroquinone', strength: '4%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Melalite Forte'], composition: 'Hydroquinone 4% w/w' },
  { name: 'Salicylic Acid', genericName: 'Salicylic Acid', strength: '2%', form: 'Solution', route: 'Topical', manufacturer: 'Generic', isGeneric: true, brandNames: ['Saslic 2% (ref)'], composition: 'Salicylic Acid 2% w/v' },
  { name: 'Urea', genericName: 'Urea', strength: '10%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Elovera Urea (ref)'], composition: 'Urea 10% w/w' },
  { name: 'Urea', genericName: 'Urea', strength: '20%', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Elovera Urea (ref)'], composition: 'Urea 20% w/w' },

  // Emollients & sunscreen (representative entries)
  { name: 'Paraffin Emollient', genericName: 'White Soft Paraffin + Light Liquid Paraffin', strength: '—', form: 'Cream', route: 'Topical', manufacturer: 'Generic', brandNames: ['Emollient Cream'], composition: 'White soft paraffin + Light liquid paraffin' },
  { name: 'Sunscreen SPF 30', genericName: 'Sunscreen', strength: 'SPF 30', form: 'Lotion', route: 'Topical', manufacturer: 'Generic', brandNames: ['Suncros SPF 30 (ref)'], composition: 'UV filters (broad spectrum)' },
  { name: 'Sunscreen SPF 50', genericName: 'Sunscreen', strength: 'SPF 50', form: 'Gel', route: 'Topical', manufacturer: 'Generic', brandNames: ['Suncros SPF 50 (ref)'], composition: 'UV filters (broad spectrum)' },
];

async function main() {
  let upserts = 0;
  for (const d of DERM_DRUGS) {
    const name = String(d.name).trim();
    const strength = d.strength ? String(d.strength) : '';
    const form = d.form ? String(d.form) : '';

    await prisma.drug.upsert({
      where: {
        name_strength_form: {
          name,
          strength,
          form,
        } as any,
      },
      update: {
        genericName: d.genericName ?? null,
        route: d.route ?? null,
        manufacturer: d.manufacturer ?? null,
        composition: d.composition ?? null,
        brandNames: d.brandNames ? JSON.stringify(d.brandNames) : null,
        isGeneric: typeof d.isGeneric === 'boolean' ? d.isGeneric : false,
        rxRequired: typeof d.rxRequired === 'boolean' ? d.rxRequired : true,
      },
      create: {
        name,
        strength: strength || null,
        form: form || null,
        genericName: d.genericName ?? null,
        route: d.route ?? null,
        manufacturer: d.manufacturer ?? null,
        composition: d.composition ?? null,
        brandNames: d.brandNames ? JSON.stringify(d.brandNames) : null,
        isGeneric: typeof d.isGeneric === 'boolean' ? d.isGeneric : false,
        rxRequired: typeof d.rxRequired === 'boolean' ? d.rxRequired : true,
      },
    });
    upserts += 1;
  }
  console.log(`Dermatology drugs ingested: ${upserts}`);
}

main()
  .catch((e) => {
    console.error('Ingestion failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 