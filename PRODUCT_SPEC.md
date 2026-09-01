# Winsoft Print Station — Product Specification

## 1. Product Vision

Winsoft Print Station is an Android application that bridges an existing
Winsoft accounting system with physical printers.

The Winsoft accounting software remains unchanged.

Winsoft exports structured transaction data as CSV.

The mobile application acts as an automated print station.

The ideal workflow is:

Generate/export transaction data in Winsoft
→ CSV appears in Google Drive
→ application detects the CSV
→ transaction data is parsed
→ receipt is generated from a configurable template
→ receipt is printed
→ generated receipt is archived
→ source CSV is moved to Printed
→ history is updated

---

# 2. Primary User

The primary user is the operator using Winsoft accounting software.

The operator should not need to manually transfer receipt files to a phone.

The application should be capable of operating as a dedicated print station
with background monitoring enabled.

---

# 3. Core Workflow

## Normal flow

1. Winsoft exports a CSV containing transaction data.
2. CSV is saved into the configured Google Drive folder.
3. Background monitoring detects the CSV.
4. CSV is downloaded.
5. CSV is validated.
6. Transactions are parsed and normalized.
7. Each transaction enters the local print queue.
8. The configured receipt template is applied.
9. A receipt is generated.
10. The receipt is printed.
11. Print succeeds.
12. Generated receipt PDF is saved to the Printed archive.
13. Original CSV is moved to Printed.
14. History is updated.

---

# 4. Setup Flow

First launch:

1. Welcome
2. Sign in with Google
3. Grant required Drive access
4. Select Winsoft CSV folder
5. Configure receipt/business details
6. Configure receipt fields/template
7. Select printer type
8. Configure printer
9. Test printer
10. Configure auto-print
11. Enable monitoring
12. Show dashboard

---

# 5. Dashboard

The dashboard should show:

- Monitoring status
- Drive status
- Printer status
- Current printer
- Pending receipts
- Failed receipts
- Last printed receipt
- Today's print count

Example:

Monitoring
● ACTIVE

Drive
✓ Connected

Printer
✓ Connected

Pending
0

Printed Today
27

Last Receipt
INV-10492

---

# 6. Receipt Queue

Each receipt/transaction should have:

- source file ID
- source file name
- transaction number
- transaction type
- Drive location
- creation timestamp
- local download path where applicable
- status
- print attempts
- generated receipt path where applicable
- printed timestamp
- error information

Statuses:

DETECTED
DOWNLOADING
VALIDATING
PARSING
QUEUED
GENERATING
PRINTING
PRINTED
FAILED
ARCHIVED

---

# 7. Input Format

## MVP

CSV only.

XLS and XLSX are not required and are out of scope for the MVP.

The application must use the actual Winsoft CSV headers as the source of truth.

---

# 8. CSV Data Preservation

The Winsoft CSV may contain many fields, including fields that are not needed
for the initial receipt.

**All columns and values must be preserved.**

The application must not discard an unused or unknown source field during
ingestion.

The architecture should maintain:

1. Raw source data containing every original CSV column/value.
2. Normalized receipt data containing commonly used fields.
3. Receipt template configuration controlling what is printed.

This makes future receipt customization possible without changing the source
data pipeline.

---

# 9. Winsoft CSV Transaction Structure

The current real sample indicates that rows represent transaction line items.

The initial transaction grouping key is:

TRANSTYPE + TRANSNO

The parser must support the possibility that one CSV file contains multiple
transactions.

Example:

CSV
├── Transaction A
│   ├── Item 1
│   ├── Item 2
│   └── Item 3
├── Transaction B
│   ├── Item 1
│   └── Item 2
└── Transaction C
    └── Item 1

Result:

Receipt[]
├── Transaction A
├── Transaction B
└── Transaction C

---

# 10. Receipt Data Model

A normalized Receipt should contain:

## Transaction

- transactionType
- transactionNumber
- date

## Customer

- name
- address1
- address2
- city
- country
- phone

## Items

Each item may contain:

- productId
- description
- quantity
- rate
- amount
- unit
- taxableAmount
- vatAmount
- itemDiscount
- batch
- manufactureDate
- expiryDate
- brand
- dimension
- netWeight
- grossWeight
- arabicDescription

## Financials

- subtotal
- discount
- freight
- taxableAmount
- VAT
- VAT rate
- rounding
- total

## Additional

- salesman
- LPO number
- LPO date
- TRN/MTRN
- payment/account information
- remarks
- other mapped Winsoft data

## Raw Source Data

The receipt/transaction must retain access to all original source fields from
the CSV.

No source column should be lost.

---

# 11. Core Receipt Fields

Core fields are mandatory and cannot be disabled.

At minimum:

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

The implementation may add other mandatory fields if required by the actual
receipt design, but the user must not be able to turn off the fundamental
receipt information.

---

# 12. Optional Receipt Fields

Optional fields are user configurable.

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
- Product aliases
- Area
- Tax Code
- Any other available Winsoft source field

The parser retains these fields regardless of whether they are enabled for
printing.

---

# 13. Receipt Template Configuration

The user should be able to configure:

## Business information

- business name
- address
- phone
- email
- TRN
- logo

## Layout

- receipt title
- paper type
- 58mm
- 80mm
- office/A4/A5 where appropriate

## Visible fields

Core fields:
locked ON

Optional fields:
user configurable

## Item columns

The user may choose supported item-level details such as:

- Description
- Quantity
- Unit
- Rate
- Amount
- Batch
- VAT
- Brand
- Expiry
- other mapped fields

## Footer

- thank-you message
- terms
- contact details
- other configured footer content

---

# 14. Receipt Preview

The application should preview the receipt using the selected template.

The preview must use the same normalized Receipt object and template
configuration that the printer uses.

---

# 15. Printer Types

## Office Printer

Supported through Android printing infrastructure.

Configuration:

- select printer
- test print

The application should not assume that an office printer accepts direct
Bluetooth PDF transmission.

## Thermal Printer

Configuration:

- Bluetooth or Wi-Fi where supported
- printer discovery
- selected printer
- paper width
- 58mm / 80mm
- test print

Thermal printing uses a dedicated printer adapter.

---

# 16. Auto Print

Settings:

Auto Print:
ON / OFF

OFF:

New receipt
→ notification
→ user reviews
→ user presses Print

ON:

New receipt
→ generate
→ queue
→ print automatically

---

# 17. Notifications

The app should provide:

Monitoring notification:

"Winsoft Print is monitoring receipts."

New receipt notification:

"New receipt ready to print."

Failure notification:

"Receipt failed to print."

---

# 18. File Organization

Recommended Google Drive structure:

/Winsoft Receipts/
/Winsoft Receipts/Printed/

If practical, incoming source files may be kept in an Incoming subfolder:

/Winsoft Receipts/Incoming/
/Winsoft Receipts/Printed/

The application should support the configured source folder without requiring
Winsoft itself to change beyond the chosen export location.

After successful processing, the Printed area should contain:

- original source CSV
- generated receipt PDF

Example:

Printed/
├── receipt_001.csv
└── receipt_001.pdf

For a CSV containing multiple transactions, one source CSV may produce multiple
generated receipt PDFs.

---

# 19. Failure Handling

## Network unavailable

Keep receipt in queue.

Retry later.

## Printer disconnected

Keep the receipt queued or mark it FAILED according to implementation.

Allow retry.

## Google Drive unavailable

Keep monitoring service alive and retry.

## Download failure

Do not generate/print.

Retry download.

## CSV validation failure

Do not print.

Keep the source file available and show the validation error.

## CSV parsing failure

Do not print.

Keep the source file available and allow retry.

## Print failure

Do not move the source file.

Keep receipt available for retry.

## Print succeeds but Drive archive/move fails

Do NOT print again.

Record the print as successful.

Retry only the archive/move operation.

---

# 20. Duplicate Prevention

The Google Drive file ID is the unique identity of the source file.

The transaction number, together with transaction type where needed, identifies
a transaction inside the source data.

The same receipt transaction must never be printed twice accidentally.

Persistent local state must survive application restarts.

---

# 21. MVP Acceptance Criteria

The MVP passes only when:

1. User signs into Google.
2. User selects the Winsoft CSV folder.
3. User configures business/receipt settings.
4. User configures a printer.
5. User can select optional receipt fields.
6. User enables monitoring.
7. App UI is closed/minimized.
8. Winsoft exports a real CSV.
9. CSV appears in Drive.
10. Android monitoring service detects it.
11. CSV is downloaded and parsed.
12. All source CSV fields remain preserved.
13. Transactions are correctly separated.
14. Receipt is generated from the configured template.
15. Receipt preview is available.
16. Receipt is printed.
17. Print success is recorded.
18. Generated receipt PDF is saved.
19. Original CSV is moved to Printed.
20. Receipt is not printed again.
21. Restarting the application/phone does not corrupt processing state.
22. Printer failure allows retry.
23. Office printer architecture works.
24. Thermal printer architecture works.

---

# 22. MVP Out of Scope

The MVP does not require:

- XLS support
- XLSX support
- Firebase
- remote backend
- hosted database
- web dashboard
- payments
- analytics
- accounting features
- RDP integration
- multi-company SaaS
