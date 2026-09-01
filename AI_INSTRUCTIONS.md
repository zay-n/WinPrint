# Winsoft Print Station — AI Instructions

## Project Role

You are the implementation engineer for Winsoft Print Station.

Before making changes, read:

* README.md
* AI_INSTRUCTIONS.md
* PRODUCT_SPEC.md
* ARCHITECTURE.md
* ROADMAP.md

These documents are the source of truth for the project.

---

# Product

Winsoft Print Station is an Android application that receives structured
receipt data exported by Winsoft accounting software, generates a receipt,
prints it through a configured printer, and archives the processed source
file and generated receipt.

Primary workflow:

Winsoft
→ CSV
→ Google Drive
→ Background Monitor
→ Parse
→ Validate
→ Normalize
→ Receipt Template
→ Print Queue
→ Printer
→ Save generated receipt
→ Move source CSV to Printed
→ History

---

# Development Strategy

The project is being built phase-by-phase.

Do NOT implement multiple future phases together.

Always determine the current phase from ROADMAP.md.

Only implement the current phase unless explicitly instructed otherwise.

Before starting a phase:

1. Inspect the current code.
2. Inspect the current ROADMAP.md.
3. Verify what previous phases actually implemented.
4. Identify dependencies.
5. Explain the intended implementation briefly.

After implementation:

1. Run tests.
2. Build when appropriate.
3. Fix errors.
4. Update ROADMAP.md.
5. Report completed work.
6. Report remaining work.
7. Report assumptions and blockers.

Do not silently change architecture.

---

# Current Project Status

The project is currently in:

**PHASE 0 — PROJECT FOUNDATION**

Do not implement receipt parsing, receipt rendering, Google Drive monitoring,
background services, or printer integrations until the roadmap reaches the
appropriate phase.

A real Winsoft sample file named `test1.csv` is available in the project and
will be used later as a regression fixture.

---

# Core Architecture Rules

## 1. Input Format

The MVP supports:

**CSV only**

XLS and XLSX are out of scope for the MVP and should not be implemented
unless explicitly requested later.

The actual Winsoft CSV export is the source of truth for the input schema.

---

## 2. Preserve Every CSV Column

This is a strict architecture requirement.

**No column or value from the original Winsoft CSV may be discarded during
ingestion.**

The parser must preserve:

* every original column name
* every original value
* empty values
* fields that are currently unused
* fields that may be used by future receipt templates

Use a raw source representation so the complete original data remains
accessible.

Conceptually:

Raw CSV Row
→ all source fields preserved
→ normalized known fields
→ Receipt model
→ Receipt Template

Unknown or currently unused source fields must remain available.

---

# 3. Receipt Model

The application must normalize imported data into a common Receipt model.

The rest of the application must operate on the normalized model rather than
directly on CSV rows.

The normalized model should expose commonly used receipt fields while also
retaining complete source data.

---

# 4. Core vs Optional Receipt Fields

Receipt fields are divided into:

### Core fields

These are required and must always be supported by the receipt renderer.

Core fields cannot be disabled by the user.

### Optional fields

These can be enabled or disabled by the user in Receipt Template settings.

Examples may include:

* customer phone
* address
* salesman
* TRN/MTRN
* payment information
* batch
* expiry date
* brand
* weights
* LPO information
* Arabic description
* remarks
* any other mapped Winsoft field

The parser must retain optional data even when the user chooses not to print
it.

Do not discard optional fields during parsing.

---

# 5. Receipt Template

The final visible receipt must not be hard-coded into business logic.

Use a configurable template/settings model.

The template should eventually determine:

* business information
* logo
* paper size
* receipt title
* visible optional fields
* item columns
* customer information
* tax display
* totals display
* footer
* alignment/layout options where practical

Core fields cannot be disabled.

Optional fields can be enabled/disabled.

The field registry should be centralized so the same definitions can power
settings, validation, preview, and rendering.

---

# 6. Printing

Use a printer abstraction.

Do not spread printer-specific logic throughout the application.

Printer architecture:

Printer
├── OfficePrinterAdapter
└── ThermalPrinterAdapter

Office printing:

Use Android printing infrastructure where appropriate.

Thermal printing:

Use a dedicated ESC/POS-compatible adapter where appropriate.

Do not assume all thermal printers behave identically.

The application should support user configuration for both printer types.

---

# 7. Background Monitoring

Do not use a React JavaScript timer as the permanent background mechanism.

The background monitoring system must be designed around Android's native
background/foreground-service capabilities.

The React Native UI must not be solely responsible for monitoring.

The service must be designed to continue monitoring when the UI is not open,
subject to Android platform restrictions and user/device settings.

---

# 8. Google Drive

The application will eventually monitor a configured Drive folder for new CSV
source files.

It should:

* detect new source files
* download them
* process them
* archive them after successful processing

Never destroy source data before successful processing.

---

# 9. Processing and File Safety

The source CSV must remain available until processing has successfully
completed.

Recommended workflow:

DETECTED
→ VALIDATED
→ PARSED
→ QUEUED
→ GENERATED
→ PRINTED
→ ARCHIVED

After successful printing, the application should:

1. Save the generated receipt PDF to the Printed archive.
2. Move the original source CSV into Printed.
3. Record the completed operation in history.

If printing fails:

Do not move the source file.

If receipt generation fails:

Do not move the source file.

If printing succeeds but Drive archiving fails:

Do not print again.

Record the print as successful and retry archiving separately.

---

# 10. Duplicate Protection

Google Drive file ID is the primary identity of an input file.

Receipt transaction number identifies a transaction within the source data.

The application must avoid accidental duplicate printing.

Persist processing state.

If a single CSV contains multiple transactions, each transaction must be
tracked separately while the original file remains the source-file identity.

---

# 11. Real Hardware

The MVP must ultimately be tested on:

* real Android phone
* real Google Drive account
* real Winsoft CSV
* real office printer
* real thermal printer

Do not consider the MVP complete based only on emulator testing.

---

# 12. Scope Control

Do not add:

* XLS/XLSX support
* Firebase
* backend servers
* hosted databases
* authentication systems beyond required Google authentication
* analytics
* payments
* web dashboard
* RDP integration

unless explicitly requested.

The accounting software and RDP environment are external to this application.

---

# 13. AI Development Rules

Never invent:

* API behavior
* Android permissions
* printer protocols
* ESC/POS commands
* Google Drive behavior
* package APIs

When uncertain, inspect documentation or clearly state the uncertainty.

Prefer small, testable implementations.

Do not rewrite working modules unnecessarily.

Do not mark roadmap tasks complete merely because code was written; verify the
feature through an appropriate test or build.

The goal is a reliable operational application, not maximum code volume.
