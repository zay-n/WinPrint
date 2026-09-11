/**
 * WinsoftMapper.ts — Maps a raw Winsoft CSV row to a normalized ReceiptItem
 *
 * Rules (ARCHITECTURE.md §5, §8):
 *  - Map known Winsoft column names → typed fields
 *  - ALL original source columns are preserved in sourceFields — nothing discarded
 *  - Numeric fields are parsed; empty/non-numeric strings become undefined
 *  - Unknown or unmapped columns remain accessible via sourceFields
 */

import type {RawWinsoftRow, ReceiptItem} from '../../models/Receipt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a numeric string. Returns undefined for empty, NaN, or non-numeric values. */
function parseNum(val: string | undefined): number | undefined {
  if (val === undefined || val.trim() === '') {
    return undefined;
  }
  const n = Number(val.trim());
  return isNaN(n) ? undefined : n;
}

/** Return string value trimmed, or undefined if empty. */
function str(val: string | undefined): string | undefined {
  if (val === undefined) {
    return undefined;
  }
  const trimmed = val.trim();
  return trimmed === '' ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// Known Winsoft column → ReceiptItem field mapping
// ---------------------------------------------------------------------------

/**
 * Map one raw CSV row to a ReceiptItem.
 *
 * ALL original fields are preserved in sourceFields — including columns
 * that are not currently mapped to typed properties.
 */
export function mapRowToItem(row: RawWinsoftRow): ReceiptItem {
  return {
    // Preserve every original source column — mandatory per ARCHITECTURE.md §3
    sourceFields: {...row},

    // Mapped known fields
    productId: str(row.productid),
    description: str(row.descript),
    description2: str(row.descript2),
    arabicDescription: str(row.arabicdesc),
    unit: str(row.unit),
    quantity: parseNum(row.quantity),
    rate: parseNum(row.rate),
    amount: parseNum(row.amount),

    vatAmount: parseNum(row.vamount),
    itemDiscount: parseNum(row.itdiscount),

    batch: str(row.batch),
    manufactureDate: str(row.mdate),
    expiryDate: str(row.expdate),
    brand: str(row.brand),
    dimension: str(row.dimention), // Winsoft spells it "dimention"
    netWeight: parseNum(row.ntwt),
    grossWeight: parseNum(row.grwt),
    alias1: str(row.alias1),
    alias2: str(row.alias2),
    alias3: str(row.alias3),
    alias4: str(row.alias4),
    carton: parseNum(row.carton),
  };
}
