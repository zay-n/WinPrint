/**
 * PrinterAdapter.ts — Core printer abstraction for Winsoft Print Station
 *
 * Architecture (ARCHITECTURE.md §18):
 *
 *   Printer
 *   ├── OfficePrinterAdapter (A4 PDF → Android Print Framework)
 *   └── ThermalPrinterAdapter (Receipt → 80mm ESC/POS → Bluetooth)
 *
 * The rest of the application interacts with printers only through this interface.
 */

import type {Receipt} from '../../models/Receipt';

export type PrinterType = 'office' | 'thermal';

export interface PrinterStatus {
  connected: boolean;
  ready: boolean;
  message?: string;
}

export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface BluetoothDevice {
  name: string;
  address: string;
}

export interface PrinterAdapter {
  /** Unique identifier for the adapter instance */
  readonly id: string;
  /** High-level category: 'office' or 'thermal' */
  readonly type: PrinterType;
  /** User-friendly display name */
  readonly name: string;

  /** Checks current availability, permissions, and connection state. */
  getStatus(): Promise<PrinterStatus>;

  /** Connect to a target device (e.g. Bluetooth MAC address). Optional for office printers. */
  connect?(target?: string): Promise<void>;

  /** Disconnect from the target device. Optional for office printers. */
  disconnect?(): Promise<void>;

  /** Prints a normalized Receipt object. */
  print(receipt: Receipt): Promise<PrintResult>;

  /** Sends a self-test page or receipt to verify physical printing. */
  testPrint(): Promise<PrintResult>;
}
