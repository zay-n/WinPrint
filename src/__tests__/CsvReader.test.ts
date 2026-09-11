/**
 * CsvReader.test.ts — Tests for the Winsoft CSV tokenizer and parser
 *
 * Uses real test1.csv from the project fixtures directory.
 * Verifies: header detection, row count, column preservation,
 * quoted-field handling, and empty-value handling.
 */

import * as fs from 'fs';
import * as path from 'path';
import {tokenizeCsvLine, parseCsv} from '../services/csv/CsvReader';

const TEST1_CSV = fs.readFileSync(path.resolve(__dirname, '../../test1.csv'), 'utf8');

// ---------------------------------------------------------------------------
// tokenizeCsvLine
// ---------------------------------------------------------------------------

describe('tokenizeCsvLine', () => {
  test('simple unquoted fields', () => {
    expect(tokenizeCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('quoted field with comma inside', () => {
    expect(tokenizeCsvLine('"hello, world",foo')).toEqual([
      'hello, world',
      'foo',
    ]);
  });

  test('escaped double-quote inside quoted field', () => {
    expect(tokenizeCsvLine('"say ""hello""",end')).toEqual([
      'say "hello"',
      'end',
    ]);
  });

  test('empty field between commas', () => {
    expect(tokenizeCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });

  test('trailing comma produces empty last field', () => {
    const result = tokenizeCsvLine('a,b,');
    expect(result[result.length - 1]).toBe('');
  });

  test('single empty string', () => {
    expect(tokenizeCsvLine('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseCsv with test1.csv
// ---------------------------------------------------------------------------

describe('parseCsv — test1.csv', () => {
  let result: ReturnType<typeof parseCsv>;

  beforeAll(() => {
    result = parseCsv(TEST1_CSV);
  });

  test('no malformed rows', () => {
    expect(result.malformedRows).toHaveLength(0);
  });

  test('correct number of data rows (3)', () => {
    expect(result.rows).toHaveLength(3);
  });

  test('headers include known Winsoft columns', () => {
    const {headers} = result;
    const expected = [
      'transtype',
      'transno',
      'productid',
      'descript',
      'quantity',
      'rate',
      'amount',
      'date',
      'name',
      'vatamt',
      'iamount',
    ];
    for (const col of expected) {
      expect(headers).toContain(col);
    }
  });

  test('total header count matches test1.csv (82 columns)', () => {
    expect(result.headers).toHaveLength(82);
  });

  test('all rows have every column from the header', () => {
    for (const row of result.rows) {
      for (const h of result.headers) {
        expect(row).toHaveProperty(h);
      }
    }
  });

  test('transtype is SI for all rows', () => {
    for (const row of result.rows) {
      expect(row.transtype).toBe('SI');
    }
  });

  test('transno is C610837 for all rows', () => {
    for (const row of result.rows) {
      expect(row.transno).toBe('C610837');
    }
  });

  test('first row productid is 6226C3-SK', () => {
    expect(result.rows[0].productid).toBe('6226C3-SK');
  });

  test('quoted customer name with commas is preserved intact', () => {
    // Name field in test1.csv contains commas — must not be split
    const name = result.rows[0].name;
    expect(name).toContain('ASCA MARITIME');
    expect(name).toContain('SHARJAH');
  });

  test('numeric quantity field preserved as string', () => {
    expect(result.rows[0].quantity).toBe('1.00');
    expect(result.rows[1].quantity).toBe('3.00');
    expect(result.rows[2].quantity).toBe('2.00');
  });
});
