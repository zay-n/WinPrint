/**
 * WinsoftMapper.test.ts — Tests for the row-to-receipt-item mapping logic
 */

import {mapRowToItem} from '../services/csv/WinsoftMapper';
import type {RawWinsoftRow} from '../models/Receipt';

describe('WinsoftMapper', () => {
  test('maps known numeric and string fields correctly', () => {
    const raw: RawWinsoftRow = {
      productid: '123',
      descript: 'Test Product',
      quantity: '2.50',
      rate: '10.00',
      amount: '25.00',
      ntwt: '1.2',
      vamount: '1.25',
      mdate: '10/05/2026',
    };

    const item = mapRowToItem(raw);

    expect(item.productId).toBe('123');
    expect(item.description).toBe('Test Product');
    expect(item.quantity).toBe(2.5);
    expect(item.rate).toBe(10);
    expect(item.amount).toBe(25);
    expect(item.netWeight).toBe(1.2);
    expect(item.vatAmount).toBe(1.25);
    expect(item.manufactureDate).toBe('10/05/2026');
  });

  test('handles empty and whitespace-only strings gracefully', () => {
    const raw: RawWinsoftRow = {
      productid: '   ',
      descript: '',
      quantity: '  ',
    };

    const item = mapRowToItem(raw);

    expect(item.productId).toBeUndefined();
    expect(item.description).toBeUndefined();
    expect(item.quantity).toBeUndefined();
  });

  test('preserves all original source fields, even unknown ones', () => {
    const raw: RawWinsoftRow = {
      productid: '123',
      random_column: 'hello',
      another_one: 'world',
    };

    const item = mapRowToItem(raw);

    expect(item.productId).toBe('123');
    expect(item.sourceFields.productid).toBe('123');
    expect(item.sourceFields.random_column).toBe('hello');
    expect(item.sourceFields.another_one).toBe('world');
  });
});
