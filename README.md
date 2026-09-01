# Winsoft Print Station

Android application that acts as a bridge between Winsoft accounting software and physical receipt printers.

Winsoft exports transaction data as CSV files to a configured Google Drive folder.

The application monitors the folder, detects new CSV files, parses and validates the data, generates a configurable receipt, sends it to an office or thermal printer, saves an archival copy of the generated receipt, and moves the processed source file to the `Printed` folder.

## MVP

### Input

**CSV only**

The application must preserve **every column and value** from the original Winsoft CSV. No source field is discarded, even when it is not currently used on the receipt.

### Printers

* Office printer
* Thermal printer

### Receipt

The receipt contains:

**Core fields** — mandatory and always printed.

**Optional fields** — configurable by the user.

The user can choose which available optional Winsoft fields should appear on the receipt without losing the underlying source data.

### Core Workflow

```text
Winsoft
   ↓
CSV
   ↓
Google Drive
   ↓
Background Monitoring
   ↓
Detect New File
   ↓
Parse & Validate
   ↓
Normalize Receipt Data
   ↓
Receipt Template
   ↓
Print Queue
   ↓
Office / Thermal Printer
   ↓
Successful Print
   ↓
Generate & Save Receipt Archive
   ↓
Move Source CSV → Printed
   ↓
Print History
```

## Architecture Principles

The application separates four major concerns:

1. Data ingestion
2. Receipt presentation and generation
3. Printing
4. File and archive management

The core design is:

```text
Raw CSV Data
     ↓
Normalized Receipt
     ↓
Receipt Template
     ↓
Rendered Receipt
     ↓
Printer
```

The original Winsoft source data remains accessible throughout the process so additional fields can be added to receipt templates in the future without changing the data-ingestion system.

## Current Development Status

**Phase 0 — Project Foundation**

The project is currently focused on establishing the Android development environment, project structure, source control, and physical-device build.

Detailed progress is tracked in `ROADMAP.md`.

## Project Documentation

* `AI_INSTRUCTIONS.md` — instructions and development rules for the AI coding agent
* `PRODUCT_SPEC.md` — product requirements and MVP behavior
* `ARCHITECTURE.md` — technical architecture and component boundaries
* `ROADMAP.md` — phase-by-phase implementation checklist
* `test1.csv` — real Winsoft sample data used later for parser development and regression testing
