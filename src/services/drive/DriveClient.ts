/**
 * DriveClient.ts — Google Drive REST API v3 fetch wrapper
 *
 * Responsibilities:
 *  - All Drive REST calls go through this module
 *  - Obtains fresh access tokens via GoogleAuthService.getValidAccessToken()
 *    on every request — NO cached/stored tokens used
 *  - Automatic 401 recovery: clear cached token + one retry
 *  - Does NOT know about receipts or printing
 *
 * Drive API docs: https://developers.google.com/drive/api/v3/reference
 *
 * TOKEN LIFECYCLE:
 *  - Access tokens are NEVER passed in as parameters from outside callers.
 *  - All callers use getWithAuth() which fetches the token on-demand.
 *  - On HTTP 401: clear the cached native token and retry exactly once.
 *  - On retry failure: throw DriveAuthError (distinct from DriveApiError).
 */

import * as GoogleAuthService from '../auth/GoogleAuthService';

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
  trashed?: boolean;
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

/**
 * Thrown when Drive auth cannot be established even after a token refresh.
 * The caller should show the "Reconnect Google Drive" UI.
 */
export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchDriveRaw(
  url: string,
  accessToken: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
}

/**
 * Get a valid access token. Throws DriveAuthError if none is available.
 */
async function requireAccessToken(): Promise<string> {
  let token: string | null;
  try {
    token = await GoogleAuthService.getValidDriveAccessToken();
  } catch (error) {
    throw new DriveAuthError(
      `Google Drive authorization needs attention. Please reconnect your Google account. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!token) {
    throw new DriveAuthError(
      'Google Drive authorization needs attention. Please reconnect your Google account.',
    );
  }
  return token;
}

/**
 * Parse a non-OK response into an error message.
 */
async function parseErrorResponse(response: Response): Promise<string> {
  let message = response.statusText;
  try {
    const body = await response.json() as { error?: { message?: string } };
    message = body?.error?.message ?? message;
  } catch {
    // Ignore JSON parse errors
  }
  return message;
}

/**
 * Execute a Drive REST request with automatic 401 recovery.
 *
 * On 401:
 *   1. Clear the cached native access token
 *   2. Obtain a fresh token from the native Google Sign-In layer
 *   3. Retry the original request exactly once
 *   4. On second failure: throw DriveAuthError
 *
 * On other HTTP errors: throw DriveApiError.
 */
async function driveRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const token = await requireAccessToken();
  const response = await fetchDriveRaw(url, token, options);

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  // ── 401 Recovery ─────────────────────────────────────────────────────────
  if (response.status === 401) {
    console.log('[WinPrint][Drive] HTTP 401 — clearing cached token and retrying once');
    // Consume the body so the connection can be reused
    try { await response.text(); } catch { /* ignore */ }

    // Clear the native cached token so getTokens() fetches a fresh one
    let freshToken: string | null;
    try {
      await GoogleAuthService.clearCachedAccessToken();
      // Obtain a fresh token
      freshToken = await GoogleAuthService.getValidDriveAccessToken();
    } catch (error) {
      throw new DriveAuthError(
        `Google Drive authorization needs attention. Please reconnect your Google account. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!freshToken) {
      throw new DriveAuthError(
        'Google Drive authorization needs attention. Please reconnect your Google account.',
      );
    }

    // Retry exactly once
    const retryResponse = await fetchDriveRaw(url, freshToken, options);
    if (retryResponse.ok) {
      console.log('[WinPrint][Drive] 401 retry succeeded');
      return retryResponse.json() as Promise<T>;
    }

    // Retry also failed
    const retryMsg = await parseErrorResponse(retryResponse);
    console.warn(`[WinPrint][Drive] 401 retry failed: ${retryResponse.status} ${retryMsg}`);
    if (retryResponse.status === 401 || retryResponse.status === 403) {
      throw new DriveAuthError(
        'Google Drive authorization needs attention. Please reconnect your Google account.',
      );
    }
    throw new DriveApiError(retryResponse.status, retryMsg);
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (response.status === 403) {
    const message = await parseErrorResponse(response);
    throw new DriveAuthError(
      `Google Drive authorization needs attention. Please reconnect your Google account. ${message}`,
    );
  }

  const message = await parseErrorResponse(response);
  throw new DriveApiError(response.status, message);
}

/**
 * Same as driveRequest but returns plain text (for file downloads).
 * Implements the same 401 recovery pattern.
 */
async function driveRequestText(url: string, options?: RequestInit): Promise<string> {
  const token = await requireAccessToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  if (response.ok) {
    return response.text();
  }

  // ── 401 Recovery ─────────────────────────────────────────────────────────
  if (response.status === 401) {
    console.log('[WinPrint][Drive] HTTP 401 (download) — clearing cached token and retrying once');
    try { await response.text(); } catch { /* ignore */ }

    let freshToken: string | null;
    try {
      await GoogleAuthService.clearCachedAccessToken();
      freshToken = await GoogleAuthService.getValidDriveAccessToken();
    } catch (error) {
      throw new DriveAuthError(
        `Google Drive authorization needs attention. Please reconnect your Google account. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!freshToken) {
      throw new DriveAuthError(
        'Google Drive authorization needs attention. Please reconnect your Google account.',
      );
    }

    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${freshToken}`,
        ...(options?.headers ?? {}),
      },
    });

    if (retryResponse.ok) {
      console.log('[WinPrint][Drive] 401 retry (download) succeeded');
      return retryResponse.text();
    }

    const retryMsg = await parseErrorResponse(retryResponse);
    console.warn(`[WinPrint][Drive] 401 retry (download) failed: ${retryResponse.status} ${retryMsg}`);
    if (retryResponse.status === 401 || retryResponse.status === 403) {
      throw new DriveAuthError(
        'Google Drive authorization needs attention. Please reconnect your Google account.',
      );
    }
    throw new DriveApiError(retryResponse.status, retryMsg);
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (response.status === 403) {
    const message = await parseErrorResponse(response);
    throw new DriveAuthError(
      `Google Drive authorization needs attention. Please reconnect your Google account. ${message}`,
    );
  }

  let message = response.statusText;
  try {
    const body = await response.json() as { error?: { message?: string } };
    message = body.error?.message ?? message;
  } catch {
    // The download endpoint can return a non-JSON error body.
  }
  throw new DriveApiError(response.status, message);
}

// ---------------------------------------------------------------------------
// Public API — no accessToken parameter; token obtained internally
// ---------------------------------------------------------------------------

/**
 * List files in a Drive folder.
 *
 * @param folderId   - Drive folder ID to list
 * @param mimeFilter - Optional MIME type filter (e.g. 'text/csv')
 * @param pageToken  - For pagination
 */
export async function listFiles(
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
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  return driveRequest<DriveFileList>(
    `${DRIVE_API_BASE}/files?${params.toString()}`,
  );
}

/** List CSV exports, including Drive files labelled with Excel's legacy CSV MIME type. */
export async function listCsvFiles(
  folderId: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const result = await listFiles(
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
  parentId: string = 'root',
): Promise<DriveFile[]> {
  const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,parents)',
    pageSize: '100',
    orderBy: 'name',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  const folders: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    const result = await driveRequest<DriveFileList>(
      `${DRIVE_API_BASE}/files?${params.toString()}`,
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
  fileId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,size,parents,trashed',
    supportsAllDrives: 'true',
  });
  return driveRequest<DriveFile>(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
  );
}

/**
 * Download file content as a string (for CSV files).
 *
 * Uses Drive's alt=media endpoint for binary/text files.
 */
export async function downloadFileAsText(
  fileId: string,
): Promise<string> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
  return driveRequestText(url);
}

/**
 * Move a file from one folder to another.
 */
export async function moveFile(
  fileId: string,
  currentParentId: string,
  newParentId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    addParents: newParentId,
    removeParents: currentParentId,
    fields: 'id,name,mimeType,parents',
    supportsAllDrives: 'true',
  });

  return driveRequest<DriveFile>(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    { method: 'PATCH' },
  );
}
