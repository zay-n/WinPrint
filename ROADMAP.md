# Winsoft Print Station — Roadmap

## PROJECT STATUS

**Current Phase: 1 — Application Shell** ✅ Complete (build verified)

The project is currently in Phase 1. Phase 1 has been implemented and the
debug APK builds successfully.

Do not begin later phases until the current phase has been verified on a
real Android phone.

---

# PHASE 0 — PROJECT FOUNDATION

Goal:
Prepare the development environment, repository, Android project foundation,
and physical-device workflow.

- [x] 0.1 Inspect and verify development environment
- [x] 0.2 Verify Node.js/npm — Node 22.19.0, npm 10.9.3
- [x] 0.3 Verify Java/JDK — JDK 17.0.12, JAVA_HOME confirmed
- [x] 0.4 Verify Android Studio and Android SDK — SDK 35, Build Tools 36.0.0, NDK 27.1.12297006
- [ ] 0.5 Verify ADB and physical Android device workflow — ADB works; emulator only tested so far
- [x] 0.6 Initialize Git repository — C:/zay/WinPrint (separate from C:/zay)
- [x] 0.7 Create React Native + TypeScript Android project — React Native 0.87.1
- [x] 0.8 Confirm debug build — BUILD SUCCESSFUL in 7m 7s; APK installed on emulator-5554 (Medium_Phone_API_36.1)
- [ ] 0.9 Install/run debug build on physical Android phone — NOT YET TESTED on real hardware
- [x] 0.10 Add/verify project documentation — README, AI_INSTRUCTIONS, PRODUCT_SPEC, ARCHITECTURE, ROADMAP present
- [x] 0.11 Add test1.csv as a regression fixture — present in project root
- [x] 0.12 Create initial project baseline commit — Phase 0: Initialize React Native project

PHASE 0 COMPLETE WHEN:

The project builds successfully and runs on a real Android phone, the
repository is initialized, the documentation is present, and the development
environment is verified.

---

# PHASE 1 — APPLICATION SHELL

Goal:
Create the basic application structure and navigation without implementing
production data/printing logic.

- [x] 1.1 Dashboard — vibrant dark dashboard with status cards, metrics, setup checklist
- [x] 1.2 Setup screen — inline on Dashboard as a 4-step checklist (placeholder)
- [x] 1.3 Receipt queue screen — empty state, summary row, status legend
- [x] 1.4 History screen — empty state, filter chips, feature preview
- [x] 1.5 Settings screen — grouped Drive/Template/Printer/Monitoring/App sections
- [x] 1.6 Printer configuration screen — placeholder in Settings group (Phase 9)
- [x] 1.7 Receipt template configuration screen — placeholder in Settings group (Phase 5)
- [x] 1.8 Basic navigation — React Navigation bottom-tab + native-stack per tab
- [x] 1.9 Monitoring status UI — status card on Dashboard (inactive placeholder)
- [x] 1.10 Drive status UI — status card on Dashboard + Drive screen banner
- [x] 1.11 Printer status UI — status card on Dashboard (inactive placeholder)

Build result: BUILD SUCCESSFUL in 5m 20s (137 tasks)
TypeScript: 0 errors
Jest: 1/1 passed

PHASE 1 COMPLETE WHEN:

All core screens exist and navigation works on a physical device.

Note: 0.9 (physical device test) and 1 (physical-device navigation) remain
untested on real hardware — emulator/build verification only so far.

---

# PHASE 2 — GOOGLE AUTHENTICATION

- [ ] 2.1 Google Cloud project
- [ ] 2.2 OAuth configuration
- [ ] 2.3 Google Sign-In
- [ ] 2.4 Required Drive permission
- [ ] 2.5 Secure credential/token storage
- [ ] 2.6 Sign-out
- [ ] 2.7 Authentication error handling

PHASE 2 COMPLETE WHEN:

A real Google account can authenticate and the application can obtain the
required Drive access.

---

# PHASE 3 — GOOGLE DRIVE

Goal:
Connect to the configured source folder and transfer CSV files.

- [ ] 3.1 Drive API client
- [ ] 3.2 Folder listing
- [ ] 3.3 Folder selection
- [ ] 3.4 Save folder configuration
- [ ] 3.5 File listing
- [ ] 3.6 CSV detection
- [ ] 3.7 File metadata retrieval
- [ ] 3.8 CSV download
- [ ] 3.9 Printed folder creation
- [ ] 3.10 File movement
- [ ] 3.11 Drive error handling

PHASE 3 COMPLETE WHEN:

A real Winsoft CSV can be found and downloaded from the configured Drive
folder.

---

# PHASE 4 — WINsoft CSV ENGINE

Goal:
Convert the real Winsoft CSV into reliable normalized Receipt objects while
preserving every original source field.

- [ ] 4.1 Analyze real Winsoft CSV
- [ ] 4.2 Define actual CSV schema
- [ ] 4.3 Preserve all source columns
- [ ] 4.4 Implement raw source row model
- [ ] 4.5 Implement CSV reader
- [ ] 4.6 Header validation
- [ ] 4.7 String normalization
- [ ] 4.8 Numeric normalization
- [ ] 4.9 Date normalization
- [ ] 4.10 Empty value handling
- [ ] 4.11 Column mapping
- [ ] 4.12 Schema validation
- [ ] 4.13 Transaction grouping
- [ ] 4.14 Header/line separation
- [ ] 4.15 Receipt model
- [ ] 4.16 Receipt mapper
- [ ] 4.17 Retain unmapped/optional source fields
- [ ] 4.18 Sample-file tests
- [ ] 4.19 Multi-transaction tests
- [ ] 4.20 Validation/error tests

PHASE 4 COMPLETE WHEN:

The real test CSV produces correct Receipt[] objects, all original columns are
preserved, transaction grouping works, and automated tests pass.

---

# PHASE 5 — RECEIPT TEMPLATE ENGINE

Goal:
Allow the user to decide which optional data appears on the receipt while
keeping core fields mandatory.

- [ ] 5.1 Central field registry
- [ ] 5.2 Core field definitions
- [ ] 5.3 Optional field definitions
- [ ] 5.4 Source-field availability model
- [ ] 5.5 Template configuration model
- [ ] 5.6 Business information settings
- [ ] 5.7 Optional field selection
- [ ] 5.8 Core fields locked ON
- [ ] 5.9 Item column selection
- [ ] 5.10 Footer configuration
- [ ] 5.11 Template persistence
- [ ] 5.12 Template validation
- [ ] 5.13 Receipt preview configuration

PHASE 5 COMPLETE WHEN:

A user can configure optional printable fields while all core fields remain
mandatory.

---

# PHASE 6 — RECEIPT GENERATION

Goal:
Generate a consistent receipt from Receipt + Template.

- [ ] 6.1 Office receipt layout
- [ ] 6.2 Thermal receipt layout
- [ ] 6.3 58mm layout
- [ ] 6.4 80mm layout
- [ ] 6.5 PDF generation
- [ ] 6.6 Template rendering
- [ ] 6.7 Receipt preview
- [ ] 6.8 Preview/render consistency
- [ ] 6.9 Real sample verification
- [ ] 6.10 Generated receipt archive naming

PHASE 6 COMPLETE WHEN:

The sample Winsoft data produces a correct preview and archival PDF according
to the configured template.

---

# PHASE 7 — LOCAL RECEIPT QUEUE

Goal:
Build persistent, duplicate-safe transaction processing.

- [ ] 7.1 Local persistence
- [ ] 7.2 Receipt/job state machine
- [ ] 7.3 FIFO queue
- [ ] 7.4 Duplicate prevention
- [ ] 7.5 Retry
- [ ] 7.6 Restart recovery
- [ ] 7.7 Queue UI
- [ ] 7.8 Print attempt tracking

PHASE 7 COMPLETE WHEN:

Receipt jobs survive restarts and cannot be accidentally duplicated.

---

# PHASE 8 — BACKGROUND MONITORING

Goal:
Detect new CSV files while the main application UI is not open.

- [ ] 8.1 Native Android service architecture
- [ ] 8.2 Foreground service where required
- [ ] 8.3 Required permissions
- [ ] 8.4 Monitoring lifecycle
- [ ] 8.5 Drive polling
- [ ] 8.6 New-file detection
- [ ] 8.7 Persistent monitoring notification
- [ ] 8.8 App-minimized testing
- [ ] 8.9 App-closed testing
- [ ] 8.10 Screen-lock testing
- [ ] 8.11 Recovery testing
- [ ] 8.12 Network interruption handling

PHASE 8 COMPLETE WHEN:

The application reliably monitors the Drive source folder while the UI is
not open, within Android platform constraints.

---

# PHASE 9 — OFFICE PRINTER

- [ ] 9.1 Printer abstraction
- [ ] 9.2 OfficePrinterAdapter
- [ ] 9.3 Android Print Framework
- [ ] 9.4 Printer selection
- [ ] 9.5 Printer status
- [ ] 9.6 Test print
- [ ] 9.7 Receipt print
- [ ] 9.8 Cancellation handling
- [ ] 9.9 Error handling
- [ ] 9.10 Real office-printer test

PHASE 9 COMPLETE WHEN:

A real generated receipt successfully prints to the reference office printer.

---

# PHASE 10 — THERMAL PRINTER

Goal:
Support a reference thermal printer and design the adapter for future
compatibility.

- [ ] 10.1 Identify reference thermal printer
- [ ] 10.2 Confirm connection method
- [ ] 10.3 Bluetooth support
- [ ] 10.4 Wi-Fi support where required
- [ ] 10.5 ESC/POS adapter
- [ ] 10.6 58mm support
- [ ] 10.7 80mm support
- [ ] 10.8 Test print
- [ ] 10.9 Receipt print
- [ ] 10.10 Disconnect/reconnect
- [ ] 10.11 Error handling
- [ ] 10.12 Real thermal-printer test

PHASE 10 COMPLETE WHEN:

A real generated receipt successfully prints to the reference thermal
printer.

---

# PHASE 11 — AUTOMATIC PRINTING & ARCHIVING

Goal:
Complete the end-to-end automated flow.

- [ ] 11.1 Auto-print setting
- [ ] 11.2 Queue processing
- [ ] 11.3 Print success handling
- [ ] 11.4 Save generated PDF
- [ ] 11.5 Move source CSV to Printed
- [ ] 11.6 Archive verification
- [ ] 11.7 Prevent duplicate printing
- [ ] 11.8 Move/archive failure recovery
- [ ] 11.9 Multiple transactions from one CSV
- [ ] 11.10 Correct archive naming

PHASE 11 COMPLETE WHEN:

Winsoft CSV → Drive → Detect → Parse → Generate → Print → Archive works
reliably end-to-end.

---

# PHASE 12 — NOTIFICATIONS & HISTORY

- [ ] 12.1 Monitoring notification
- [ ] 12.2 New receipt notification
- [ ] 12.3 Print success notification where useful
- [ ] 12.4 Print failure notification
- [ ] 12.5 Retry notification
- [ ] 12.6 Print history
- [ ] 12.7 Error history
- [ ] 12.8 Archive status history

PHASE 12 COMPLETE WHEN:

The user can understand current and past print operations.

---

# PHASE 13 — REAL WORLD TESTING

- [ ] 13.1 One receipt
- [ ] 13.2 Multiple receipts
- [ ] 13.3 Multiple transactions in one CSV
- [ ] 13.4 Multiple items per transaction
- [ ] 13.5 App minimized
- [ ] 13.6 App closed
- [ ] 13.7 Screen locked
- [ ] 13.8 Phone restart
- [ ] 13.9 Internet failure
- [ ] 13.10 Drive failure
- [ ] 13.11 CSV parse failure
- [ ] 13.12 Printer disconnect
- [ ] 13.13 Print failure
- [ ] 13.14 Retry
- [ ] 13.15 Archive failure
- [ ] 13.16 Office printer
- [ ] 13.17 Thermal printer
- [ ] 13.18 Auto-print
- [ ] 13.19 Duplicate prevention
- [ ] 13.20 Generated PDF verification
- [ ] 13.21 Source CSV preservation

PHASE 13 COMPLETE WHEN:

The complete system survives the defined real-world test scenarios.

---

# PHASE 14 — RELEASE

- [ ] 14.1 Final branding
- [ ] 14.2 App icon
- [ ] 14.3 Production configuration
- [ ] 14.4 Release signing
- [ ] 14.5 Release APK
- [ ] 14.6 Install on production phone
- [ ] 14.7 Verify permissions
- [ ] 14.8 Verify background monitoring
- [ ] 14.9 Verify printing
- [ ] 14.10 Verify archiving
- [ ] 14.11 Final acceptance test

---

# FINAL MVP ACCEPTANCE

The MVP must demonstrate:

Winsoft
→ CSV
→ Google Drive
→ Background detection
→ Parse
→ Preserve all source columns
→ Normalize
→ Configurable receipt template
→ Preview
→ Queue
→ Office/Thermal printer
→ Successful print
→ Generated PDF saved
→ Source CSV moved to Printed
→ History recorded
→ No duplicate printing
→ Failure recovery

PROJECT COMPLETE ONLY WHEN ALL OF THE ABOVE WORK.
