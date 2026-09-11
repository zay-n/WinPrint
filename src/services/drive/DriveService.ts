/**
 * DriveService.ts — Drive workflow service for the Phase 2–4 slice.
 *
 * Keeps Drive API transport and CSV parsing independent from Zustand and UI.
 * This service only lists and downloads source CSV files; it never archives,
 * prints, or mutates Drive content.
 */

import type {Receipt} from '../../models/Receipt';
import {parseCsv} from '../csv/CsvReader';
import {groupTransactions} from '../csv/TransactionGrouper';
import * as DriveClient from './DriveClient';
import type {DriveFile} from './DriveClient';

export interface ParsedDriveCsv {
  file: DriveFile;
  receipts: Receipt[];
  malformedRows: number[];
}

export async function listFolders(
  accessToken: string,
  parentId = 'root',
): Promise<DriveFile[]> {
  return DriveClient.listFolders(accessToken, parentId);
}

export async function listCsvFiles(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  return DriveClient.listCsvFiles(accessToken, folderId);
}

export async function downloadAndParseCsv(
  accessToken: string,
  file: DriveFile,
): Promise<ParsedDriveCsv> {
  const csvText = await DriveClient.downloadFileAsText(accessToken, file.id);
  const {headers, rows, malformedRows} = parseCsv(csvText);

  if (headers.length === 0) {
    throw new Error('The CSV file is empty or does not contain a header row.');
  }
  if (!headers.includes('transtype') || !headers.includes('transno')) {
    throw new Error('The CSV is missing required Winsoft columns: transtype and transno.');
  }
  if (malformedRows.length > 0) {
    throw new Error(
      `The CSV has malformed row${malformedRows.length === 1 ? '' : 's'}: ${malformedRows.join(', ')}.`,
    );
  }

  const receipts = groupTransactions(rows).map(receipt => ({
    ...receipt,
    sourceFile: {
      driveFileId: file.id,
      driveFileName: file.name,
    },
  }));

  return {file, receipts, malformedRows};
}

export async function moveFile(
  accessToken: string,
  fileId: string,
  currentParentId: string,
  newParentId: string,
): Promise<DriveFile> {
  return DriveClient.moveFile(accessToken, fileId, currentParentId, newParentId);
}
