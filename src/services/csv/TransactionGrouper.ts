/**
 * TransactionGrouper.ts — Groups raw Winsoft rows into Receipt[]
 *
 * Rules (ARCHITECTURE.md §6, §8):
 *  - Grouping key: TRANSTYPE + TRANSNO (both columns)
 *  - Multiple transactions may exist in one CSV file
 *  - Transaction-level financials repeat on every row — taken from FIRST row only, never summed
 *  - Line-level fields (quantity, rate, amount, vamount, etc.) kept per item
 *  - All source rows are preserved in Receipt.sourceRows
 *  - Insertion order of transactions is preserved
 */

import type {RawWinsoftRow, Receipt} from '../../models/Receipt';
import {mapRowToItem} from './WinsoftMapper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(val: string | undefined): string | undefined {
  if (val === undefined) {
    return undefined;
  }
  const t = val.trim();
  return t === '' ? undefined : t;
}

function parseNum(val: string | undefined): number | undefined {
  if (val === undefined || val.trim() === '') {
    return undefined;
  }
  const n = Number(val.trim());
  return isNaN(n) ? undefined : n;
}

/** Build the transaction group key from a row. */
function transactionKey(row: RawWinsoftRow): string {
  const tt = (row.transtype ?? '').trim();
  const tn = (row.transno ?? '').trim();
  return `${tt}::${tn}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Group raw CSV rows into normalized Receipt objects.
 *
 * @param rows - Output of parseCsv().rows
 * @returns Receipt[] in the order transactions first appear in the CSV.
 */
export function groupTransactions(rows: RawWinsoftRow[]): Receipt[] {
  // Map: groupKey → Receipt (mutable during construction)
  const map = new Map<string, Receipt>();
  const order: string[] = []; // preserve insertion order

  for (const row of rows) {
    const key = transactionKey(row);

    if (!map.has(key)) {
      order.push(key);

      // Build transaction-level data from the FIRST row for this transaction.
      // These fields repeat on every line — must NOT be summed.
      const receipt: Receipt = {
        sourceRows: [],
        transactionType: (row.transtype ?? '').trim(),
        transactionNumber: (row.transno ?? '').trim(),
        date: str(row.date),

        customer: {
          name: str(row.name),
          address1: str(row.add1),
          address2: str(row.add2),
          city: str(row.city),
          country: str(row.country),
          phone: str(row.tel),
          fax: str(row.faxtelex),
          accountType: str(row.acctype),
          accountNumber: str(row.accno),
        },

        items: [],

        // Transaction-level financials — from FIRST row only
        financials: {
          subtotal: parseNum(row.subtotalamt),
          discountAmount: parseNum(row.discountamt),
          freight: parseNum(row.freightamt),
          taxableAmount: parseNum(row.taxableamt),
          vatAmount: parseNum(row.vatamt),
          vatRate: parseNum(row.vper),
          rounding: parseNum(row.roundamt),
          total: parseNum(row.iamount),
        },

        additional: {
          salesman: str(row.msalesman),
          trn: str(row.mtrn),
          lpoNumber: str(row.lpono),
          lpoDate: str(row.lpodate),
          remarks: str(row.rem),
          area: str(row.area),
          supplyDate: str(row.supplydate),
          tranCode: str(row.trancode),
          taxCode: str(row.taxcode),
          vatTag: str(row.vtag),
          countryCode: str(row.cntrycode),
          msupCountry: str(row.msupcountry),
          vatStatus: str(row.vatstatus),
          trnTerm: parseNum(row.trnterm),
        },
      };

      map.set(key, receipt);
    }

    const receipt = map.get(key)!;

    // Always push raw source row — all columns preserved
    receipt.sourceRows.push({...row});

    // Add normalized line item
    receipt.items.push(mapRowToItem(row));
  }

  return order.map(k => map.get(k)!);
}
