/**
 * driveWatcher.ts — Google Drive Changes API integration
 *
 * Uses the service account (loaded from Secret Manager) to:
 *  1. Obtain a starting pageToken from the Changes API.
 *  2. Register a push-notification channel (changes.watch) pointing
 *     to the driveWebhook Cloud Function URL.
 *  3. On webhook delivery, poll changes.list to find newly added CSV files
 *     within a specific folder.
 *
 * The user's Google OAuth token is NEVER used here.
 * The service account must have been granted access to the monitored folder
 * by the end-user sharing it in Google Drive.
 */

import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

/** Minimal Drive file descriptor returned to callers. */
export interface DriveFileInfo {
  id: string;
  name: string;
}

/** Result of getNewCsvFiles. */
export interface CsvChangeResult {
  newFiles: DriveFileInfo[];
  nextPageToken: string;
}

const CSV_MIME_TYPES = new Set(['text/csv', 'application/vnd.ms-excel']);

/** Build an authenticated Drive client using the service account JSON secret. */
export function getDriveClient(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

/**
 * Register a Drive Changes watch channel for the service account.
 * Returns the channelId and the initial pageToken to use for subsequent polls.
 *
 * @param folderId      The Drive folder ID to monitor (used for filtering later).
 * @param webhookUrl    The publicly accessible HTTPS URL of the driveWebhook function.
 * @param channelToken  A secret token stored in Firestore and compared on each webhook call.
 * @param serviceAccountJson  Service account credentials JSON string.
 */
export async function setupDriveWatch(
  folderId: string,
  webhookUrl: string,
  channelToken: string,
  serviceAccountJson: string,
): Promise<{ channelId: string; pageToken: string }> {
  const drive = getDriveClient(serviceAccountJson);

  // Get current start page token for this service account's change feed.
  const startPageTokenRes = await drive.changes.getStartPageToken({});
  const startPageToken = startPageTokenRes.data.startPageToken;
  if (!startPageToken) {
    throw new Error('Could not obtain Drive start page token.');
  }

  const channelId = uuidv4();

  // Register push channel — Drive will POST to webhookUrl when changes occur.
  await drive.changes.watch({
    pageToken: startPageToken,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: channelToken,
      // Channels expire after 7 days max; we renew every 6 days via scheduler.
      expiration: String(Date.now() + 6 * 24 * 60 * 60 * 1000),
    },
  });

  return { channelId, pageToken: startPageToken };
}

/**
 * Poll Drive Changes API for new CSV files in the given folder since pageToken.
 * Returns new files and the updated pageToken to persist.
 *
 * Only files that are:
 *  - Not trashed
 *  - CSV MIME type or .csv extension
 *  - Located in folderId (verified via file.parents)
 *  - Recently created (changeType === 'file' and file.trashed === false)
 * are returned.
 */
export async function getNewCsvFiles(
  folderId: string,
  pageToken: string,
  serviceAccountJson: string,
): Promise<CsvChangeResult> {
  const drive = getDriveClient(serviceAccountJson);
  const newFiles: DriveFileInfo[] = [];
  let currentToken = pageToken;

  // Paginate through all changes since the stored token.
  do {
    const changesRes = await drive.changes.list({
      pageToken: currentToken,
      fields:
        'nextPageToken,newStartPageToken,changes(changeType,removed,file(id,name,mimeType,trashed,parents))',
      includeRemoved: false,
      spaces: 'drive',
    });

    const data = changesRes.data;
    const changes = data.changes ?? [];

    for (const change of changes) {
      if (change.changeType !== 'file') continue;
      if (change.removed) continue;

      const file = change.file;
      if (!file) continue;
      if (file.trashed) continue;

      const parents = file.parents ?? [];
      if (!parents.includes(folderId)) continue;

      const isCsv =
        CSV_MIME_TYPES.has(file.mimeType ?? '') ||
        (file.name ?? '').toLowerCase().endsWith('.csv');
      if (!isCsv) continue;

      newFiles.push({ id: file.id ?? '', name: file.name ?? '' });
    }

    // `newStartPageToken` signals we have consumed all available changes.
    if (data.newStartPageToken) {
      currentToken = data.newStartPageToken;
      break;
    }
    if (data.nextPageToken) {
      currentToken = data.nextPageToken;
    } else {
      break;
    }
  } while (true);

  return { newFiles, nextPageToken: currentToken };
}
