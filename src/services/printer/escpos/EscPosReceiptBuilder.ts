/**
 * EscPosReceiptBuilder.ts — 80mm Thermal Receipt Generator
 *
 * Formats a normalized Receipt into standard ESC/POS binary data optimized
 * specifically for 80mm thermal paper (48 columns).
 *
 * Does NOT squeeze or convert from A4 PDF — built directly from the normalized Receipt.
 */

import type {Receipt, ReceiptItem} from '../../../models/Receipt';
import {BusinessProfile, ThermalTemplate, DEFAULT_BUSINESS_PROFILE, DEFAULT_THERMAL_TEMPLATE} from '../../../models/Profile';
import {EscPosBuilder} from './EscPosBuilder';

/**
 * Builds 80mm ESC/POS bytes from a normalized Receipt.
 */
export function buildThermalReceipt(
  receipt: Receipt,
  profile?: BusinessProfile,
  template?: ThermalTemplate,
): Uint8Array {
  const p = profile ?? DEFAULT_BUSINESS_PROFILE;
  const t = template ?? DEFAULT_THERMAL_TEMPLATE;
  const width = EscPosBuilder.DEFAULT_80MM_WIDTH;
  const builder = new EscPosBuilder();

  if (t.fontMode === 'large') {
    // EscPosBuilder doesn't have a direct global mode, but we can set double height for the whole receipt
    // Actually, we'll just set double height for specific elements later or leave it normal.
  }

  // 1. Header
  const hAlign = t.headerAlignment === 'left' ? 'left' : (t.headerAlignment === 'right' ? 'right' : 'center');
  builder.align(hAlign);
  
  if (t.showBusinessName) {
    builder.bold(true);
    builder.textSize(2, 2);
    builder.line(p.identity.businessName || 'WINSOFT PRINT STATION');
  }

  builder.textSize(1, 1);
  builder.bold(false);
  
  if (t.showAddress && p.contact.addressLine1) {
    builder.line(p.contact.addressLine1);
    if (p.contact.addressLine2) builder.line(p.contact.addressLine2);
  }
  if (t.showPhone && p.contact.phone) {
    builder.line(`Tel: ${p.contact.phone}`);
  }
  if (t.showTaxRegistration && p.tax.taxRegistrationNumber) {
    builder.line(`${p.tax.taxRegistrationLabel || 'Tax ID'}: ${p.tax.taxRegistrationNumber}`);
  }

  builder.line();
  builder.bold(true);
  builder.textSize(1, 2);
  builder.line(p.receiptDefaults.receiptTitle || 'TAX INVOICE');
  builder.textSize(1, 1);
  builder.bold(false);

  // 2. Transaction & Customer Info
  builder.align('left');
  if (t.showSeparators) builder.separator('=', width);
  
  if (t.showInvoiceNumber) builder.leftRight('Trans No:', receipt.transactionNumber || '-', width);
  if (t.showDateTime && receipt.date) {
    builder.leftRight('Date:', receipt.date, width);
  }
  
  if (t.showCustomerName && receipt.customer.name) {
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
  if (t.showSeparators) builder.separator('=', width);
  builder.bold(true);
  
  // A simplistic header for now (we'll keep it mostly standard for 80mm as it's hardcoded to standard layout)
  builder.leftRight('DESCRIPTION', 'QTY x RATE      AMOUNT', width);
  builder.bold(false);
  if (t.showSeparators) builder.separator('-', width);

  receipt.items.forEach((item, index) => {
    formatThermalItem(builder, item, index + 1, width, t);
  });

  // 4. Totals
  if (t.showSeparators) builder.separator('=', width);
  
  if (t.showSubtotal && receipt.financials.subtotal !== undefined) {
    builder.leftRight('Subtotal', formatMoney(receipt.financials.subtotal), width);
  }
  if (t.showDiscount && receipt.financials.discountAmount && receipt.financials.discountAmount > 0) {
    builder.leftRight('Discount', `-${formatMoney(receipt.financials.discountAmount)}`, width);
  }
  if (receipt.financials.freight && receipt.financials.freight > 0) {
    builder.leftRight('Freight', formatMoney(receipt.financials.freight), width);
  }
  if (receipt.financials.taxableAmount !== undefined) {
    builder.leftRight('Taxable Amount', formatMoney(receipt.financials.taxableAmount), width);
  }
  if (t.showVat && receipt.financials.vatAmount !== undefined) {
    const taxLabel = p.receiptDefaults.defaultTaxLabel || 'VAT';
    const vatLabel = receipt.financials.vatRate !== undefined
      ? `${taxLabel} (${receipt.financials.vatRate}%)`
      : taxLabel;
    builder.leftRight(vatLabel, formatMoney(receipt.financials.vatAmount), width);
  }
  if (receipt.financials.rounding && receipt.financials.rounding !== 0) {
    builder.leftRight('Rounding', formatMoney(receipt.financials.rounding), width);
  }

  if (t.showSeparators) builder.separator('-', width);

  // Grand Total in Bold Double-Height
  if (t.showGrandTotal) {
    builder.bold(true);
    builder.textSize(1, 2);
    const totalAmount = receipt.financials.total !== undefined
      ? formatMoney(receipt.financials.total)
      : '0.00';
      
    const curr = p.receiptDefaults.currencySymbol;
    const pos = p.receiptDefaults.currencyPosition;
    const totalWithCurrency = pos === 'before' ? `${curr} ${totalAmount}` : `${totalAmount} ${curr}`;
    
    builder.leftRight('TOTAL', totalWithCurrency, width);
    builder.textSize(1, 1);
    builder.bold(false);
  }

  // 5. Additional Info
  if (receipt.additional.salesman || receipt.additional.lpoNumber || receipt.additional.remarks) {
    builder.separator('-', width);
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
  if (t.showSeparators) {
    builder.separator('=', width);
  }

  builder.align('center');
  if (t.showFooter) {
    const footerMsg = p.footer.footerMessage || 'Thank you for your business!';
    builder.line(footerMsg);
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
  t: ThermalTemplate,
): void {
  let desc = '';
  if (t.showItemCode && t.showItemDescription) {
    const code = item.sourceFields?.item;
    desc = code ? `[${code}] ${item.description || ''}` : (item.description || `Item #${index}`);
  } else if (t.showItemDescription) {
    desc = item.description || `Item #${index}`;
  } else if (t.showItemCode) {
    desc = item.sourceFields?.item || `Item #${index}`;
  } else {
    desc = `Item #${index}`;
  }
  
  builder.bold(true);
  const prefix = `${index}. `;
  builder.textWrapped(`${prefix}${desc}`, width, prefix.length);
  builder.bold(false);

  const qty = item.quantity !== undefined ? formatQty(item.quantity) : '1';
  const unit = item.unit ? ` ${item.unit}` : '';
  const rate = item.rate !== undefined ? formatMoney(item.rate) : '0.00';
  const amount = item.amount !== undefined ? formatMoney(item.amount) : '0.00';

  let leftDetails = '';
  if (t.showQuantity && t.showUnitPrice) {
    leftDetails = `   ${qty}${unit} x ${rate}`;
  } else if (t.showQuantity) {
    leftDetails = `   ${qty}${unit}`;
  } else if (t.showUnitPrice) {
    leftDetails = `   Rate: ${rate}`;
  }
  
  const rightTotal = t.showItemTotal ? amount : '';
  
  if (leftDetails || rightTotal) {
    builder.leftRight(leftDetails, rightTotal, width);
  }

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

  if (t.showDiscount && item.itemDiscount && item.itemDiscount > 0) {
    builder.leftRight('   Item Discount', `-${formatMoney(item.itemDiscount)}`, width);
  }
}

function formatMoney(amount: number): string {
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2);
}
