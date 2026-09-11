/**
 * Pure PDF document builder for a single normalized Receipt.
 *
 * This module deliberately knows nothing about React Native storage, screens,
 * Drive, or printers. It produces an ASCII PDF 1.4 document that callers can
 * save or hand to a future printer adapter.
 */

import type {Receipt} from '../../models/Receipt';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 40;
const RIGHT = PAGE_WIDTH - 40;
const FOOTER_Y = 34;

type Page = {commands: string[]; y: number};

export function buildReceiptPdf(receipt: Receipt): string {
  const pages: Page[] = [];
  let page!: Page;

  const startPage = (continued = false) => {
    page = {commands: [], y: 735};
    page.commands.push(rect(0, 770, PAGE_WIDTH, 72, '#1A1D2E'));
    page.commands.push(text(LEFT, 812, 'WINSOFT PRINT STATION', 18, true, '#F1F5F9'));
    page.commands.push(text(LEFT, 791, 'Receipt / Tax Invoice', 10, false, '#94A3B8'));
    page.commands.push(text(RIGHT - 142, 808, continued ? 'CONTINUED' : 'PARSED RECEIPT', 9, true, '#8B84FF'));
    page.commands.push(text(RIGHT - 142, 790, `${receipt.transactionType} - ${receipt.transactionNumber}`, 11, true, '#F1F5F9'));
    pages.push(page);
  };

  const ensureSpace = (height: number) => {
    if (page.y - height < 78) {
      startPage(true);
    }
  };

  const section = (label: string) => {
    ensureSpace(24);
    page.commands.push(text(LEFT, page.y, label.toUpperCase(), 9, true, '#6C63FF'));
    page.y -= 16;
  };

  const detailRow = (label: string, value: string | undefined) => {
    if (!value) {
      return;
    }
    ensureSpace(17);
    page.commands.push(text(LEFT, page.y, label, 9, true, '#64748B'));
    page.commands.push(text(155, page.y, value, 9, false, '#1F2937'));
    page.y -= 15;
  };

  const divider = () => {
    ensureSpace(10);
    page.commands.push(line(LEFT, page.y, RIGHT, page.y, '#D7DBE5'));
    page.y -= 10;
  };

  startPage();
  section('Transaction');
  detailRow('Transaction', `${receipt.transactionType} / ${receipt.transactionNumber}`);
  detailRow('Date', receipt.date);
  detailRow('Source file', receipt.sourceFile?.driveFileName);
  divider();

  section('Bill To');
  detailRow('Customer', receipt.customer.name);
  detailRow('Address', joinValues([receipt.customer.address1, receipt.customer.address2]));
  detailRow('Location', joinValues([receipt.customer.city, receipt.customer.country]));
  detailRow('Phone', receipt.customer.phone);
  detailRow('TRN', receipt.additional.trn);
  divider();

  section('Line Items');
  tableHeader(page);
  page.y -= 18;

  receipt.items.forEach((item, itemIndex) => {
    const descriptionLines = wrapText(item.description ?? item.productId ?? 'Unnamed item', 29);
    const rowHeight = Math.max(24, descriptionLines.length * 11 + 10);
    ensureSpace(rowHeight + 4);
    if (page.y === 735) {
      tableHeader(page);
      page.y -= 18;
    }
descriptionLines.forEach((description, lineIndex) => {
  page.commands.push(
    text(
      LEFT,
      page.y - lineIndex * 11,
      description,
      8,
      lineIndex === 0,
      '#1F2937',
    ),
  );
});

page.commands.push(
  text(267, page.y, numberText(item.quantity), 8, false, '#1F2937', 'right'),
);
page.commands.push(
  text(306, page.y, item.unit ?? '-', 8, false, '#1F2937'),
);
page.commands.push(
  text(379, page.y, money(item.rate), 8, false, '#1F2937', 'right'),
);
page.commands.push(
  text(447, page.y, money(item.itemDiscount), 8, false, '#1F2937', 'right'),
);
page.commands.push(
  text(RIGHT, page.y, money(item.amount), 8, true, '#1F2937', 'right'),
);

// Put the divider clearly below the complete item row.
const dividerY = page.y - rowHeight - 2;
page.commands.push(
  line(LEFT, dividerY, RIGHT, dividerY, '#E7EAF0'),
);

// Add deliberate breathing room before the next item.
page.y = dividerY - 10;
  });

  ensureSpace(150);
  divider();
  section('Totals');
  totalRow(page, 'Subtotal', money(receipt.financials.subtotal));
  totalRow(page, 'Freight', money(receipt.financials.freight));
  totalRow(page, 'Transaction Discount', money(receipt.financials.discountAmount));
  totalRow(page, `VAT${receipt.financials.vatRate === undefined ? '' : ` (${numberText(receipt.financials.vatRate)}%)`}`, money(receipt.financials.vatAmount));
  totalRow(page, 'Rounding', money(receipt.financials.rounding));
  page.commands.push(rect(330, page.y - 7, RIGHT - 330, 25, '#EDEBFF'));
  page.commands.push(text(342, page.y + 1, 'GRAND TOTAL', 10, true, '#4F46E5'));
  page.commands.push(text(RIGHT - 10, page.y + 1, money(receipt.financials.total), 12, true, '#312E81', 'right'));
  page.y -= 34;

  pages.forEach((currentPage, index) => {
    currentPage.commands.push(line(LEFT, 52, RIGHT, 52, '#D7DBE5'));
    currentPage.commands.push(text(LEFT, FOOTER_Y, 'Generated locally by Winsoft Print Station', 8, false, '#64748B'));
    currentPage.commands.push(text(RIGHT, FOOTER_Y, `Page ${index + 1} of ${pages.length}`, 8, false, '#64748B', 'right'));
  });

  return assemblePdf(pages.map(currentPage => currentPage.commands.join('\n')));
}

function tableHeader(page: Page) {
  page.commands.push(rect(LEFT, page.y - 5, RIGHT - LEFT, 19, '#EDEBFF'));
  page.commands.push(text(LEFT + 4, page.y, 'DESCRIPTION', 7, true, '#4F46E5'));
  page.commands.push(text(267, page.y, 'QTY', 7, true, '#4F46E5', 'right'));
  page.commands.push(text(306, page.y, 'UNIT', 7, true, '#4F46E5'));
  page.commands.push(text(379, page.y, 'RATE', 7, true, '#4F46E5', 'right'));
  page.commands.push(text(447, page.y, 'DISC.', 7, true, '#4F46E5', 'right'));
  page.commands.push(text(RIGHT, page.y, 'AMOUNT', 7, true, '#4F46E5', 'right'));
}

function totalRow(page: Page, label: string, value: string) {
  page.commands.push(text(342, page.y, label, 9, false, '#475569'));
  page.commands.push(text(RIGHT - 10, page.y, value, 9, false, '#1F2937', 'right'));
  page.y -= 18;
}

function assemblePdf(pageContents: string[]): string {
  const pageCount = pageContents.length;
  const pageObjectStart = 3;
  const contentObjectStart = pageObjectStart + pageCount;
  const fontRegularObject = contentObjectStart + pageCount;
  const fontBoldObject = fontRegularObject + 1;
  const objects: string[] = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const pageRefs = pageContents.map((_, index) => `${pageObjectStart + index} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`;

  pageContents.forEach((content, index) => {
    const pageObject = pageObjectStart + index;
    const contentObject = contentObjectStart + index;
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularObject} 0 R /F2 ${fontBoldObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  objects[fontRegularObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[fontBoldObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  let pdf = '%PDF-1.4\n%ASCII\n';
  const offsets: number[] = [0];
  for (let objectNumber = 1; objectNumber < objects.length; objectNumber++) {
    offsets[objectNumber] = pdf.length;
    pdf += `${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber < objects.length; objectNumber++) {
    pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function text(
  x: number,
  y: number,
  value: string,
  size: number,
  bold: boolean,
  color: string,
  align: 'left' | 'right' = 'left',
): string {
  const safeValue = pdfText(value);
  const adjustedX = align === 'right' ? x - estimateWidth(safeValue, size, bold) : x;
  return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${colorCommand(color)} 1 0 0 1 ${adjustedX.toFixed(2)} ${y.toFixed(2)} Tm (${safeValue}) Tj ET`;
}

function rect(x: number, y: number, width: number, height: number, color: string): string {
  return `${colorCommand(color)} ${x} ${y} ${width} ${height} re f`;
}

function line(x1: number, y1: number, x2: number, y2: number, color: string): string {
  return `${colorCommand(color)} 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function colorCommand(hex: string): string {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} rg`;
}

function pdfText(value: string): string {
  return value
    .replace(/[\\()]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');
}

function estimateWidth(value: string, size: number, bold: boolean): number {
  return value.length * size * (bold ? 0.56 : 0.52);
}

function wrapText(value: string, maxCharacters: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) {
    lines.push(line);
  }
  return lines;
}

function joinValues(values: Array<string | undefined>): string | undefined {
  const result = values.filter((value): value is string => Boolean(value)).join(', ');
  return result || undefined;
}

function numberText(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

function money(value: number | undefined): string {
  return value === undefined ? '-' : value.toFixed(2);
}
