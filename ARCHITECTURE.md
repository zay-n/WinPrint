# Winsoft Print Station — Architecture

## 1. High-Level Receipt Processing Pipeline

Input File (CSV)
↓
CSV Reader
↓
Raw Source Data
↓
Schema Validation
↓
Column Mapping
↓
Transaction Grouper
↓
Normalized Receipt[]
↓
Receipt Template Engine
↓
Rendered Receipt
↓
Print Queue
↓
Printer Adapter
↓
Successful Print
↓
Archive / Printed

---

## 2. Input Format

### MVP

CSV only.

XLS and XLSX are out of scope for the MVP.

The actual Winsoft CSV headers and values are the source of truth.

The application must not depend on the original Visual FoxPro field-definition
text when implementing the CSV reader.

---

## 3. Raw Source Data Preservation

Every column and value from the original Winsoft CSV must be preserved.

No source column may be discarded merely because it is not currently used by
the receipt.

This is important because the user may later choose additional Winsoft fields
to display on the receipt.

Conceptually:

Raw CSV Row
├── all original columns and values
└── normalized known fields

A suitable raw-row representation is conceptually:

```typescript
interface RawWinsoftRow {
  [columnName: string]: unknown;
}
```

The normalized receipt may also retain access to the original source fields.

This means:

ALL CSV DATA
├──→ normalized/common Receipt fields
└──→ preserved raw/source fields

---

## 4. CSV Reader

Responsibilities:

- read CSV files
- detect headers
- parse rows
- handle quoted values
- handle empty values
- normalize whitespace
- preserve original column names
- preserve original values
- report malformed rows clearly

The CSV reader should not contain printer or UI logic.

---

## 5. Column Mapping

The application maintains a configurable mapping:

Winsoft Column → Internal Field

Examples:

TRANSNO → transactionNumber
DATE → date
NAME → customer.name
DESCRIPT → items[].description
QUANTITY → items[].quantity
RATE → items[].rate
AMOUNT → items[].amount
MTRN → additional.trn
msalesman → additional.salesman

Mappings must be stored as configuration.

Unknown columns must remain available through the preserved source-field data.

---

## 6. Transaction Grouper

Input:

Raw rows[]

Output:

Receipt[]

Initial grouping key:

TRANSTYPE + TRANSNO

The parser must support multiple transactions in one CSV file.

Transaction-level fields must not be summed across rows when they are repeated
on each line.

Line-level fields are retained per item.

Example:

CSV
├── C610837
│   ├── Item 1
│   ├── Item 2
│   └── Item 3
├── C610838
│   ├── Item 1
│   └── Item 2
└── C610839
    └── Item 1

becomes:

Receipt[]
├── C610837
├── C610838
└── C610839

---

## 7. Normalized Receipt Model

The application converts raw Winsoft rows into a normalized Receipt model.

Conceptually:

```typescript
interface Receipt {
  transactionType: string;
  transactionNumber: string;
  date?: string;

  customer: {
    name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    country?: string;
    phone?: string;
  };

  items: ReceiptItem[];

  financials: {
    subtotal?: number;
    discount?: number;
    freight?: number;
    taxableAmount?: number;
    vat?: number;
    vatRate?: number;
    rounding?: number;
    total?: number;
  };

  additional?: {
    salesman?: string;
    trn?: string;
    lpoNumber?: string;
    lpoDate?: string;
    paymentMethod?: string;
    accountType?: string;
    accountNumber?: string;
    remarks?: string;
  };

  sourceFields?: Record<string, unknown>;
}
```

A line item conceptually contains:

```typescript
interface ReceiptItem {
  productId?: string;
  description?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  unit?: string;

  taxableAmount?: number;
  vatAmount?: number;
  itemDiscount?: number;

  batch?: string;
  manufactureDate?: string;
  expiryDate?: string;
  brand?: string;
  dimension?: string;

  netWeight?: number;
  grossWeight?: number;
  arabicDescription?: string;

  sourceFields?: Record<string, unknown>;
}
```

The exact implementation may differ, but all original source data must remain
accessible.

---

## 8. Financial Field Handling

The Winsoft CSV contains both line-level and transaction-level financial data.

Examples of likely line-level values:

- QUANTITY
- RATE
- AMOUNT
- TaxableAmt
- VAMOUNT
- ITDISCOUNT

Examples of transaction-level values:

- subtotalamt
- discountAmt
- freightamt
- VATAMT
- ROUNDAMT
- Iamount

Repeated transaction-level values must not be summed across rows.

The source accounting values remain authoritative.

The application should detect obvious inconsistencies rather than silently
changing accounting data.

---

# 9. Receipt Template Engine

The receipt template is separate from the Receipt data model.

Receipt:

DATA

ReceiptTemplate:

PRESENTATION

The template determines what gets displayed and how it is laid out.

Architecture:

Normalized Receipt
+
ReceiptTemplate
↓
Renderer

---

## 10. Core Receipt Fields

Core fields are mandatory and cannot be disabled.

Initial core fields:

- Receipt Number
- Date
- Customer Name
- Item Description
- Quantity
- Rate
- Amount
- Subtotal
- VAT
- Total

The exact visual arrangement may differ between office and thermal layouts.

---

## 11. Optional Receipt Fields

Optional source fields remain stored even when they are not selected for
printing.

Examples:

- Customer Phone
- Customer Address
- City
- Country
- Salesman
- TRN/MTRN
- Payment Method
- Account Number
- Discount
- Freight
- Taxable Amount
- VAT Rate
- Batch
- Manufacture Date
- Expiry Date
- Brand
- Dimension
- Net Weight
- Gross Weight
- LPO Number
- LPO Date
- Arabic Description
- Remarks
- Delivery information
- Marks
- Additional aliases
- Any other preserved Winsoft field

The user must be able to enable or disable optional fields through receipt
template configuration.

---

## 12. Field Registry

Maintain a central field registry.

Conceptual structure:

Field Registry
├── Core
│   ├── receiptNumber
│   ├── date
│   ├── customerName
│   ├── items
│   ├── subtotal
│   ├── vat
│   └── total
│
└── Optional
    ├── customerPhone
    ├── address
    ├── city
    ├── country
    ├── salesman
    ├── trn
    ├── paymentMethod
    ├── batch
    ├── expiryDate
    ├── brand
    ├── weight
    ├── remarks
    └── other mapped Winsoft fields

The field registry should power:

- template settings UI
- validation
- rendering
- preview

Avoid maintaining field definitions separately in multiple places.

---

## 13. User-Configurable Receipt Fields

The user can choose which optional fields are printed.

Example:

```json
{
  "customerPhone": true,
  "customerAddress": true,
  "salesman": false,
  "trn": true,
  "batch": false,
  "expiryDate": false,
  "brand": true
}
```

Core fields remain locked ON.

Optional fields are configurable.

The UI should ultimately allow users to select fields from the available mapped
Winsoft data.

---

## 14. Receipt Template Configuration

The template may contain:

### Business information

- business name
- address
- phone
- email
- TRN
- logo

### Receipt information

- receipt title
- transaction number
- date

### Customer information

- customer fields selected by the user

### Item columns

User-selectable item details, such as:

- Description
- Quantity
- Unit
- Rate
- Amount
- Batch
- VAT
- Brand
- Arabic description

### Financial information

- subtotal
- discount
- freight
- taxable amount
- VAT
- rounding
- total

### Footer

- thank-you message
- terms
- contact information

---

## 15. Renderers

Normalized Receipt
+
ReceiptTemplate
↓
Renderer

Two primary renderers:

OfficeRenderer
ThermalRenderer

Both consume the same normalized Receipt and template configuration.

The business data must not be duplicated between renderer implementations.

---

## 16. Office Printer

Flow:

Receipt
↓
Office Renderer
↓
Printable document / PDF
↓
Android Print Framework
↓
Office Printer

Office printing should use Android printing infrastructure where appropriate.

The app should not assume every office printer supports direct Bluetooth PDF
printing.

---

## 17. Thermal Printer

Flow:

Receipt
↓
Thermal Renderer
↓
58mm / 80mm thermal layout
↓
ESC/POS / image pipeline
↓
Thermal Printer Adapter
↓
Printer

The thermal implementation should support a reference printer first and remain
isolated behind the printer abstraction.

---

## 18. Printer Abstraction

The rest of the application must not depend directly on a specific printer.

Conceptually:

```text
Printer
├── OfficePrinterAdapter
└── ThermalPrinterAdapter
```

The printer abstraction should provide operations such as:

- connect
- disconnect
- status
- testPrint
- print

Printer-specific logic must stay inside the appropriate adapter.

---

## 19. Background Monitoring

The React Native UI must not be solely responsible for continuous monitoring.

The background monitoring system should use appropriate native Android
background/foreground-service architecture.

Conceptually:

React Native UI
        ↕
Monitoring State
        ↕
Android Background Service
        ↓
Drive Monitor
        ↓
Receipt Queue

The service must be capable of continuing monitoring when the app UI is not
open, subject to Android operating-system restrictions.

---

## 20. Google Drive

The application monitors a configured Drive folder for new CSV files.

Flow:

Google Drive
↓
File Detector
↓
CSV Download
↓
CSV Parser
↓
Receipt[]

The Drive layer should not know how receipts are rendered or printed.

---

## 21. Local Receipt Queue

The queue operates on normalized Receipt jobs.

Recommended states:

DETECTED
→ DOWNLOADING
→ VALIDATING
→ PARSING
→ QUEUED
→ GENERATING
→ PRINTING
→ PRINTED
→ ARCHIVED

Failure states may include:

INVALID
PARSE_FAILED
GENERATION_FAILED
PRINT_FAILED
MOVE_FAILED

A failed job must remain recoverable.

---

## 22. Duplicate Protection

Google Drive file ID is the primary identity of a source file.

Transaction identity is based on:

TRANSTYPE + TRANSNO

The system must prevent accidental duplicate printing.

Persistent processing state must survive:

- app restart
- service restart
- phone restart where supported

A successful print must not be repeated merely because a later archive/move
operation fails.

---

## 23. Archive Flow

After successful printing:

Successful Print
↓
Save generated receipt PDF
↓
Move source CSV to Printed
↓
Record history

Recommended Drive structure:

Winsoft Receipts/
├── Incoming/
└── Printed/

Example:

Incoming/
└── receipt_001.csv

After successful processing:

Printed/
├── receipt_001.csv
└── receipt_001.pdf

The source file must not be moved before successful processing.

If printing succeeds but the source-file move fails, the receipt remains
PRINTED and the move is retried separately.

Do not reprint the receipt because of an archive failure.

---

## 24. Important Separation of Concerns

The project has four major independent concerns:

1. Data ingestion
2. Receipt presentation/generation
3. Printing
4. File/archive management

These concerns should communicate through clear interfaces and models.

Do not tightly couple:

- CSV parsing with printing
- receipt templates with Google Drive
- printer logic with UI
- background monitoring with receipt rendering

The core data flow is:

CSV
→ Raw Source Data
→ Normalized Receipt
→ Receipt Template
→ Rendered Receipt
→ Print Queue
→ Printer
→ Archive

---

## 25. Architectural Principle

The most important design rule is:

DATA ≠ PRESENTATION ≠ PRINTING

Raw Winsoft data is preserved.

Normalized Receipt data provides a consistent application model.

ReceiptTemplate controls what the user wants printed.

Renderer converts the template and receipt data into a printable format.

PrinterAdapter handles the physical printer.

This separation allows new Winsoft fields, receipt templates, and printer types
to be added without rewriting the entire application.
