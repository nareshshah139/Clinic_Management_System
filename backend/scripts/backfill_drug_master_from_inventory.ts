import { InventoryItemType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inferDosageForm(name: string, unit: string): string {
  const lowerName = name.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\bgel\b/, 'Gel'],
    [/\bcream\b/, 'Cream'],
    [/\bointment\b/, 'Ointment'],
    [/\btablet|tab\b/, 'Tablet'],
    [/\bcapsule|cap\b/, 'Capsule'],
    [/\bshampoo\b/, 'Shampoo'],
    [/\bsolution\b/, 'Solution'],
    [/\blotion\b/, 'Lotion'],
    [/\bserum\b/, 'Serum'],
    [/\binjection|vial\b/, 'Injection'],
    [/\bsoap\b/, 'Soap'],
    [/\bsunscreen\b/, 'Sunscreen'],
  ];

  for (const [pattern, form] of rules) {
    if (pattern.test(lowerName)) return form;
  }

  return unit
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferStrength(name: string): string | null {
  const match = name.match(
    /\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|%)\b(?:\s?\+\s?\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|%)\b)*/i,
  );
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function packSizeLabel(item: { packSize: number | null; packUnit: string | null; unit: string }) {
  if (item.packSize && item.packUnit) return `${item.packSize} ${item.packUnit}`;
  if (item.packSize) return `${item.packSize} ${item.unit.toLowerCase()}`;
  return item.unit.toLowerCase();
}

async function main() {
  const medicineItems = await prisma.inventoryItem.findMany({
    where: {
      type: InventoryItemType.MEDICINE,
      status: { not: 'DISCONTINUED' },
    },
    include: { drugs: true },
    orderBy: { name: 'asc' },
  });

  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const item of medicineItems) {
    const manufacturerName =
      cleanText(item.manufacturer) ||
      cleanText(item.supplier) ||
      cleanText(item.brandName) ||
      'Unknown';
    const composition1 = cleanText(item.genericName) || cleanText(item.brandName) || item.name;
    const strength = inferStrength(item.name);
    const dosageForm = inferDosageForm(item.name, item.unit);

    const existing =
      (item.sku
        ? await prisma.drug.findFirst({
            where: { sku: item.sku },
            include: { inventoryItems: { select: { id: true } } },
          })
        : null) ||
      (item.barcode
        ? await prisma.drug.findFirst({
            where: { barcode: item.barcode },
            include: { inventoryItems: { select: { id: true } } },
          })
        : null) ||
      (await prisma.drug.findFirst({
        where: {
          branchId: item.branchId,
          name: { equals: item.name, mode: 'insensitive' },
          manufacturerName: { equals: manufacturerName, mode: 'insensitive' },
        },
        include: { inventoryItems: { select: { id: true } } },
      }));

    const data = {
      name: item.name,
      price: item.sellingPrice,
      manufacturerName,
      type: 'allopathy',
      packSizeLabel: packSizeLabel(item),
      composition1,
      category: cleanText(item.category),
      description: cleanText(item.description),
      dosageForm,
      strength,
      minStockLevel: item.minStockLevel ?? 10,
      maxStockLevel: item.maxStockLevel ?? 1000,
      isActive: true,
      isDiscontinued: false,
      branchId: item.branchId,
    };

    if (existing) {
      const alreadyLinked = existing.inventoryItems.some((link) => link.id === item.id);
      await prisma.drug.update({
        where: { id: existing.id },
        data: {
          ...data,
          inventoryItems: alreadyLinked ? undefined : { connect: { id: item.id } },
        },
      });
      updated += 1;
      if (!alreadyLinked) linked += 1;
      continue;
    }

    await prisma.drug.create({
      data: {
        ...data,
        sku: cleanText(item.sku),
        barcode: cleanText(item.barcode),
        inventoryItems: { connect: { id: item.id } },
      },
    });
    created += 1;
    linked += 1;
  }

  console.log(
    `Drug master backfill complete. Inventory medicines: ${medicineItems.length}; created: ${created}; updated: ${updated}; linked: ${linked}.`,
  );
}

main()
  .catch((error) => {
    console.error('Drug master backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
