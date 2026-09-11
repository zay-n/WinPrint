/**
 * PrinterService.ts — Printer adapter registry and dispatch service
 */

import type {PrinterAdapter, PrinterType} from './PrinterAdapter';
import {OfficePrinterAdapter} from './OfficePrinterAdapter';
import {ThermalPrinterAdapter} from './ThermalPrinterAdapter';

class PrinterServiceManager {
  private officeAdapter: OfficePrinterAdapter = new OfficePrinterAdapter();
  private thermalAdapter: ThermalPrinterAdapter = new ThermalPrinterAdapter();

  public getAdapter(type: PrinterType): PrinterAdapter {
    switch (type) {
      case 'office':
        return this.officeAdapter;
      case 'thermal':
        return this.thermalAdapter;
      default:
        return this.officeAdapter;
    }
  }

  public getOfficeAdapter(): OfficePrinterAdapter {
    return this.officeAdapter;
  }

  public getThermalAdapter(): ThermalPrinterAdapter {
    return this.thermalAdapter;
  }
}

export const PrinterService = new PrinterServiceManager();
