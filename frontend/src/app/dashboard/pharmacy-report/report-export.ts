export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

/**
 * @cc [owner:nareshshah139,label:product] report-export-matrix
 * Report exports preserve the displayed column order, filtered rows and totals; missing cells are blank and unknown values remain unknown.
 */
export function reportExportMatrix(columns: string[], rows: ReportRow[], totals: ReportRow): (string | number)[][] {
  return [columns, ...[...(rows.length ? [totals] : []), ...rows].map(row => columns.map(column => column in row ? row[column] ?? 'Unknown' : ''))];
}

/**
 * @cc [owner:nareshshah139,label:security] report-csv-formulas
 * CSV export quotes cells and prefixes formula-like text so spreadsheet programs treat it as text while numbers remain numeric.
 */
export function reportCsv(notice: string, period: string, matrix: (string | number)[][]): string {
  const cell = (value: string | number) => {
    const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : String(value);
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [[notice], [`Period ${period}`], ...matrix].map(row => row.map(cell).join(',')).join('\r\n');
}

/**
 * @cc [owner:nareshshah139,label:product] report-pdf-content
 * PDF export paginates the filtered matrix and totals across column bands, repeats the title, period and partial-data warning on report pages, and includes the full data-quality notice in paginated detail pages.
 */
export async function downloadReportPdf(title: string, period: string, notice: string, matrix: (string | number)[][], filename: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' });
  const width = 2000, height = 1414, margin = 70, fontSize = 24, lineHeight = 32;
  let pageCount = 0;
  const bands = Array.from({ length: Math.ceil(matrix[0].length / 5) }, (_, index) => matrix.map(row => row.slice(index * 5, index * 5 + 5)));
  for (const [bandIndex, band] of bands.entries()) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PDF rendering is unavailable');
    const columnWidth = (width - 2 * margin) / band[0].length;
    const wrap = (value: string, maxWidth: number) => {
      const result: string[] = []; let line = '';
      for (const character of Array.from(value)) {
        if (line && ctx.measureText(line + character).width > maxWidth) { result.push(line); line = ''; }
        line += character;
      }
      result.push(line); return result;
    };
    const paintHeader = () => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#111';
      ctx.font = 'bold 34px sans-serif'; ctx.fillText(title, margin, 65);
      ctx.font = `${fontSize}px sans-serif`; ctx.fillText(`Period ${period} | Columns ${bandIndex * 5 + 1}-${bandIndex * 5 + band[0].length} of ${matrix[0].length}`, margin, 105);
      ctx.fillText('PARTIAL AND UNVERIFIED. See data quality details after the report.', margin, 150);
      return 205;
    };
    const drawLines = (lines: string[][], rowStart: number, count: number, y: number, header: boolean) => {
      if (header) { ctx.fillStyle = '#e7e7e7'; ctx.fillRect(margin, y - 24, width - 2 * margin, count * lineHeight + 12); }
      ctx.fillStyle = '#111'; ctx.font = `${header ? 'bold ' : ''}${fontSize}px sans-serif`;
      lines.forEach((cell, index) => cell.slice(rowStart, rowStart + count).forEach((line, offset) => ctx.fillText(line, margin + index * columnWidth + 4, y + offset * lineHeight)));
      return y + count * lineHeight + 12;
    };
    const finish = () => { if (pageCount++) pdf.addPage(); pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210); };
    let y = paintHeader();
    const headerLines = band[0].map(value => wrap(String(value), columnWidth - 10));
    const drawHeader = () => { y = drawLines(headerLines, 0, Math.max(...headerLines.map(lines => lines.length)), y, true); };
    drawHeader();
    for (const row of band.slice(1)) {
      ctx.font = `${fontSize}px sans-serif`;
      const lines = row.map(value => wrap(typeof value === 'number' ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value), columnWidth - 10));
      const count = Math.max(...lines.map(cell => cell.length));
      for (let start = 0; start < count;) {
        let capacity = Math.floor((height - margin - y - 12) / lineHeight);
        if (capacity < 1) { finish(); y = paintHeader(); drawHeader(); capacity = Math.floor((height - margin - y - 12) / lineHeight); }
        if (capacity < 1) throw new Error('PDF notice is too long to render');
        const slice = Math.min(capacity, count - start); y = drawLines(lines, start, slice, y, false); start += slice;
      }
    }
    finish();
  }
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PDF rendering is unavailable');
  const drawDetailsHeader = () => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#111';
    ctx.font = 'bold 34px sans-serif'; ctx.fillText('Data quality details', margin, 65);
    ctx.font = `${fontSize}px sans-serif`; ctx.fillText(`Period ${period}`, margin, 105);
  };
  const detailLines: string[] = [];
  let line = '';
  ctx.font = `${fontSize}px sans-serif`;
  for (const word of notice.match(/\S+\s*|\s+/g) || []) {
    if (line && ctx.measureText(line + word).width > width - 2 * margin) { detailLines.push(line); line = ''; }
    for (const character of Array.from(word)) {
      if (line && ctx.measureText(line + character).width > width - 2 * margin) { detailLines.push(line); line = ''; }
      line += character;
    }
  }
  if (line || !detailLines.length) detailLines.push(line);
  const perPage = Math.max(1, Math.floor((height - margin - 160) / lineHeight));
  for (let offset = 0; offset < detailLines.length; offset += perPage) {
    drawDetailsHeader();
    detailLines.slice(offset, offset + perPage).forEach((detail, index) => ctx.fillText(detail, margin, 160 + index * lineHeight));
    if (pageCount++) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
  }
  pdf.save(filename);
}
