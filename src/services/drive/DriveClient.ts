/**
 * DriveClient.ts — Google Drive REST API v3 fetch wrapper
 *
 * Responsibilities:
 *  - All Drive REST calls go through this module
 *  - Accepts an OAuth access token (provided by GoogleAuthService)
 *  - Does NOT handle auth; does NOT know about receipts or printing
 *
 * Drive API docs: https://developers.google.com/drive/api/v3/reference
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

const CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'];

export class DriveApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(`Drive API error ${statusCode}: ${message}`);
    this.name = 'DriveApiError';
  }
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function driveRequest<T>(
  url: string,
  accessToken: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json() as {error?: {message?: string}};
      message = body?.error?.message ?? message;
    } catch {
      // Ignore JSON parse errors
    }
    throw new DriveApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List files in a Drive folder.
 *
 * @param accessToken - OAuth access token with drive.readonly scope
 * @param folderId    - Drive folder ID to list
 * @param mimeFilter  - Optional MIME type filter (e.g. 'text/csv')
 * @param pageToken   - For pagination
 */
export async function listFiles(
  accessToken: string,
  folderId: string,
  mimeFilter?: string,
  pageToken?: string,
): Promise<DriveFileList> {
  let q = `'${folderId}' in parents and trashed = false`;
  if (mimeFilter) {
    q += ` and mimeType = '${mimeFilter}'`;
  }

  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,parents)',
    pageSize: '100',
    orderBy: 'modifiedTime desc',
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  return driveRequest<DriveFileList>(
    `${DRIVE_API_BASE}/files?${params.toString()}`,
    accessToken,
  );
}

/** List CSV exports, including Drive files labelled with Excel's legacy CSV MIME type. */
export async function listCsvFiles(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listFiles(
      accessToken,
      folderId,
      undefined,
      pageToken,
    );
    files.push(
      ...result.files.filter(
        file =>
          CSV_MIME_TYPES.includes(file.mimeType) ||
          file.name.toLowerCase().endsWith('.csv'),
      ),
    );
    pageToken = result.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * List folders inside a parent folder (or root if parentId is 'root').
 */
export async function listFolders(
  accessToken: string,
  parentId: string = 'root',
): Promise<DriveFile[]> {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,parents)',
    pageSize: '100',
    orderBy: 'name',
  });

  const folders: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const result = await driveRequest<DriveFileList>(
      `${DRIVE_API_BASE}/files?${params.toString()}`,
      accessToken,
    );
    folders.push(...result.files);
    pageToken = result.nextPageToken;
  } while (pageToken);

  return folders;
}

/**
 * Get file metadata.
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,size,parents',
  });
  return driveRequest<DriveFile>(
    `${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`,
    accessToken,
  );
}

/**
 * Download file content as a string (for CSV files).
 *
 * Uses Drive's export-or-download endpoint (alt=media for binary/text files).
 */
export async function downloadFileAsText(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
  const response = await fetch(url, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json() as {error?: {message?: string}};
      message = body.error?.message ?? message;
    } catch {
      // The download endpoint can return a non-JSON error body.
    }
    throw new DriveApiError(response.status, message);
  }

  return response.text();
}

/**
 * Move a file from one folder to another.
 */
export async function moveFile(
  accessToken: string,
  fileId: string,
  currentParentId: string,
  newParentId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: currentParentId,
    fields: 'id,name,mimeType,parents',
  });

  return driveRequest<DriveFile>(
    `${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`,
    accessToken,
    {method: 'PATCH'},
  );
}
