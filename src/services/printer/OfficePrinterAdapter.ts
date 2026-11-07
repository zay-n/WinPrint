/**
 * OfficePrinterAdapter.ts — Android Print Framework adapter for A4 receipts
 *
 * Flow (ARCHITECTURE.md §16):
 *   Receipt → A4 PDF → OfficePrinterAdapter → Android Print Framework → Office Printer
 *
 * Employs the native Android PrintManager system spooler so any connected
 * Wi-Fi, network, Mopria, or system printer can be selected by the user.
 */

import {NativeModules, Platform} from 'react-native';
import type {Receipt} from '../../models/Receipt';
import type {BusinessProfile, A4Template} from '../../models/Profile';
import {generateReceiptPdf, receiptPdfFilename} from '../pdf/ReceiptPdfService';
import type {PrinterAdapter, PrinterStatus, PrintResult} from './PrinterAdapter';

interface AndroidPrintNativeModule {
  printPdf(filePath: string, jobName: string): Promise<boolean>;
}

const AndroidPrint: AndroidPrintNativeModule | undefined =
  NativeModules.AndroidPrint;

export class OfficePrinterAdapter implements PrinterAdapter {
  public readonly id = 'office_android_spooler';
  public readonly type = 'office' as const;
  public readonly name = 'Office Printer (Android Print Framework)';

  public async getStatus(): Promise<PrinterStatus> {
    if (Platform.OS !== 'android') {
      return {
        connected: false,
        ready: false,
        message: 'Android Print Framework is only available on Android devices.',
      };
    }

    if (!AndroidPrint) {
      return {
        connected: false,
        ready: false,
        message: 'AndroidPrint native module is not linked.',
      };
    }

    return {
      connected: true,
      ready: true,
      message: 'Ready to print via Android system Print Spooler.',
    };
  }

  public async print(receipt: Receipt, profile?: BusinessProfile, template?: A4Template): Promise<PrintResult> {
    const logId = `${receipt.sourceFile?.driveFileId ?? 'local'}::${receipt.transactionType}::${receipt.transactionNumber}`;
    console.log(`[WinPrint][OfficePrinter] print() started — identity: ${logId}`);
    try {
      if (Platform.OS !== 'android' || !AndroidPrint) {
        const msg = 'Android Print Framework is not available on this platform.';
        console.warn(`[WinPrint][OfficePrinter] Not available: ${msg}`);
        throw new Error(msg);
      }

      // 1. Generate A4 PDF locally
      console.log(`[WinPrint][OfficePrinter] Generating PDF for: ${logId}`);
      const pdfPath = await generateReceiptPdf(receipt, profile, template);
      console.log(`[WinPrint][OfficePrinter] PDF ready at: ${pdfPath}`);

      const jobName = receiptPdfFilename(receipt) ||
        `Winsoft Receipt ${receipt.transactionNumber || receipt.transactionType}`;

      // 2. Submit to Android PrintManager and wait for its terminal job state.
      //
      // Android reports COMPLETED only after its print job is marked complete;
      // printPdf() remains pending while the dialog/job is active and rejects
      // if the job fails or is canceled.
      //
      // LIMITATION: Android's completed state is the framework's success
      // signal. The app has no sensor that can verify paper physically exited
      // the printer.
      console.log(`[WinPrint][OfficePrinter] Submitting job "${jobName}" to Android PrintManager`);
      const completed: boolean = await AndroidPrint.printPdf(pdfPath, jobName);
      if (!completed) {
        console.warn(`[WinPrint][OfficePrinter] printPdf() resolved false — job did not complete`);
        return {success: false, error: 'Android PrintManager did not confirm print job completion.'};
      }
      console.log(`[WinPrint][OfficePrinter] Android reports job completed — identity: ${logId}`);
      return {success: true};
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WinPrint][OfficePrinter] print() failed — identity: ${logId}, error: ${message}`);
      return {
        success: false,
        error: `Office print failed: ${message}`,
      };
    }
  }

  public async testPrint(): Promise<PrintResult> {
    const testReceipt: Receipt = {
      transactionType: 'TEST PRINT',
      transactionNumber: 'TEST-001',
      date: new Date().toISOString().split('T')[0],
      customer: {
        name: 'Winsoft System Test',
        address1: 'Test Office Environment',
        phone: '+000 000 0000',
      },
      items: [
        {
          sourceFields: {},
          description: 'A4 Office Printer Test Page',
          quantity: 1,
          rate: 0,
          amount: 0,
          unit: 'PAGE',
        },
      ],
      financials: {
        subtotal: 0,
        taxableAmount: 0,
        vatAmount: 0,
        total: 0,
      },
      additional: {
        remarks: 'Android Print Framework verification test',
      },
      sourceRows: [],
    };

    return this.print(testReceipt);
  }
}
