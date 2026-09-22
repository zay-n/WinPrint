/**
 * MonitoringService.ts — React Native facade for push-notification monitoring.
 *
 * Wraps the WinsoftMonitoring NativeModule and coordinates:
 *  - FCM token retrieval and device registration with the backend.
 *  - Handling PRINT and LATER notification actions.
 *  - Periodic WorkManager reconciliation triggering.
 *  - Deferred file processing (LATER-deferred CSVs).
 *
 * SECURITY: The user's Google access token never leaves the device.
 * The backend receives only { fcmToken, folderId } — no auth credentials.
 *
 * ARCHITECTURE:
 *  - All Drive verification is done here (downloadAndParseCsv) before enqueue.
 *  - Enqueue uses the existing store.enqueueReceipt() with duplicate protection.
 *  - processQueue() is only called for PRINT actions, never for reconciliation.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import * as DriveService from '../drive/DriveService';

// ---------------------------------------------------------------------------
// Native module bridge
// ---------------------------------------------------------------------------

const { WinsoftMonitoring } = NativeModules as {
  WinsoftMonitoring: {
    getFcmToken(): Promise<string>;
    getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'requested'>;
    requestNotificationPermission(): Promise<'granted' | 'denied' | 'requested'>;
    scheduleReconciliation(): Promise<boolean>;
    cancelReconciliation(): Promise<boolean>;
    getInitialPrintIntent(): Promise<PrintIntentData | null>;
    consumeDeferredFiles(): Promise<string[]>;
    addListener(event: string): void;
    removeListeners(count: number): void;
  };
};

export interface PrintIntentData {
  fileId: string;
  folderId: string;
  fileName: string;
}

// ---------------------------------------------------------------------------
// Store accessor (set during initialize to avoid a circular import)
// ---------------------------------------------------------------------------

interface StoreAccessor {
  getAccessToken: () => string | null;
  getSourceFolderId: () => string | null;
  getFcmRegistrationStatus: () => FcmStatus;
  getCachedFcmToken: () => string | null;
  enqueueReceipt: (receipt: import('../../models/Receipt').Receipt) => void;
  processQueue: () => Promise<void>;
  setFcmToken: (token: string) => void;
  setFcmRegistrationStatus: (s: FcmStatus) => void;
  setServiceAccountEmail: (email: string) => void;
  recordDriveNotification: () => void;
  recordReconciliation: () => void;
  setMonitoringError: (msg: string | null) => void;
  addDeferredFileId: (entry: string) => void;
  removeDeferredFileId: (entry: string) => void;
  getDeferredFileIds: () => string[];
}

export type FcmStatus = 'unregistered' | 'registering' | 'registered' | 'error';

let store: StoreAccessor | null = null;
let eventEmitter: NativeEventEmitter | null = null;
const subscriptions: EmitterSubscription[] = [];
let backendUrl = '';
let _initialized = false;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Call once from App.tsx (or the root component) after the store is ready.
 * Idempotent — calling multiple times is safe.
 */
export async function initialize(
  storeAccessor: StoreAccessor,
  backendBaseUrl: string,
): Promise<void> {
  store = storeAccessor;
  backendUrl = backendBaseUrl;
  _initialized = true;

  if (Platform.OS !== 'android') return; // Android-only feature
  if (!WinsoftMonitoring) {
    store.setMonitoringError('WinsoftMonitoring native module not found.');
    return;
  }

  // Subscribe to native events.
  if (subscriptions.length === 0) {
    eventEmitter = new NativeEventEmitter(WinsoftMonitoring as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const on = (event: string, handler: (data: any) => void) =>
      eventEmitter!.addListener(event, handler);
    subscriptions.push(
      on('onFcmTokenRefresh', onFcmTokenRefresh),
      on('onPrintActionReceived', onPrintActionReceived),
      on('onLaterActionReceived', onLaterActionReceived),
      on('onReconciliationRequested', onReconciliationRequested),
      on('onDeferredFilesReady', onDeferredFilesReady),
    );
  }

  // Check if the app was cold-started via a PRINT intent.
  try {
    const initialIntent = await WinsoftMonitoring.getInitialPrintIntent();
    if (initialIntent) {
      await handlePrintAction(initialIntent);
    }
  } catch (_) {
    // Non-fatal — continue initialisation.
  }

  // Retrieve FCM token.
  try {
    const token = await WinsoftMonitoring.getFcmToken();
    if (token) {
      store.setFcmToken(token);
      await tryRegisterDevice(token);
    }
  } catch (e) {
    store.setMonitoringError(`FCM token error: ${String(e)}`);
  }

  // Schedule WorkManager reconciliation (idempotent).
  try {
    await WinsoftMonitoring.scheduleReconciliation();
  } catch (_) {
    // Not fatal — FCM is the primary path.
  }

  // Check for deferred files from previous LATER taps.
  await processDeferredNativeFiles();
}

// ---------------------------------------------------------------------------
// Device registration
// ---------------------------------------------------------------------------

async function tryRegisterDevice(fcmToken: string): Promise<void> {
  if (!store) return;
  const folderId = store.getSourceFolderId();
  if (!folderId || !backendUrl) return;

  store.setFcmRegistrationStatus('registering');
  const url = `${backendUrl}/registerdevice`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken, folderId }),
    });

    const rawBody = await resp.text();
    const contentType = resp.headers.get('content-type') ?? '';

    if (!resp.ok) {
      // Try to extract a structured error message from the body.
      let errMsg = `HTTP ${resp.status}`;
      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(rawBody) as { error?: string };
          errMsg = parsed.error ?? errMsg;
        } catch (_) { /* keep HTTP status message */ }
      } else {
        // Truncate non-JSON bodies (e.g. HTML 500 pages) to a safe length.
        const safeBody = rawBody.slice(0, 200).replace(/\n/g, ' ');
        errMsg = `HTTP ${resp.status}: ${safeBody}`;
      }
      throw new Error(errMsg);
    }

    // 2xx — parse JSON response.
    if (!contentType.includes('application/json')) {
      throw new Error(
        `Registration returned non-JSON response (${resp.status}): ${rawBody.slice(0, 200)}`,
      );
    }

    const data = JSON.parse(rawBody) as { serviceAccountEmail?: string };
    store.setFcmRegistrationStatus('registered');
    if (data.serviceAccountEmail) {
      store.setServiceAccountEmail(data.serviceAccountEmail);
    }
    store.setMonitoringError(null);
  } catch (e) {
    store.setFcmRegistrationStatus('error');
    store.setMonitoringError(`Registration failed: ${String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// On-demand registration (called when user enables monitoring)
// ---------------------------------------------------------------------------

/**
 * Ensures the device is registered with the backend.
 *
 * Called explicitly when the user enables Notification Monitoring in Settings,
 * because initialize() may have run before sourceFolderId was selected.
 *
 * Safe to call multiple times — returns immediately if already registered.
 * Will obtain a fresh FCM token from Firebase if none is cached yet.
 */
export async function ensureRegistered(): Promise<void> {
  if (!store || !_initialized) return;

  // Already registered — nothing to do.
  const currentStatus = store.getFcmRegistrationStatus();
  if (currentStatus === 'registered') return;

  // Check folderId first — no point obtaining token if folder not set.
  const folderId = store.getSourceFolderId();
  if (!folderId) {
    store.setMonitoringError(
      'Incoming Drive folder not configured. Select a Source Folder in Drive settings first.',
    );
    return;
  }

  // Use cached token from store first; fall back to native if missing.
  let token: string | null = store.getCachedFcmToken();

  if (!token && WinsoftMonitoring) {
    try {
      token = await WinsoftMonitoring.getFcmToken();
    } catch (e) {
      store.setMonitoringError(`Cannot obtain FCM token: ${String(e)}`);
      store.setFcmRegistrationStatus('error');
      return;
    }
  }

  if (!token) {
    store.setMonitoringError(
      'FCM token not yet available. This may take a moment — please try again.',
    );
    store.setFcmRegistrationStatus('error');
    return;
  }

  store.setFcmToken(token);
  await tryRegisterDevice(token);
}

/**
 * Re-register with the backend (e.g., after the user changes the Incoming folder).
 */
export async function registerDevice(
  fcmToken: string,
  folderId: string,
): Promise<void> {
  if (!store || !backendUrl) return;
  store.setFcmRegistrationStatus('registering');
  const url = `${backendUrl}/registerdevice`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken, folderId }),
    });

    const rawBody = await resp.text();
    const contentType = resp.headers.get('content-type') ?? '';

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(rawBody) as { error?: string };
          errMsg = parsed.error ?? errMsg;
        } catch (_) { /* keep HTTP status message */ }
      } else {
        const safeBody = rawBody.slice(0, 200).replace(/\n/g, ' ');
        errMsg = `HTTP ${resp.status}: ${safeBody}`;
      }
      throw new Error(errMsg);
    }

    if (!contentType.includes('application/json')) {
      throw new Error(
        `Registration returned non-JSON response (${resp.status}): ${rawBody.slice(0, 200)}`,
      );
    }

    const data = JSON.parse(rawBody) as { serviceAccountEmail?: string };
    store.setFcmRegistrationStatus('registered');
    if (data.serviceAccountEmail) {
      store.setServiceAccountEmail(data.serviceAccountEmail);
    }
    store.setMonitoringError(null);
  } catch (e) {
    store.setFcmRegistrationStatus('error');
    store.setMonitoringError(`Registration failed: ${String(e)}`);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// PRINT action
// ---------------------------------------------------------------------------

/**
 * Called when the user taps [PRINT] on a notification (or when the initial
 * cold-start intent is found).
 *
 * Flow:
 *  1. Record the notification event in the store.
 *  2. Verify the file still exists in Drive using the client's access token.
 *  3. Download and parse the CSV.
 *  4. Enqueue each receipt (existing duplicate protection applies).
 *  5. Start the print queue.
 *
 * Never prints from an unverified notification payload.
 */
export async function handlePrintAction(intent: PrintIntentData): Promise<void> {
  if (!store) return;
  store.recordDriveNotification();

  const accessToken = store.getAccessToken();
  if (!accessToken) {
    store.setMonitoringError('Cannot print: not signed in to Google Drive.');
    return;
  }

  try {
    // Step 1: Verify the file exists by listing the folder.
    const csvFiles = await DriveService.listCsvFiles(accessToken, intent.folderId);
    const targetFile = csvFiles.find(f => f.id === intent.fileId);

    if (!targetFile) {
      // File may have already been moved or deleted. Do not enqueue.
      store.setMonitoringError(
        `File "${intent.fileName}" was not found in the Incoming folder. It may have already been processed.`,
      );
      return;
    }

    // Step 2: Download and parse.
    const { receipts } = await DriveService.downloadAndParseCsv(accessToken, targetFile);

    // Step 3: Enqueue (duplicate-protected).
    for (const receipt of receipts) {
      store.enqueueReceipt(receipt);
    }

    // Step 4: Start printing.
    await store.processQueue();

    store.setMonitoringError(null);
  } catch (e) {
    store.setMonitoringError(`Print action failed: ${String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// LATER action
// ---------------------------------------------------------------------------

export function handleLaterAction(fileId: string, folderId: string): void {
  if (!store) return;
  store.addDeferredFileId(`${fileId}::${folderId}`);
}

// ---------------------------------------------------------------------------
// Reconciliation (WorkManager fallback)
// ---------------------------------------------------------------------------

/**
 * Run a reconciliation pass:
 *  - List all CSVs currently in the Incoming Drive folder.
 *  - Enqueue any that haven't already been processed (duplicate protection).
 *  - Does NOT call processQueue() — no automatic printing.
 *
 * The user must manually start printing from the Queue screen.
 */
export async function runReconciliation(): Promise<void> {
  if (!store) return;

  const accessToken = store.getAccessToken();
  const folderId = store.getSourceFolderId();

  if (!accessToken || !folderId) return;

  store.recordReconciliation();

  try {
    const csvFiles = await DriveService.listCsvFiles(accessToken, folderId);
    for (const file of csvFiles) {
      try {
        const { receipts } = await DriveService.downloadAndParseCsv(accessToken, file);
        for (const receipt of receipts) {
          store.enqueueReceipt(receipt);
        }
      } catch (_) {
        // Skip malformed/unreadable files — don't abort the whole pass.
      }
    }
    store.setMonitoringError(null);
  } catch (e) {
    store.setMonitoringError(`Reconciliation failed: ${String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Deferred file processing
// ---------------------------------------------------------------------------

async function processDeferredNativeFiles(): Promise<void> {
  if (!WinsoftMonitoring || !store) return;
  try {
    const entries = await WinsoftMonitoring.consumeDeferredFiles();
    for (const entry of entries) {
      const [fileId, folderId] = entry.split('::');
      if (fileId && folderId) {
        store.addDeferredFileId(entry);
      }
    }
  } catch (_) {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Request notification permission (public — called from SettingsScreen)
// ---------------------------------------------------------------------------

export async function requestNotificationPermission(): Promise<string> {
  if (!WinsoftMonitoring) return 'unavailable';
  return WinsoftMonitoring.requestNotificationPermission();
}

export async function getNotificationPermissionStatus(): Promise<string> {
  if (!WinsoftMonitoring) return 'unavailable';
  return WinsoftMonitoring.getNotificationPermissionStatus();
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function destroy(): void {
  subscriptions.forEach(s => s.remove());
  subscriptions.length = 0;
  store = null;
  _initialized = false;
}

// ---------------------------------------------------------------------------
// Event handlers (native → JS)
// ---------------------------------------------------------------------------

function onFcmTokenRefresh(token: string): void {
  if (!store) return;
  store.setFcmToken(token);
  // Re-register with the updated token.
  tryRegisterDevice(token).catch(() => {});
}

function onPrintActionReceived(data: PrintIntentData): void {
  handlePrintAction(data).catch(() => {});
}

function onLaterActionReceived(data: { fileId: string; folderId: string }): void {
  handleLaterAction(data.fileId, data.folderId);
}

function onReconciliationRequested(): void {
  runReconciliation().catch(() => {});
}

function onDeferredFilesReady(entries: string[]): void {
  if (!store) return;
  for (const entry of entries) {
    store.addDeferredFileId(entry);
  }
}
