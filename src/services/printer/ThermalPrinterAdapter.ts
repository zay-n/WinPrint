/**
 * ThermalPrinterAdapter.ts — 80mm ESC/POS Thermal Printer Adapter (Bluetooth)
 *
 * Flow (ARCHITECTURE.md §17):
 *   Receipt → EscPosReceiptBuilder → 80mm ESC/POS → ThermalPrinterAdapter → Bluetooth Thermal Printer
 *
 * Formats ESC/POS bytes optimized directly for 80mm receipt paper (48 cols)
 * and transmits them via Bluetooth Classic RFCOMM / SPP.
 */

import {NativeModules, Platform, PermissionsAndroid} from 'react-native';
import type {Receipt} from '../../models/Receipt';
import type {
  PrinterAdapter,
  PrinterStatus,
  PrintResult,
  BluetoothDevice,
} from './PrinterAdapter';
import {
  buildThermalReceipt,
  buildTestThermalReceipt,
} from './escpos/EscPosReceiptBuilder';

interface BluetoothThermalPrinterNativeModule {
  getBondedDevices(): Promise<BluetoothDevice[]>;
  connect(address: string): Promise<boolean>;
  disconnect(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  writeBytes(base64Data: string): Promise<boolean>;
}

const BluetoothThermalPrinter: BluetoothThermalPrinterNativeModule | undefined =
  NativeModules.BluetoothThermalPrinter;

export class ThermalPrinterAdapter implements PrinterAdapter {
  public readonly id = 'thermal_80mm_bluetooth';
  public readonly type = 'thermal' as const;
  public readonly name = '80mm Thermal Printer (ESC/POS Bluetooth)';

  private connectedAddress: string | null = null;

  /** Checks Bluetooth availability and connection status. */
  public async getStatus(): Promise<PrinterStatus> {
    if (Platform.OS !== 'android') {
      return {
        connected: false,
        ready: false,
        message: 'Bluetooth printing is only supported on Android in this release.',
      };
    }

    if (!BluetoothThermalPrinter) {
      return {
        connected: false,
        ready: false,
        message: 'BluetoothThermalPrinter native module is not linked.',
      };
    }

    try {
      const connected = await BluetoothThermalPrinter.isConnected();
      return {
        connected,
        ready: connected,
        message: connected
          ? `Connected to ${this.connectedAddress || 'Thermal Printer'}`
          : 'Thermal printer is not connected.',
      };
    } catch {
      return {
        connected: false,
        ready: false,
        message: 'Unable to query Bluetooth printer status.',
      };
    }
  }

  /** Requests Bluetooth permissions required on Android 12+ (API 31+). */
  public static async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      if (Platform.Version >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        ]);
        return (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Retrieves list of paired/bonded Bluetooth devices. */
  public async getBondedDevices(): Promise<BluetoothDevice[]> {
    if (Platform.OS !== 'android' || !BluetoothThermalPrinter) {
      return [];
    }
    await ThermalPrinterAdapter.requestBluetoothPermissions();
    return BluetoothThermalPrinter.getBondedDevices();
  }

  /** Connects to a Bluetooth thermal printer by MAC address. */
  public async connect(targetAddress?: string): Promise<void> {
    if (!targetAddress) {
      throw new Error('No Bluetooth printer address provided.');
    }
    if (Platform.OS !== 'android' || !BluetoothThermalPrinter) {
      throw new Error('Bluetooth printer native module is not available.');
    }

    await ThermalPrinterAdapter.requestBluetoothPermissions();
    await BluetoothThermalPrinter.connect(targetAddress);
    this.connectedAddress = targetAddress;
  }

  /** Disconnects from current Bluetooth printer. */
  public async disconnect(): Promise<void> {
    if (Platform.OS !== 'android' || !BluetoothThermalPrinter) {
      return;
    }
    await BluetoothThermalPrinter.disconnect();
    this.connectedAddress = null;
  }

  /** Sends a normalized Receipt to the thermal printer. */
  public async print(receipt: Receipt): Promise<PrintResult> {
    try {
      if (Platform.OS !== 'android' || !BluetoothThermalPrinter) {
        throw new Error('Thermal printer is only available on Android.');
      }

      // Check connection
      const connected = await BluetoothThermalPrinter.isConnected();
      if (!connected) {
        if (this.connectedAddress) {
          // Attempt auto-reconnect
          await this.connect(this.connectedAddress);
        } else {
          throw new Error('Please select and connect a Bluetooth thermal printer in Settings.');
        }
      }

      // 1. Build 80mm ESC/POS bytes
      const bytes = buildThermalReceipt(receipt);

      // 2. Encode to Base64 for native transmission
      const base64 = uint8ArrayToBase64(bytes);

      // 3. Transmit to printer
      await BluetoothThermalPrinter.writeBytes(base64);

      return {success: true};
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Thermal print failed: ${message}`,
      };
    }
  }

  /** Prints an 80mm alignment and status test receipt. */
  public async testPrint(): Promise<PrintResult> {
    try {
      if (Platform.OS !== 'android' || !BluetoothThermalPrinter) {
        throw new Error('Thermal printer is only available on Android.');
      }

      const connected = await BluetoothThermalPrinter.isConnected();
      if (!connected) {
        if (this.connectedAddress) {
          await this.connect(this.connectedAddress);
        } else {
          throw new Error('Please select and connect a Bluetooth thermal printer first.');
        }
      }

      const bytes = buildTestThermalReceipt();
      const base64 = uint8ArrayToBase64(bytes);
      await BluetoothThermalPrinter.writeBytes(base64);

      return {success: true};
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Thermal test print failed: ${message}`,
      };
    }
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return '';
}
