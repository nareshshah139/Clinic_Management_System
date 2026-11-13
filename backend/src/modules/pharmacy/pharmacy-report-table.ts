import * as XLSX from 'xlsx';
import { money } from './gst-slabs';

/**
 * One shape for every Pharmacy Report: the screen, the Excel workbook, the CSV and the PDF are all
 * drawn from the same sections, so a downloaded file always carries the figures the screen showed.
 */
export type CellValue = string | number | null;
export type ColumnKind = 'text' | 'money' | 'number' | 'percent' | 'date';

export type ReportColumn = {
  key: string;
  label: string;
  kind: ColumnKind;
  /** Columns sharing a group sit under one merged heading (a GST slab band). */
  group?: string;
  /** Identifying columns stay on screen while the money columns scroll. */
  frozen?: boolean;
  /** Money and number columns are summed into the totals row unless this is false. */
  total?: boolean;
  help?: string;
};

export type ReportRow = {
  key: string;
  cells: Record<string, CellValue>;
  tone?: 'muted' | 'warning';
};

export type ReportSection = {
  id: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Directly under the header, as the clinic's reference reports place it. Null for sections without totals. */
  totals: Record<string, CellValue> | null;
  emptyText?: string;
};

export type ReportTile = {
  label: string;
  value: CellValue;
  kind: ColumnKind;
  help?: string;
  tone?: 'good' | 'warning' | 'bad';
};

export type PharmacyReport = {
  id: string;
  title: string;
  period: { startDate: string; endDate: string; timeZone: string };
  headline: { label: string; value: number } | null;
  tiles: ReportTile[];
  sections: ReportSection[];
  notes: string[];
  scope: { statuses: string[]; draftsExcluded: boolean; dateBasis: string };
  search: string | null;
  filterChoices?: { doctor: string[] };
};

export const summable = (column: ReportColumn) =>
  (column.kind === 'money' || column.kind === 'number') &&
  column.total !== false;

/** Totals are always derived from the rows, so the totals row can never disagree with the rows above it. */
export function columnTotals(
  columns: ReportColumn[],
  rows: ReportRow[],
  label = 'Total',
): Record<string, CellValue> {
  const totals: Record<string, CellValue> = {};
  const firstText = columns.find((column) => !summable(column));
  for (const column of columns) {
    if (summable(column)) {
      totals[column.key] = money(
        rows.reduce((sum, row) => sum + Number(row.cells[column.key] ?? 0), 0),
      );
    } else {
      totals[column.key] = column === firstText ? label : null;
    }
  }
  return totals;
}

export function section(
  input: Omit<ReportSection, 'totals'> & {
    totals?: Record<string, CellValue> | null;
    totalsLabel?: string;
  },
): ReportSection {
  const { totalsLabel, ...rest } = input;
  return {
    ...rest,
    totals:
      input.totals === undefined
        ? columnTotals(input.columns, input.rows, totalsLabel)
        : input.totals,
  };
}

const headerLabel = (column: ReportColumn) =>
  column.group ? `${column.group} ${column.label}` : column.label;

function textOf(value: CellValue, kind: ColumnKind): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && (kind === 'money' || kind === 'percent'))
    return value.toFixed(2);
  return String(value);
}

/** Quotes when needed, and defuses a leading = + - @ in text so a spreadsheet cannot run it as a formula. */
export function csvField(text: string) {
  const safe =
    /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) || safe !== text
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

/** Header, then the totals row, then the rows, in the screen's column order. Multi-section reports are separated by their titles. */
export function reportCsv(report: PharmacyReport): string {
  const lines: string[] = [];
  const many = report.sections.length > 1;
  report.sections.forEach((sec, index) => {
    if (many) {
      if (index) lines.push('');
      lines.push(csvField(sec.title));
    }
    lines.push(
      sec.columns.map((column) => csvField(headerLabel(column))).join(','),
    );
    const body = [
      ...(sec.totals ? [sec.totals] : []),
      ...sec.rows.map((row) => row.cells),
    ];
    for (const cells of body)
      lines.push(
        sec.columns
          .map((column) => csvField(textOf(cells[column.key], column.kind)))
          .join(','),
      );
  });
  // A byte-order mark so Excel opens the file as UTF-8 (rupee signs, accented names).
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

/** Indian digit grouping (1,59,656.74), which Excel cannot express with a plain #,##0 pattern. */
export const INDIAN_MONEY_FORMAT =
  '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';

function sheetName(title: string, used: Set<string>) {
  const base =
    title
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 28) || 'Report';
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 26)} ${n}`;
  used.add(name);
  return name;
}

function moneyCell(value: number): XLSX.CellObject {
  // Negative amounts (returns) cannot use the conditional Indian pattern, so they fall back to plain grouping.
  return { t: 'n', v: value, z: value < 0 ? '#,##0.00' : INDIAN_MONEY_FORMAT };
}

function excelCell(value: CellValue, kind: ColumnKind): XLSX.CellObject {
  if (value === null || value === undefined || value === '')
    return { t: 's', v: '' };
  if (typeof value === 'number') {
    if (kind === 'money') return moneyCell(value);
    if (kind === 'percent') return { t: 'n', v: value, z: '0.00' };
    return { t: 'n', v: value };
  }
  return { t: 's', v: value };
}

/** One sheet per section: title and period, merged group headings, column headings, totals, then the rows. */
export function reportWorkbook(
  report: PharmacyReport,
  clinicName: string,
): Buffer {
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sec of report.sections) {
    const aoa: XLSX.CellObject[][] = [];
    const merges: XLSX.Range[] = [];
    const width = sec.columns.length;
    const title =
      report.sections.length > 1
        ? `${report.title} — ${sec.title}`
        : report.title;
    aoa.push([{ t: 's', v: title }]);
    aoa.push([
      {
        t: 's',
        v: `${clinicName} · ${report.period.startDate} to ${report.period.endDate} · Amounts in INR`,
      },
    ]);
    const grouped = sec.columns.some((column) => column.group);
    if (grouped) {
      const row: XLSX.CellObject[] = sec.columns.map(() => ({ t: 's', v: '' }));
      let start = 0;
      while (start < width) {
        const group = sec.columns[start].group;
        let end = start;
        while (end + 1 < width && group && sec.columns[end + 1].group === group)
          end++;
        if (group) {
          row[start] = { t: 's', v: group };
          if (end > start)
            merges.push({
              s: { r: aoa.length, c: start },
              e: { r: aoa.length, c: end },
            });
        }
        start = end + 1;
      }
      aoa.push(row);
    }
    aoa.push(
      sec.columns.map((column) => ({
        t: 's',
        v: grouped && column.group ? column.label : headerLabel(column),
      })),
    );
    if (sec.totals)
      aoa.push(
        sec.columns.map((column) =>
          excelCell(sec.totals![column.key], column.kind),
        ),
      );
    for (const row of sec.rows)
      aoa.push(
        sec.columns.map((column) =>
          excelCell(row.cells[column.key], column.kind),
        ),
      );
    if (!sec.rows.length && sec.emptyText)
      aoa.push([{ t: 's', v: sec.emptyText }]);
    const sheet = XLSX.utils.aoa_to_sheet(aoa as unknown as unknown[][]);
    // aoa_to_sheet copies CellObjects through, including their number formats.
    sheet['!merges'] = merges;
    sheet['!cols'] = sec.columns.map((column) => ({
      wch: Math.min(
        40,
        Math.max(
          headerLabel(column).length + 2,
          column.kind === 'money' ? 14 : 10,
        ),
      ),
    }));
    XLSX.utils.book_append_sheet(book, sheet, sheetName(sec.title, used));
  }
  if (!report.sections.length)
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([[report.title], ['No data']]),
      'Report',
    );
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const indian = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export function displayCell(value: CellValue, kind: ColumnKind): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (kind === 'money') return indian.format(value);
    if (kind === 'percent') return value.toFixed(2);
    return plain.format(value);
  }
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split('-').reverse().join('/');
  return value;
}

type PdfDoc = any;

/**
 * PDF for the accountant's file. Wide sections (the GST slab bands) are split into column pages that
 * repeat the frozen identifying columns, so every figure stays readable against its bill.
 */
export async function reportPdf(
  report: PharmacyReport,
  clinicName: string,
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFDocument = require('pdfkit');
  const doc: PdfDoc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 32,
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const FONT = 8.5;
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 14;

  doc.font('Helvetica-Bold').fontSize(14).text(report.title);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#333')
    .text(
      `${clinicName} · ${displayCell(report.period.startDate, 'date')} to ${displayCell(report.period.endDate, 'date')} · Amounts in INR`,
    );
  if (report.headline)
    doc.text(
      `${report.headline.label}: ${displayCell(report.headline.value, 'money')}`,
    );
  for (const tile of report.tiles)
    doc.text(`${tile.label}: ${displayCell(tile.value, tile.kind)}`);
  doc.fillColor('#000').moveDown(0.5);

  for (const sec of report.sections) {
    const widthOf = (column: ReportColumn) => {
      const values = [
        headerLabel(column),
        ...sec.rows
          .slice(0, 200)
          .map((row) => displayCell(row.cells[column.key], column.kind)),
        displayCell(sec.totals?.[column.key] ?? null, column.kind),
      ];
      doc.font('Helvetica').fontSize(FONT);
      const longest = Math.max(
        ...values.map((value) => doc.widthOfString(String(value))),
      );
      return Math.min(
        column.kind === 'text' ? 150 : 90,
        Math.max(34, longest + 8),
      );
    };
    const widths = new Map(
      sec.columns.map((column) => [column.key, widthOf(column)]),
    );
    const frozen = sec.columns.filter((column) => column.frozen);
    const free = sec.columns.filter((column) => !column.frozen);
    const frozenWidth = frozen.reduce(
      (sum, column) => sum + widths.get(column.key)!,
      0,
    );
    const pages: ReportColumn[][] = [];
    let current: ReportColumn[] = [];
    let used = frozenWidth;
    // A GST band (Base, SGST, CGST, IGST) is never split across column pages.
    const units: ReportColumn[][] = [];
    for (const column of free) {
      const last = units[units.length - 1];
      if (last && column.group && last[0].group === column.group)
        last.push(column);
      else units.push([column]);
    }
    for (const unit of units) {
      const width = unit.reduce(
        (sum, column) => sum + widths.get(column.key)!,
        0,
      );
      if (current.length && used + width > pageWidth) {
        pages.push(current);
        current = [];
        used = frozenWidth;
      }
      current.push(...unit);
      used += width;
    }
    pages.push(current);

    pages.forEach((pageColumns, pageIndex) => {
      const columns = [...frozen, ...pageColumns];
      const tableWidth = columns.reduce(
        (sum, column) => sum + widths.get(column.key)!,
        0,
      );
      const scale = tableWidth > pageWidth ? pageWidth / tableWidth : 1;
      const cellWidth = (column: ReportColumn) =>
        widths.get(column.key)! * scale;
      if (doc.y > bottom() - 60) doc.addPage();
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .text(
          `${sec.title}${pages.length > 1 ? ` (columns ${pageIndex + 1} of ${pages.length})` : ''}`,
          doc.page.margins.left,
        );
      doc.moveDown(0.2);
      const drawRow = (
        cells: (column: ReportColumn) => string,
        bold: boolean,
        shade?: string,
      ) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT);
        const height =
          Math.max(
            ...columns.map((column) =>
              doc.heightOfString(cells(column) || ' ', {
                width: cellWidth(column) - 4,
              }),
            ),
          ) + 4;
        if (doc.y + height > bottom()) {
          doc.addPage();
          drawHeader();
        }
        const top = doc.y;
        let x = doc.page.margins.left;
        if (shade)
          doc
            .save()
            .rect(
              x,
              top,
              columns.reduce((sum, column) => sum + cellWidth(column), 0),
              height,
            )
            .fill(shade)
            .restore();
        for (const column of columns) {
          doc.fillColor('#000').text(cells(column), x + 2, top + 2, {
            width: cellWidth(column) - 4,
            align:
              column.kind === 'text' || column.kind === 'date'
                ? 'left'
                : 'right',
          });
          x += cellWidth(column);
        }
        doc.y = top + height;
        doc
          .save()
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(x, doc.y)
          .lineWidth(0.3)
          .stroke('#bbb')
          .restore();
      };
      const drawHeader = () => {
        if (columns.some((column) => column.group)) {
          // One centred label over each run of columns in the same band, with a rule under it.
          doc.font('Helvetica-Bold').fontSize(FONT);
          const height = doc.currentLineHeight() + 4;
          if (doc.y + height > bottom()) doc.addPage();
          const top = doc.y;
          const full = columns.reduce(
            (sum, column) => sum + cellWidth(column),
            0,
          );
          doc
            .save()
            .rect(doc.page.margins.left, top, full, height)
            .fill('#eeeeee')
            .restore();
          let x = doc.page.margins.left;
          for (let index = 0; index < columns.length; ) {
            const group = columns[index].group;
            let width = cellWidth(columns[index]);
            let end = index + 1;
            while (
              group &&
              end < columns.length &&
              columns[end].group === group
            )
              width += cellWidth(columns[end++]);
            if (group) {
              doc
                .fillColor('#000')
                .text(group, x, top + 2, {
                  width,
                  align: 'center',
                  lineBreak: false,
                });
              doc
                .save()
                .moveTo(x + 4, top + height - 1)
                .lineTo(x + width - 4, top + height - 1)
                .lineWidth(0.5)
                .stroke('#888')
                .restore();
            }
            x += width;
            index = end;
          }
          doc.y = top + height;
        }
        drawRow((column) => column.label, true, '#eeeeee');
        if (sec.totals)
          drawRow(
            (column) => displayCell(sec.totals![column.key], column.kind),
            true,
            '#f5f5f5',
          );
      };
      drawHeader();
      for (const row of sec.rows)
        drawRow(
          (column) => displayCell(row.cells[column.key], column.kind),
          false,
        );
      if (!sec.rows.length && sec.emptyText)
        doc
          .font('Helvetica-Oblique')
          .fontSize(FONT)
          .text(sec.emptyText, doc.page.margins.left);
      doc.moveDown(0.8);
    });
  }
  if (report.notes.length) {
    if (doc.y > bottom() - 40) doc.addPage();
    doc.font('Helvetica').fontSize(8).fillColor('#444');
    for (const note of report.notes)
      doc.text(`• ${note}`, doc.page.margins.left, undefined, {
        width: pageWidth,
      });
  }
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(range.start + index);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#666')
      .text(
        `${report.title} · page ${index + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 8,
        { width: pageWidth, align: 'right', lineBreak: false },
      );
  }
  doc.end();
  return done;
}

export type ReportFile = { data: Buffer; fileName: string; mimeType: string };

export const REPORT_FORMATS = ['xlsx', 'csv', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export async function reportFile(
  report: PharmacyReport,
  format: ReportFormat,
  clinicName: string,
): Promise<ReportFile> {
  const base = `${report.id}-${report.period.startDate}-to-${report.period.endDate}`;
  if (format === 'csv')
    return {
      data: Buffer.from(reportCsv(report), 'utf8'),
      fileName: `${base}.csv`,
      mimeType: 'text/csv; charset=utf-8',
    };
  if (format === 'pdf')
    return {
      data: await reportPdf(report, clinicName),
      fileName: `${base}.pdf`,
      mimeType: 'application/pdf',
    };
  return {
    data: reportWorkbook(report, clinicName),
    fileName: `${base}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
