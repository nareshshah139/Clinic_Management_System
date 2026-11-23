import { PrismaClient } from '@prisma/client';

type Product = {
  brand: string;
  form: string;
  strength: string;
  compositions: string[];
  drug: 'linked' | 'unlinked' | 'inactive' | 'discontinued' | 'two' | 'elsewhere';
  aliases?: string[];
  packs?: [string, number, string][];
  batches: number;
};

const prefixes: Record<string, string> = {
  TABLET: 'Tab.', CAPSULE: 'Cap.', SYRUP: 'Syp.', CREAM: 'Cream', GEL: 'Gel', LOTION: 'Lotion', OINTMENT: 'Oint.', SOLUTION: 'Sol.',
};
const catalogForms: Record<string, string> = {
  TABLET: 'Tablet', CAPSULE: 'Capsule', SYRUP: 'Syrup', CREAM: 'Cream', GEL: 'Gel', LOTION: 'Lotion', OINTMENT: 'Ointment', SOLUTION: 'Solution',
};
const packFor: Record<string, [string, number, string]> = {
  TABLET: ['STRIPS', 10, 'tablets'], CAPSULE: ['STRIPS', 10, 'capsules'], SYRUP: ['BOTTLES', 100, 'ml'], CREAM: ['TUBES', 15, 'g'],
  GEL: ['TUBES', 20, 'g'], LOTION: ['BOTTLES', 60, 'ml'], OINTMENT: ['TUBES', 10, 'g'], SOLUTION: ['BOTTLES', 60, 'ml'],
};

const core: Product[] = [
  { brand: 'Dolo', form: 'TABLET', strength: '650 mg', compositions: ['Paracetamol 650mg'], drug: 'linked', batches: 9, aliases: ['DOLO-650 TAB'], packs: [['STRIPS', 15, 'tablets']] },
  { brand: 'Calpol', form: 'TABLET', strength: '500 mg', compositions: ['Paracetamol 500mg'], drug: 'linked', batches: 6 },
  { brand: 'Calpol', form: 'SYRUP', strength: '120 mg', compositions: ['Paracetamol 120mg/5ml'], drug: 'linked', batches: 3 },
  { brand: 'Crocin Advance', form: 'TABLET', strength: '500 mg', compositions: ['Paracetamol 500mg'], drug: 'unlinked', batches: 4 },
  { brand: 'Pacimol', form: 'TABLET', strength: '650 mg', compositions: ['Paracetamol 650mg'], drug: 'inactive', batches: 3 },
  { brand: 'Mox', form: 'CAPSULE', strength: '500 mg', compositions: ['Amoxicillin 500mg'], drug: 'linked', batches: 5 },
  { brand: 'Augmentin', form: 'TABLET', strength: '625 mg', compositions: ['Amoxicillin 500mg', 'Clavulanic Acid 125mg'], drug: 'linked', batches: 6 },
  { brand: 'Clavam', form: 'TABLET', strength: '625 mg', compositions: ['Amoxicillin 500mg', 'Clavulanic Acid 125mg'], drug: 'discontinued', batches: 4 },
  { brand: 'Azithral', form: 'TABLET', strength: '500 mg', compositions: ['Azithromycin 500mg'], drug: 'linked', batches: 7 },
  { brand: 'Azee', form: 'TABLET', strength: '250 mg', compositions: ['Azithromycin 250mg'], drug: 'linked', batches: 4 },
  { brand: 'Cetzine', form: 'TABLET', strength: '10 mg', compositions: ['Cetirizine 10mg'], drug: 'linked', batches: 5 },
  { brand: 'Levocet', form: 'TABLET', strength: '5 mg', compositions: ['Levocetirizine 5mg'], drug: 'linked', batches: 4 },
  { brand: 'Pan', form: 'TABLET', strength: '40 mg', compositions: ['Pantoprazole 40mg'], drug: 'linked', batches: 6 },
  { brand: 'Pan D', form: 'CAPSULE', strength: '', compositions: ['Pantoprazole 40mg', 'Domperidone 30mg'], drug: 'linked', batches: 5 },
  { brand: 'Pantocid', form: 'TABLET', strength: '40 mg', compositions: ['Pantoprazole 40mg'], drug: 'two', batches: 3 },
  { brand: 'Glycomet', form: 'TABLET', strength: '500 mg', compositions: ['Metformin 500mg'], drug: 'linked', batches: 5 },
  { brand: 'Glycomet SR', form: 'TABLET', strength: '1000 mg', compositions: ['Metformin 1000mg'], drug: 'linked', batches: 4 },
  { brand: 'Amaryl', form: 'TABLET', strength: '2 mg', compositions: ['Glimepiride 2mg'], drug: 'linked', batches: 4 },
  { brand: 'Atorva', form: 'TABLET', strength: '10 mg', compositions: ['Atorvastatin 10mg'], drug: 'linked', batches: 4 },
  { brand: 'Amlong', form: 'TABLET', strength: '5 mg', compositions: ['Amlodipine 5mg'], drug: 'linked', batches: 4 },
  { brand: 'Telma', form: 'TABLET', strength: '40 mg', compositions: ['Telmisartan 40mg'], drug: 'linked', batches: 5 },
  { brand: 'Brufen', form: 'TABLET', strength: '400 mg', compositions: ['Ibuprofen 400mg'], drug: 'linked', batches: 4 },
  { brand: 'Voveran', form: 'GEL', strength: '1%', compositions: ['Diclofenac 1%'], drug: 'linked', batches: 3 },
  { brand: 'Montair', form: 'TABLET', strength: '10 mg', compositions: ['Montelukast 10mg'], drug: 'linked', batches: 4 },
  { brand: 'Allegra', form: 'TABLET', strength: '120 mg', compositions: ['Fexofenadine 120mg'], drug: 'linked', batches: 4 },
  { brand: 'Sotret', form: 'CAPSULE', strength: '10 mg', compositions: ['Isotretinoin 10mg'], drug: 'linked', batches: 5 },
  { brand: 'Sotret', form: 'CAPSULE', strength: '20 mg', compositions: ['Isotretinoin 20mg'], drug: 'linked', batches: 5 },
  { brand: 'Flutas', form: 'TABLET', strength: '150 mg', compositions: ['Fluconazole 150mg'], drug: 'linked', batches: 6, aliases: ['13 74 | Flutas 150Mg(Pc)'] },
  { brand: 'Itin', form: 'CAPSULE', strength: '100 mg', compositions: ['Itraconazole 100mg'], drug: 'linked', batches: 5 },
  { brand: 'Tenovate', form: 'CREAM', strength: '0.05%', compositions: ['Clobetasol 0.05%'], drug: 'linked', batches: 4 },
  { brand: 'Momate', form: 'CREAM', strength: '0.1%', compositions: ['Mometasone 0.1%'], drug: 'linked', batches: 4 },
  { brand: 'T-Bact', form: 'OINTMENT', strength: '2%', compositions: ['Mupirocin 2%'], drug: 'linked', batches: 3 },
  { brand: 'Mintop', form: 'SOLUTION', strength: '5%', compositions: ['Minoxidil 5%'], drug: 'linked', batches: 3 },
  { brand: 'Clindac A', form: 'GEL', strength: '1%', compositions: ['Clindamycin 1%'], drug: 'linked', batches: 3, aliases: ['Clindac-A Gel 20gm'] },
  { brand: 'Uprise D3', form: 'CAPSULE', strength: '60000 IU', compositions: ['Cholecalciferol 60000IU'], drug: 'linked', batches: 3 },
  { brand: 'Saslic', form: 'LOTION', strength: '2%', compositions: ['Salicylic Acid 2%'], drug: 'unlinked', batches: 3 },
  { brand: 'Oldcin', form: 'TABLET', strength: '250 mg', compositions: ['Oldcinamide 250mg'], drug: 'linked', batches: 0 },
  { brand: 'Elsewhere', form: 'TABLET', strength: '5 mg', compositions: ['Elsewherin 5mg'], drug: 'elsewhere', batches: 0 },
];

const syllables = ['ra', 'zo', 'vi', 'len', 'tor', 'mex', 'cal', 'dex', 'fen', 'lo', 'nix', 'sta', 'pri', 'cor', 'vel', 'bi', 'tan', 'zol', 'mol', 'gen', 'cip', 'ter', 'ola', 'rin'];
const molecules = ['Paracetamol', 'Amoxicillin', 'Azithromycin', 'Cetirizine', 'Levocetirizine', 'Pantoprazole', 'Domperidone', 'Metformin', 'Glimepiride', 'Atorvastatin',
  'Amlodipine', 'Telmisartan', 'Losartan', 'Ibuprofen', 'Diclofenac', 'Aceclofenac', 'Montelukast', 'Fexofenadine', 'Ondansetron', 'Omeprazole', 'Rabeprazole',
  'Isotretinoin', 'Fluconazole', 'Itraconazole', 'Terbinafine', 'Clobetasol', 'Mometasone', 'Mupirocin', 'Ketoconazole', 'Minoxidil', 'Adapalene', 'Clindamycin',
  'Doxycycline', 'Cefixime', 'Ofloxacin', 'Ciprofloxacin', 'Methylcobalamin', 'Folic Acid', 'Prednisolone', 'Hydroxyzine', 'Tacrolimus', 'Permethrin', 'Tretinoin'];
const forms = ['TABLET', 'TABLET', 'TABLET', 'CAPSULE', 'CAPSULE', 'SYRUP', 'CREAM', 'GEL', 'LOTION', 'OINTMENT'];
const strengths: Record<string, string[]> = {
  TABLET: ['5 mg', '10 mg', '20 mg', '40 mg', '250 mg', '500 mg', '650 mg'], CAPSULE: ['10 mg', '20 mg', '100 mg', '500 mg'], SYRUP: ['100 mg', '125 mg'],
  CREAM: ['0.05%', '0.1%', '1%', '2%'], GEL: ['0.1%', '1%', '2.5%'], LOTION: ['1%', '2%'], OINTMENT: ['2%', '0.1%'], SOLUTION: ['5%'],
};

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A pharmacy branch shaped like production stock: core products with several batches each, generated look-alike brands,
 * products linked to inactive, discontinued, two or no catalogue drugs, reviewed aliases, inactive and expired batches,
 * codes on some batches, and another branch carrying the same products.
 */
/**
 * @cc [owner:nareshshah139,label:testing] clinic-inventory-fixture-deterministic
 * The same seed and product count MUST create the same rows, IDs and links, so recorded search
 * results stay comparable across runs.
 */
export async function seedClinicInventory(db: PrismaClient, { fillerProducts, seed = 7 }: { fillerProducts: number; seed?: number }) {
  const next = random(seed);
  const pick = <T>(values: T[]) => values[Math.floor(next() * values.length)];
  const cuid = () => 'c' + Array.from({ length: 24 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(next() * 36)]).join('');
  const products: Product[] = [...core];
  const brands = new Set(core.map((p) => p.brand.toLowerCase()));
  while (products.length < core.length + fillerProducts) {
    const brand = Array.from({ length: 2 + Math.floor(next() * 2) }, () => pick(syllables)).join('');
    if (brands.has(brand)) continue;
    brands.add(brand);
    const form = pick(forms);
    const compositions = [`${pick(molecules)} ${pick(strengths[form]).replace(' ', '')}`];
    if (next() < 0.15) compositions.push(`${pick(molecules)} ${pick(strengths[form]).replace(' ', '')}`);
    const roll = next();
    products.push({
      brand: brand[0].toUpperCase() + brand.slice(1),
      form,
      strength: compositions.length > 1 ? '' : pick(strengths[form]),
      compositions,
      drug: roll < 0.82 ? 'linked' : roll < 0.9 ? 'unlinked' : roll < 0.94 ? 'inactive' : roll < 0.97 ? 'discontinued' : 'two',
      aliases: next() < 0.1 ? [`${Math.floor(next() * 90 + 10)} ${Math.floor(next() * 90 + 10)} | ${brand.toUpperCase()} ${pick(strengths[form]).replace(' ', '')}`] : undefined,
      packs: next() < 0.08 ? [[packFor[form][0], packFor[form][1] * 2, packFor[form][2]]] : undefined,
      batches: 1 + Math.floor(next() * 8),
    });
  }

  await db.branch.createMany({ data: [{ id: 'clinic', name: 'Skin clinic', address: 'Synthetic' }, { id: 'other', name: 'Other clinic', address: 'Synthetic' }] });
  const drugs: any[] = [];
  const items: any[] = [];
  const links: [string, string][] = [];
  let barcode = 8901234500000;
  let sku = 40000;
  for (const product of products) {
    const catalogName = [product.brand, product.strength.replace(' ', ''), catalogForms[product.form]].filter(Boolean).join(' ');
    const drug = (branchId: string, extra: object = {}) => {
      const row = {
        id: cuid(), branchId, name: catalogName, price: 20 + Math.floor(next() * 200), manufacturerName: pick(['Sun Pharma', 'Cipla', 'Mankind', 'Alkem', 'Micro Labs']),
        packSizeLabel: `${packFor[product.form][1]} ${packFor[product.form][2]}`, composition1: product.compositions[0], composition2: product.compositions[1] ?? null,
        dosageForm: catalogForms[product.form], strength: product.strength || null, ...extra,
      };
      drugs.push(row);
      return row.id;
    };
    const linked =
      product.drug === 'linked' ? [drug('clinic')]
        : product.drug === 'inactive' ? [drug('clinic', { isActive: false })]
          : product.drug === 'discontinued' ? [drug('clinic', { isDiscontinued: true })]
            : product.drug === 'two' ? [drug('clinic'), drug('clinic', { name: `${catalogName} (old code)` })]
              : product.drug === 'elsewhere' ? [drug('other')]
                : [];
    const name = [prefixes[product.form], product.brand, product.strength].filter(Boolean).join(' ');
    const batch = (branchId: string, index: number, overrides: object = {}) => {
      const [unit, packSize, packUnit] = product.packs && index % 3 === 2 ? product.packs[0] : packFor[product.form];
      const status = next() < 0.12 ? 'INACTIVE' : next() < 0.03 ? 'DISCONTINUED' : 'ACTIVE';
      const id = cuid();
      items.push({
        id, branchId, name, type: 'MEDICINE', form: product.form, strength: product.strength || null, costPrice: 10, sellingPrice: 10 + Math.floor(next() * 300),
        unit, packSize, packUnit, currentStock: Math.floor(next() * 60), heldStock: next() < 0.1 ? 2 : 0,
        expiryDate: new Date(next() < 0.1 ? '2025-06-30' : `203${Math.floor(next() * 4)}-0${1 + Math.floor(next() * 9)}-28`),
        status, batchNumber: `B${Math.floor(next() * 1e6)}`,
        genericName: next() < 0.5 ? product.compositions.join(' + ') : null,
        brandName: next() < 0.3 ? product.brand : null,
        manufacturer: next() < 0.5 ? pick(['Sun Pharma', 'Cipla', 'Mankind']) : null,
        barcode: next() < 0.2 ? String(barcode++) : null,
        sku: next() < 0.1 ? `SKU-${sku++}` : null,
        itemCode: next() < 0.15 ? String(1000 + Math.floor(next() * 9000)) : null,
        metadata: product.aliases && index % 2 === 0 ? JSON.stringify({ nameNormalization: { version: 1, aliases: product.aliases } }) : null,
        ...overrides,
      });
      if (branchId === 'clinic') for (const drugId of linked) links.push([drugId, id]);
      return id;
    };
    for (let i = 0; i < product.batches; i++) batch('clinic', i);
    if (product.brand === 'Oldcin') batch('clinic', 0, { status: 'INACTIVE' });
    if (product.brand === 'Elsewhere' || next() < 0.3) {
      const id = batch('other', 0, { status: 'ACTIVE' });
      links.push([drug('other'), id]);
    }
  }
  for (let i = 0; i < drugs.length; i += 5000) await db.drug.createMany({ data: drugs.slice(i, i + 5000) });
  for (let i = 0; i < items.length; i += 5000) await db.inventoryItem.createMany({ data: items.slice(i, i + 5000) });
  for (let i = 0; i < links.length; i += 5000) {
    const chunk = links.slice(i, i + 5000);
    await db.$executeRawUnsafe(
      `INSERT INTO "_DrugToInventoryItem" ("A", "B") SELECT * FROM unnest($1::text[], $2::text[])`,
      chunk.map(([a]) => a),
      chunk.map(([, b]) => b),
    );
  }
  return { batches: items.filter((item) => item.branchId === 'clinic').length, active: items.filter((item) => item.branchId === 'clinic' && item.status === 'ACTIVE').length };
}
