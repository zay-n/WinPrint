/**
 * TransactionGrouper.test.ts — Tests for transaction grouping logic
 *
 * Uses real test1.csv from the project fixtures.
 * Verifies that the grouper properly groups multiple rows sharing
 * the same transtype + transno into a single receipt, correctly
 * aggregates line items, and copies transaction-level financials
 * only from the first row.
 */

import * as fs from 'fs';
import * as path from 'path';
import {parseCsv} from '../services/csv/CsvReader';
import {groupTransactions} from '../services/csv/TransactionGrouper';

const TEST1_CSV = fs.readFileSync(path.resolve(__dirname, '../../test1.csv'), 'utf8');

describe('TransactionGrouper', () => {
  let receipts: ReturnType<typeof groupTransactions>;

  beforeAll(() => {
    const {rows} = parseCsv(TEST1_CSV);
    receipts = groupTransactions(rows);
  });

  test('groups 3 rows into 1 transaction', () => {
    expect(receipts).toHaveLength(1);
    expect(receipts[0].transactionType).toBe('SI');
    expect(receipts[0].transactionNumber).toBe('C610837');
  });

  test('receipt contains exactly 3 items', () => {
    expect(receipts[0].items).toHaveLength(3);
  });

  test('transaction-level financials match the first row', () => {
    const {financials} = receipts[0];
    // subtotalamt = 2390.00 in all rows, should not be summed
    expect(financials.subtotal).toBe(2390);
    // iamount = 2509.50
    expect(financials.total).toBe(2509.5);
    // vatamt = 119.50
    expect(financials.vatAmount).toBe(119.5);
  });

  test('preserves all source rows completely', () => {
    expect(receipts[0].sourceRows).toHaveLength(3);
    expect(receipts[0].sourceRows[0].productid).toBe('6226C3-SK');
    expect(receipts[0].sourceRows[1].productid).toBe('63152Z-SK');
    expect(receipts[0].sourceRows[2].productid).toBe('CUCFC207CE');
  });

  test('item mapping correctly copies details', () => {
    const firstItem = receipts[0].items[0];
    expect(firstItem.productId).toBe('6226C3-SK');
    expect(firstItem.description).toBe('BALL BEARING');
    expect(firstItem.quantity).toBe(1);
    expect(firstItem.rate).toBe(925);
    expect(firstItem.amount).toBe(925);
  });

  test('preserves source fields on individual items', () => {
    const firstItem = receipts[0].items[0];
    // check an unmapped arbitrary field
    expect(firstItem.sourceFields.fprice).toBe('925.0000');
    expect(firstItem.sourceFields.post).toBe('N');
  });
});
