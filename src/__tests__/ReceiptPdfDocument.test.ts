import * as fs from 'fs';
import * as path from 'path';
import {parseCsv} from '../services/csv/CsvReader';
import {groupTransactions} from '../services/csv/TransactionGrouper';
import {buildReceiptPdf} from '../services/pdf/ReceiptPdfDocument';

const TEST1_CSV = fs.readFileSync(path.resolve(__dirname, '../../test1.csv'), 'utf8');

describe('ReceiptPdfDocument', () => {
  test('builds a PDF using the normalized receipt without recomputing totals', () => {
    const receipt = groupTransactions(parseCsv(TEST1_CSV).rows)[0];
    const pdf = buildReceiptPdf(receipt);

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('WINSOFT PRINT STATION');
    expect(pdf).toContain('SI - C610837');
    expect(pdf).toContain('BALL BEARING');
    expect(pdf).toContain('Subtotal');
    expect(pdf).toContain('2390.00');
    expect(pdf).toContain('2509.50');
    expect(pdf).toContain('%%EOF');
  });

  test('escapes PDF control characters in source-derived content', () => {
    const receipt = groupTransactions(parseCsv(TEST1_CSV).rows)[0];
    receipt.items[0].description = 'Bearing (front) \\ special';

    const pdf = buildReceiptPdf(receipt);

    expect(pdf).toContain('Bearing \\(front\\) \\\\ special');
  });
});
