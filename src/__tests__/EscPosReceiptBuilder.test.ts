import {EscPosBuilder} from '../services/printer/escpos/EscPosBuilder';
import {
  buildThermalReceipt,
  buildTestThermalReceipt,
} from '../services/printer/escpos/EscPosReceiptBuilder';
import type {Receipt} from '../models/Receipt';

describe('EscPosBuilder', () => {
  it('initializes printer with ESC @', () => {
    const builder = new EscPosBuilder();
    const bytes = builder.build();
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it('generates correct alignment command bytes', () => {
    const builder = new EscPosBuilder();
    builder.align('center');
    builder.align('right');
    builder.align('left');
    const bytes = builder.build();

    // After init (0x1b, 0x40), each align is (0x1b, 0x61, n)
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x61);
    expect(bytes[4]).toBe(0x01); // center

    expect(bytes[5]).toBe(0x1b);
    expect(bytes[6]).toBe(0x61);
    expect(bytes[7]).toBe(0x02); // right

    expect(bytes[8]).toBe(0x1b);
    expect(bytes[9]).toBe(0x61);
    expect(bytes[10]).toBe(0x00); // left
  });

  it('generates bold on and off commands', () => {
    const builder = new EscPosBuilder();
    builder.bold(true);
    builder.bold(false);
    const bytes = builder.build();

    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x45);
    expect(bytes[4]).toBe(0x01); // on

    expect(bytes[5]).toBe(0x1b);
    expect(bytes[6]).toBe(0x45);
    expect(bytes[7]).toBe(0x00); // off
  });

  it('generates character size commands', () => {
    const builder = new EscPosBuilder();
    builder.textSize(2, 2);
    builder.textSize(1, 1);
    const bytes = builder.build();

    expect(bytes[2]).toBe(0x1d);
    expect(bytes[3]).toBe(0x21);
    expect(bytes[4]).toBe(0x11); // (1 << 4) | 1 = 0x11 (2x width, 2x height)

    expect(bytes[5]).toBe(0x1d);
    expect(bytes[6]).toBe(0x21);
    expect(bytes[7]).toBe(0x00); // normal
  });

  it('generates paper feed and cut commands', () => {
    const builder = new EscPosBuilder();
    builder.feed(3);
    builder.cut(true);
    const bytes = builder.build();

    // feed 3: 0x1b, 0x64, 0x03
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x64);
    expect(bytes[4]).toBe(0x03);

    // partial cut: 0x1d, 0x56, 0x42, 0x00
    expect(bytes[5]).toBe(0x1d);
    expect(bytes[6]).toBe(0x56);
    expect(bytes[7]).toBe(0x42);
    expect(bytes[8]).toBe(0x00);
  });

  it('formats leftRight within 48 columns', () => {
    const builder = new EscPosBuilder();
    builder.leftRight('Subtotal', '100.00', 48);
    const text = new TextDecoder().decode(builder.build());

    // Line should contain Subtotal and 100.00 separated by spaces, total length 48 + 1 (LF)
    const line = text.slice(2).replace('\n', ''); // skip init 2 bytes
    expect(line.length).toBe(48);
    expect(line.startsWith('Subtotal')).toBe(true);
    expect(line.endsWith('100.00')).toBe(true);
  });

  it('formats separators with exactly 48 characters', () => {
    const builder = new EscPosBuilder();
    builder.separator('=', 48);
    const text = new TextDecoder().decode(builder.build());
    const line = text.slice(2).replace('\n', '');
    expect(line).toBe('='.repeat(48));
  });
});

describe('EscPosReceiptBuilder', () => {
  const sampleReceipt: Receipt = {
    transactionType: 'TAX INVOICE',
    transactionNumber: 'TX-2026-001',
    date: '2026-09-11',
    customer: {
      name: 'Al-Mansoor Trading LLC',
      phone: '+971 4 1234567',
      address1: 'Deira, Dubai',
    },
    items: [
      {
        sourceFields: {},
        description: 'Office Chair Model X',
        quantity: 2,
        rate: 250,
        amount: 500,
        unit: 'PCS',
        batch: 'B-101',
        expiryDate: '2028-12-31',
        brand: 'ErgoComfort',
      },
      {
        sourceFields: {},
        description: 'Desk Mat Black',
        quantity: 1,
        rate: 50,
        amount: 50,
        unit: 'PCS',
        itemDiscount: 5,
      },
    ],
    financials: {
      subtotal: 550,
      discountAmount: 5,
      taxableAmount: 545,
      vatAmount: 27.25,
      vatRate: 5,
      rounding: 0,
      total: 572.25,
    },
    additional: {
      salesman: 'John Doe',
      trn: '100234567800003',
      lpoNumber: 'LPO-9981',
      remarks: 'Deliver to Warehouse 3',
    },
    sourceRows: [],
  };

  it('builds an 80mm test receipt with cut command', () => {
    const bytes = buildTestThermalReceipt();
    expect(bytes.length).toBeGreaterThan(50);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('WINSOFT TEST RECEIPT');
    expect(text).toContain('80mm Thermal ESC/POS Adapter');
    expect(text).toContain('PRINTER READY & VERIFIED');

    // Ends with cut command: 0x1d, 0x56, 0x42, 0x00
    const len = bytes.length;
    expect(bytes[len - 4]).toBe(0x1d);
    expect(bytes[len - 3]).toBe(0x56);
    expect(bytes[len - 2]).toBe(0x42);
    expect(bytes[len - 1]).toBe(0x00);
  });

  it('builds a full 80mm thermal receipt from a normalized Receipt', () => {
    const bytes = buildThermalReceipt(sampleReceipt);
    const text = new TextDecoder().decode(bytes);

    // Header & Details
    expect(text).toContain('WINSOFT PRINT STATION');
    expect(text).toContain('TAX INVOICE');
    expect(text).toContain('TX-2026-001');
    expect(text).toContain('2026-09-11');
    expect(text).toContain('Al-Mansoor Trading LLC');
    expect(text).toContain('+971 4 1234567');
    expect(text).toContain('100234567800003');

    // Items
    expect(text).toContain('Office Chair Model X');
    expect(text).toContain('2 PCS x 250.00');
    expect(text).toContain('500.00');
    expect(text).toContain('Batch: B-101');
    expect(text).toContain('Exp: 2028-12-31');
    expect(text).toContain('Brand: ErgoComfort');

    expect(text).toContain('Desk Mat Black');
    expect(text).toContain('1 PCS x 50.00');
    expect(text).toContain('Item Discount');

    // Financials
    expect(text).toContain('550.00'); // Subtotal
    expect(text).toContain('545.00'); // Taxable
    expect(text).toContain('VAT (5%)');
    expect(text).toContain('27.25'); // VAT
    expect(text).toContain('TOTAL');
    expect(text).toContain('572.25'); // Total

    // Additional info
    expect(text).toContain('John Doe');
    expect(text).toContain('LPO-9981');
    expect(text).toContain('Deliver to Warehouse 3');

    // Footer & Cut
    expect(text).toContain('Thank you for your business!');
    const len = bytes.length;
    expect(bytes[len - 4]).toBe(0x1d);
    expect(bytes[len - 3]).toBe(0x56);
  });

  it('handles minimal receipt with optional fields omitted gracefully', () => {
    const minimalReceipt: Receipt = {
      transactionType: 'INVOICE',
      transactionNumber: 'MIN-001',
      customer: {},
      items: [
        {
          sourceFields: {},
          description: 'Basic Item',
          quantity: 1,
          rate: 10,
          amount: 10,
        },
      ],
      financials: {
        total: 10,
      },
      additional: {},
      sourceRows: [],
    };

    const bytes = buildThermalReceipt(minimalReceipt);
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain('MIN-001');
    expect(text).toContain('Basic Item');
    expect(text).toContain('10.00');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });
});
