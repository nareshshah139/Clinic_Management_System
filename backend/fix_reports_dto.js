const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/modules/reports/dto/reports.dto.ts', 'utf8');

// Find the line with "includeTransactionHistory?: boolean;" and add the closing brace
const lines = content.split('\n');
let newLines = [];

for (let i = 0; i < lines.length; i++) {
  newLines.push(lines[i]);
  
  // If this is the line with includeTransactionHistory, add the closing brace and the new class
  if (lines[i].includes('includeTransactionHistory?: boolean;')) {
    newLines.push('}');
    newLines.push('');
    newLines.push('export class TransactionSummaryDto {');
    newLines.push('  @ApiProperty({ description: \'Total transactions\' })');
    newLines.push('  totalTransactions: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Purchase transactions\' })');
    newLines.push('  purchaseTransactions: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Sale transactions\' })');
    newLines.push('  saleTransactions: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Return transactions\' })');
    newLines.push('  returnTransactions: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Adjustment transactions\' })');
    newLines.push('  adjustmentTransactions: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Total purchase value\' })');
    newLines.push('  totalPurchaseValue: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Total sale value\' })');
    newLines.push('  totalSaleValue: number;');
    newLines.push('');
    newLines.push('  @ApiProperty({ description: \'Profit margin percentage\' })');
    newLines.push('  profitMargin: number;');
    newLines.push('}');
    newLines.push('');
  }
}

// Remove the duplicate TransactionSummaryDto class
const finalLines = [];
let skipDuplicate = false;
let braceCount = 0;

for (let i = 0; i < newLines.length; i++) {
  if (newLines[i].includes('export class TransactionSummaryDto {') && i > 700) {
    skipDuplicate = true;
    braceCount = 1;
    continue;
  }
  
  if (skipDuplicate) {
    if (newLines[i].includes('{')) braceCount++;
    if (newLines[i].includes('}')) braceCount--;
    if (braceCount === 0) {
      skipDuplicate = false;
      continue;
    }
    continue;
  }
  
  finalLines.push(newLines[i]);
}

// Write the fixed content
fs.writeFileSync('src/modules/reports/dto/reports.dto.ts', finalLines.join('\n'));
console.log('Fixed reports.dto.ts');
