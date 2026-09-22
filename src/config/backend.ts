/**
 * backend.ts — Single source of truth for Firebase Functions base URL.
 *
 * The deployed project is winprint-8a644, region asia-southeast1.
 * All cloud function endpoints are relative to this base URL.
 *
 * Endpoints consumed by the app:
 *  - POST /registerdevice  — registers FCM token + Drive folder with the backend
 *  - POST /drivewebhook    — called by Google Drive push notifications (server-side)
 *  - POST /renewchannels   — renews expiring Drive watch channels (server-side)
 */
export const BACKEND_BASE_URL =
  'https://asia-southeast1-winprint-8a644.cloudfunctions.net';
