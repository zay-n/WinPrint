/**
 * driveWorkflow.ts — pure, customer-facing status derivation for the Drive tab.
 *
 * Derived only from real queue / archive state. Parsed never means printed, and
 * a CSV is COMPLETED only once its archive move has succeeded.
 */

import type {Receipt} from '../models/Receipt';
import {receiptIdentity} from './useAppStore';
import type {CsvProgress, PrintStatus, QueueItem} from './useAppStore';

export type CsvDisplayStatus =
  | 'NEW'
  | 'READY'
  | 'QUEUED'
  | 'PRINTING'
  | 'PRINT_FAILED'
  | 'ARCHIVE_PENDING'
  | 'COMPLETED'
  /** Printed + archived earlier, but the file is in the Incoming folder again. */
  | 'RETURNED';

export const CSV_STATUS_LABEL: Record<CsvDisplayStatus, string> = {
  NEW: 'Waiting to be processed',
  READY: 'Ready to Print',
  QUEUED: 'Queued',
  PRINTING: 'Printing',
  PRINT_FAILED: 'Print Failed',
  ARCHIVE_PENDING: 'Archive Pending',
  COMPLETED: 'Completed',
  RETURNED: 'Already Printed',
};

export type ReceiptRowStatus = 'READY' | PrintStatus;

export const RECEIPT_STATUS_LABEL: Record<ReceiptRowStatus, string> = {
  READY: 'Ready to Print',
  QUEUED: 'Queued',
  PRINTING: 'Printing',
  FAILED: 'Print Failed',
  PRINTED: 'Printed',
  CANCELLED: 'Cancelled',
};

export interface ReceiptRow {
  identity: string;
  receipt: Receipt;
  status: ReceiptRowStatus;
  error?: string;
  /** Index in the in-memory parsed receipts, when available. */
  parsedIndex?: number;
  /** True when the receipt exists in the persisted queue. */
  inQueue: boolean;
}

export interface ReceiptGroup {
  fileId: string;
  fileName?: string;
  status: CsvDisplayStatus;
  rows: ReceiptRow[];
  /** Parsed receipts not yet in the print queue. */
  notQueued: Receipt[];
  archiveFailed: boolean;
  archiveError?: string;
}

const fileIdOf = (q: QueueItem) => q.receipt?.sourceFile?.driveFileId;

export function csvDisplayStatus(
  fileId: string,
  queue: QueueItem[],
  csvProgress: Record<string, CsvProgress>,
  parsedFileId: string | null,
): CsvDisplayStatus {
  const prog = csvProgress[fileId];
  if (prog?.archiveStatus === 'ARCHIVED') return 'COMPLETED';
  const items = queue.filter(q => fileIdOf(q) === fileId);
  if (items.some(q => q.status === 'PRINTING')) return 'PRINTING';
  if (items.some(q => q.status === 'FAILED')) return 'PRINT_FAILED';
  if (items.some(q => q.status === 'QUEUED')) return 'QUEUED';
  if (prog && prog.expectedCount > 0 && prog.printedCount >= prog.expectedCount) {
    return 'ARCHIVE_PENDING';
  }
  // Nothing active (not processed yet, or the rest was cancelled): the CSV
  // waits in Incoming until it is processed again.
  return parsedFileId === fileId ? 'READY' : 'NEW';
}

/**
 * Receipts still in progress, grouped per CSV. Completed (archived) CSVs and
 * CSVs with nothing extracted yet are excluded.
 */
export function buildReceiptGroups(
  queue: QueueItem[],
  csvProgress: Record<string, CsvProgress>,
  parsed: Receipt[],
  parsedFileId: string | null,
): ReceiptGroup[] {
  const byFile = new Map<string, ReceiptRow[]>();
  const rowsFor = (id: string) => {
    let rows = byFile.get(id);
    if (!rows) {
      rows = [];
      byFile.set(id, rows);
    }
    return rows;
  };

  for (const q of queue) {
    const id = fileIdOf(q);
    if (!id) continue;
    rowsFor(id).push({
      identity: q.identity, receipt: q.receipt, status: q.status, error: q.error, inQueue: true,
    });
  }

  if (parsedFileId) {
    const rows = rowsFor(parsedFileId);
    parsed.forEach((receipt, parsedIndex) => {
      const identity = receiptIdentity(receipt);
      const existing = rows.find(r => r.identity === identity);
      if (existing) {
        existing.parsedIndex = parsedIndex;
      } else {
        rows.push({identity, receipt, status: 'READY', parsedIndex, inQueue: false});
      }
    });
  }

  const groups: ReceiptGroup[] = [];
  byFile.forEach((rows, fileId) => {
    const status = csvDisplayStatus(fileId, queue, csvProgress, parsedFileId);
    if (status === 'COMPLETED' || status === 'NEW' || rows.length === 0) return;
    const prog = csvProgress[fileId];
    groups.push({
      fileId,
      fileName: rows.find(r => r.receipt?.sourceFile?.driveFileName)?.receipt.sourceFile?.driveFileName,
      status,
      rows,
      notQueued: rows.filter(r => r.status === 'READY').map(r => r.receipt),
      archiveFailed: prog?.archiveStatus === 'FAILED',
      archiveError: prog?.archiveError,
    });
  });
  return groups;
}
