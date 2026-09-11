/**
 * EscPosReceiptBuilder.ts — 80mm Thermal Receipt Generator
 *
 * Formats a normalized Receipt into standard ESC/POS binary data optimized
 * specifically for 80mm thermal paper (48 columns).
 *
 * Does NOT squeeze or convert from A4 PDF — built directly from the normalized Receipt.
 */

import type {Receipt, ReceiptItem} from '../../../models/Receipt';
import {EscPosBuilder} from './EscPosBuilder';

export interface ThermalReceiptOptions {
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessTrn?: string;
  footerMessage?: string;
  paperWidth?: number; // default 48
}

const DEFAULT_OPTIONS: ThermalReceiptOptions = {
  businessName: 'WINSOFT PRINT STATION',
  businessAddress: 'Business Bay, Dubai, UAE',
  footerMessage: 'Thank you for your business!',
  paperWidth: EscPosBuilder.DEFAULT_80MM_WIDTH,
};

/**
 * Builds 80mm ESC/POS bytes from a normalized Receipt.
 */
export function buildThermalReceipt(
  receipt: Receipt,
  userOptions?: ThermalReceiptOptions,
): Uint8Array {
  const options = {...DEFAULT_OPTIONS, ...userOptions};
  const width = options.paperWidth ?? EscPosBuilder.DEFAULT_80MM_WIDTH;
  const builder = new EscPosBuilder();

  // 1. Header (Centered)
  builder.align('center');
  builder.bold(true);
  builder.textSize(2, 2);
  builder.line(options.businessName);

  builder.textSize(1, 1);
  builder.bold(false);
  if (options.businessAddress) {
    builder.line(options.businessAddress);
  }
  if (options.businessPhone) {
    builder.line(`Tel: ${options.businessPhone}`);
  }
  if (options.businessTrn) {
    builder.line(`TRN: ${options.businessTrn}`);
  }

  builder.line();
  builder.bold(true);
  builder.textSize(1, 2);
  builder.line(receipt.transactionType || 'TAX INVOICE');
  builder.textSize(1, 1);
  builder.bold(false);

  // 2. Transaction & Customer Info
  builder.align('left');
  builder.separator('=', width);
  builder.leftRight('Trans No:', receipt.transactionNumber || '-', width);
  if (receipt.date) {
    builder.leftRight('Date:', receipt.date, width);
  }
  if (receipt.customer.name) {
    builder.leftRight('Customer:', receipt.customer.name, width);
  }
  if (receipt.customer.phone) {
    builder.leftRight('Phone:', receipt.customer.phone, width);
  }
  const trn = receipt.additional.trn;
  if (trn) {
    builder.leftRight('Customer TRN:', trn, width);
  }
  if (receipt.customer.address1) {
    builder.line(`Address: ${receipt.customer.address1}`);
  }

  // 3. Line Items Table (80mm 2-line layout)
  builder.separator('=', width);
  builder.bold(true);
  builder.leftRight('DESCRIPTION', 'QTY x RATE      AMOUNT', width);
  builder.bold(false);
  builder.separator('-', width);

  receipt.items.forEach((item, index) => {
    formatThermalItem(builder, item, index + 1, width);
  });

  // 4. Totals
  builder.separator('=', width);
  if (receipt.financials.subtotal !== undefined) {
    builder.leftRight('Subtotal', formatMoney(receipt.financials.subtotal), width);
  }
  if (receipt.financials.discountAmount && receipt.financials.discountAmount > 0) {
    builder.leftRight('Discount', `-${formatMoney(receipt.financials.discountAmount)}`, width);
  }
  if (receipt.financials.freight && receipt.financials.freight > 0) {
    builder.leftRight('Freight', formatMoney(receipt.financials.freight), width);
  }
  if (receipt.financials.taxableAmount !== undefined) {
    builder.leftRight('Taxable Amount', formatMoney(receipt.financials.taxableAmount), width);
  }
  if (receipt.financials.vatAmount !== undefined) {
    const vatLabel = receipt.financials.vatRate !== undefined
      ? `VAT (${receipt.financials.vatRate}%)`
      : 'VAT';
    builder.leftRight(vatLabel, formatMoney(receipt.financials.vatAmount), width);
  }
  if (receipt.financials.rounding && receipt.financials.rounding !== 0) {
    builder.leftRight('Rounding', formatMoney(receipt.financials.rounding), width);
  }

  builder.separator('-', width);

  // Grand Total in Bold Double-Height
  builder.bold(true);
  builder.textSize(1, 2);
  const totalAmount = receipt.financials.total !== undefined
    ? formatMoney(receipt.financials.total)
    : '0.00';
  builder.leftRight('TOTAL', totalAmount, width);
  builder.textSize(1, 1);
  builder.bold(false);

  // 5. Additional Info
  let hasAdditional = false;
  if (receipt.additional.salesman || receipt.additional.lpoNumber || receipt.additional.remarks) {
    builder.separator('-', width);
    hasAdditional = true;
  }
  if (receipt.additional.salesman) {
    builder.leftRight('Salesman:', receipt.additional.salesman, width);
  }
  if (receipt.additional.lpoNumber) {
    builder.leftRight('LPO No:', receipt.additional.lpoNumber, width);
  }
  if (receipt.additional.remarks) {
    builder.line(`Remarks: ${receipt.additional.remarks}`);
  }

  // 6. Footer (Centered)
  if (hasAdditional) {
    builder.separator('=', width);
  } else {
    builder.separator('=', width);
  }

  builder.align('center');
  if (options.footerMessage) {
    builder.line(options.footerMessage);
  }
  builder.line('--- Winsoft Print Station ---');

  // 7. Feed & Cut
  builder.feed(4);
  builder.cut(true);

  return builder.build();
}

/**
 * Builds an 80mm test receipt to verify physical printer connectivity,
 * bold styling, character alignment, and paper cut.
 */
export function buildTestThermalReceipt(
  title = 'WINSOFT TEST RECEIPT',
  width = EscPosBuilder.DEFAULT_80MM_WIDTH,
): Uint8Array {
  const builder = new EscPosBuilder();

  builder.align('center');
  builder.bold(true);
  builder.textSize(2, 2);
  builder.line(title);

  builder.textSize(1, 1);
  builder.bold(false);
  builder.line('80mm Thermal ESC/POS Adapter');
  builder.line(new Date().toLocaleString());

  builder.align('left');
  builder.separator('=', width);
  builder.bold(true);
  builder.line('48-COLUMN ALIGNMENT TEST:');
  builder.bold(false);
  builder.line('123456789012345678901234567890123456789012345678');
  builder.separator('-', width);

  builder.leftRight('Left Justified', 'Right Justified', width);
  builder.leftRight('Item 1 (Qty 1)', '10.00', width);
  builder.leftRight('Item 2 (Qty 2)', '25.50', width);

  builder.separator('-', width);
  builder.bold(true);
  builder.textSize(1, 2);
  builder.leftRight('TEST TOTAL', '35.50', width);
  builder.textSize(1, 1);
  builder.bold(false);

  builder.separator('=', width);
  builder.align('center');
  builder.line('PRINTER READY & VERIFIED');
  builder.feed(4);
  builder.cut(true);

  return builder.build();
}

function formatThermalItem(
  builder: EscPosBuilder,
  item: ReceiptItem,
  index: number,
  width: number,
): void {
  const desc = item.description || `Item #${index}`;
  builder.bold(true);
  builder.line(`${index}. ${desc}`);
  builder.bold(false);

  const qty = item.quantity !== undefined ? formatQty(item.quantity) : '1';
  const unit = item.unit ? ` ${item.unit}` : '';
  const rate = item.rate !== undefined ? formatMoney(item.rate) : '0.00';
  const amount = item.amount !== undefined ? formatMoney(item.amount) : '0.00';

  const leftDetails = `   ${qty}${unit} x ${rate}`;
  builder.leftRight(leftDetails, amount, width);

  // Optional item details
  if (item.batch || item.expiryDate) {
    const batchExp = [
      item.batch ? `Batch: ${item.batch}` : '',
      item.expiryDate ? `Exp: ${item.expiryDate}` : '',
    ].filter(Boolean).join('  ');
    builder.line(`   ${batchExp}`);
  }

  if (item.brand) {
    builder.line(`   Brand: ${item.brand}`);
  }

  if (item.itemDiscount && item.itemDiscount > 0) {
    builder.leftRight('   Item Discount', `-${formatMoney(item.itemDiscount)}`, width);
  }
}

function formatMoney(amount: number): string {
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}
