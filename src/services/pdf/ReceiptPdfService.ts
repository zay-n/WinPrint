/**
 * Local file service for generated receipt PDFs.
 *
 * Rendering lives in ReceiptPdfDocument; this module only persists its output
 * in the application-private documents directory.
 */

import RNFS from 'react-native-fs';
import type {Receipt} from '../../models/Receipt';
import {buildReceiptPdf} from './ReceiptPdfDocument';

const RECEIPT_PDF_DIRECTORY = `${RNFS.DocumentDirectoryPath}/receipts`;

export async function generateReceiptPdf(receipt: Receipt): Promise<string> {
  const filename = receiptPdfFilename(receipt);
  const path = `${RECEIPT_PDF_DIRECTORY}/${filename}`;
  const document = buildReceiptPdf(receipt);

  try {
    await RNFS.mkdir(RECEIPT_PDF_DIRECTORY);
    await RNFS.writeFile(path, document, 'ascii');
    return path;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not save PDF for ${receipt.transactionNumber}: ${message}`);
  }
}

export function receiptPdfFilename(receipt: Receipt): string {
  return `receipt_${safeFilenamePart(receipt.transactionType)}_${safeFilenamePart(receipt.transactionNumber)}.pdf`;
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown';
}
