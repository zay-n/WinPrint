/**
 * DriveService.ts — Drive workflow service.
 *
 * Keeps Drive API transport and CSV parsing independent from Zustand and UI.
 * This service only lists and downloads source CSV files; it never archives,
 * prints, or mutates Drive content.
 *
 * TOKEN HANDLING:
 *  Access tokens are obtained internally by DriveClient via GoogleAuthService.
 *  No accessToken is accepted as a parameter here. All Drive operations
 *  automatically obtain a fresh token and handle 401 recovery.
 */

import type { Receipt } from '../../models/Receipt';
import { parseCsv } from '../csv/CsvReader';
import { groupTransactions } from '../csv/TransactionGrouper';
import * as DriveClient from './DriveClient';
import { DriveApiError } from './DriveClient';
import type { DriveFile } from './DriveClient';

export interface ParsedDriveCsv {
  file: DriveFile;
  receipts: Receipt[];
  malformedRows: number[];
}

export async function listFolders(
  parentId = 'root',
): Promise<DriveFile[]> {
  return DriveClient.listFolders(parentId);
}

export async function listCsvFiles(
  folderId: string,
): Promise<DriveFile[]> {
  return DriveClient.listCsvFiles(folderId);
}

export async function getFileMetadata(
  fileId: string,
): Promise<DriveFile> {
  return DriveClient.getFileMetadata(fileId);
}

export async function downloadAndParseCsv(
  file: DriveFile,
): Promise<ParsedDriveCsv> {
  const csvText = await DriveClient.downloadFileAsText(file.id);
  const { headers, rows, malformedRows } = parseCsv(csvText);

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

  return { file, receipts, malformedRows };
}

export async function moveFile(
  fileId: string,
  currentParentId: string,
  newParentId: string,
): Promise<DriveFile> {
  if (!fileId || !currentParentId || !newParentId) {
    throw new Error('Cannot archive this CSV: file, Incoming folder, or Printed folder ID is missing.');
  }
  if (currentParentId === newParentId) {
    throw new Error('The Printed folder must be different from the Incoming folder.');
  }

  const [file, destination] = await Promise.all([
    DriveClient.getFileMetadata(fileId),
    DriveClient.getFileMetadata(newParentId),
  ]);
  if (file.trashed) {
    throw new DriveApiError(404, `CSV file "${file.name}" is in Drive trash.`);
  }
  if (destination.trashed || destination.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error(`The selected Printed folder "${destination.name}" is unavailable or is not a folder.`);
  }

  const parents = file.parents ?? [];
  // A prior move may have succeeded even if its response was lost. Treat the
  // confirmed destination parent as success so an archive retry is idempotent.
  if (parents.includes(newParentId) && !parents.includes(currentParentId)) {
    return file;
  }
  if (!parents.includes(currentParentId)) {
    throw new DriveApiError(
      409,
      `CSV file "${file.name}" is no longer in the configured Incoming folder. Current parent IDs: ${parents.join(', ') || 'none'}.`,
    );
  }

  const updated = await DriveClient.moveFile(fileId, currentParentId, newParentId);
  if (updated.parents?.includes(newParentId) && !updated.parents.includes(currentParentId)) {
    return updated;
  }

  // Verify the resulting parent list if the update response did not confirm it.
  const verified = await DriveClient.getFileMetadata(fileId);
  if (verified.parents?.includes(newParentId) && !verified.parents.includes(currentParentId)) {
    return verified;
  }
  throw new DriveApiError(
    409,
    `Drive did not confirm moving CSV file "${file.name}" from Incoming to Printed.`,
  );
}
