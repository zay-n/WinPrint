/**
 * Receipt.ts — Winsoft Print Station data models
 *
 * Architecture (see ARCHITECTURE.md §3, §7):
 *
 *   Raw CSV row → RawWinsoftRow (every column preserved)
 *                 ↓
 *                 WinsoftMapper
 *                 ↓
 *               Receipt (normalized) + sourceRows (raw)
 *
 * No source column from the Winsoft CSV may be discarded.
 */

// ---------------------------------------------------------------------------
// Raw source row — every CSV column preserved as-is
// ---------------------------------------------------------------------------

/** A single row from the Winsoft CSV, keyed by original column name. */
export interface RawWinsoftRow {
  [columnName: string]: string;
}

// ---------------------------------------------------------------------------
// Normalized line item
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  /** Original CSV column values for this line item — nothing discarded. */
  sourceFields: RawWinsoftRow;

  // Core item fields (normalized from known Winsoft columns)
  productId?: string;          // productid
  description?: string;        // descript
  description2?: string;       // descript2
  arabicDescription?: string;  // arabicdesc
  unit?: string;               // unit
  quantity?: number;           // quantity
  rate?: number;               // rate
  amount?: number;             // amount

  // Per-item financials
  vatAmount?: number;          // vamount (line-level)
  itemDiscount?: number;       // itdiscount

  // Optional item fields
  batch?: string;              // batch
  manufactureDate?: string;    // mdate
  expiryDate?: string;         // expdate
  brand?: string;              // brand
  dimension?: string;          // dimention (sic — Winsoft spelling)
  netWeight?: number;          // ntwt
  grossWeight?: number;        // grwt
  alias1?: string;             // alias1
  alias2?: string;             // alias2
  alias3?: string;             // alias3
  alias4?: string;             // alias4
  carton?: number;             // carton
}

// ---------------------------------------------------------------------------
// Normalized receipt (one transaction = one receipt)
// ---------------------------------------------------------------------------

export interface Receipt {
  /**
   * All raw CSV rows that make up this transaction.
   * Preserves every original column — nothing is discarded.
   */
  sourceRows: RawWinsoftRow[];

  // Transaction identity
  transactionType: string;     // transtype
  transactionNumber: string;   // transno
  date?: string;               // date

  // Customer
  customer: {
    name?: string;             // name
    address1?: string;         // add1
    address2?: string;         // add2
    city?: string;             // city
    country?: string;          // country
    phone?: string;            // tel
    fax?: string;              // faxtelex
    accountType?: string;      // acctype
    accountNumber?: string;    // accno
  };

  // Line items
  items: ReceiptItem[];

  /**
   * Transaction-level financials.
   * These values repeat on every row in the CSV — taken from the FIRST row only.
   * Must NEVER be summed across rows.
   */
  financials: {
    subtotal?: number;         // subtotalamt
    discountAmount?: number;   // discountamt
    freight?: number;          // freightamt
    taxableAmount?: number;    // taxableamt  (transaction-level — first row)
    vatAmount?: number;        // vatamt
    vatRate?: number;          // vper (%)
    rounding?: number;         // roundamt
    total?: number;            // iamount
  };

  // Additional / optional fields
  additional: {
    salesman?: string;         // msalesman
    trn?: string;              // mtrn
    lpoNumber?: string;        // lpono
    lpoDate?: string;          // lpodate
    remarks?: string;          // rem
    area?: string;             // area
    supplyDate?: string;       // supplydate
    tranCode?: string;         // trancode
    taxCode?: string;          // taxcode
    vatTag?: string;           // vtag
    countryCode?: string;      // cntrycode
    msupCountry?: string;      // msupcountry
    vatStatus?: string;        // vatstatus
    trnTerm?: number;          // trnterm
  };

  // Source file metadata — populated by DriveService after download
  sourceFile?: {
    driveFileId?: string;
    driveFileName?: string;
    downloadedPath?: string;
  };
}
