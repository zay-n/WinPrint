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
  WinsoftMonitoring?: {
    getFcmToken(): Promise<string>;
    getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'requested'>;
    requestNotificationPermission(): Promise<'granted' | 'denied' | 'requested'>;
    scheduleReconciliation(): Promise<boolean>;
    cancelReconciliation(): Promise<boolean>;
    getInitialPrintIntent(): Promise<PrintIntentData | null>;
    getDeferredFiles?(): Promise<string[]>;
    clearDeferredFiles?(entries: string[]): Promise<boolean>;
    consumeDeferredFiles(): Promise<string[]>;
    copyToClipboard?(text: string): Promise<boolean>;
    getDeviceId?(): Promise<string>;
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

export interface StoreAccessor {
  getAccessToken: () => string | null;
  getSourceFolderId: () => string | null;
  getSourceFolderName?: () => string | null;
  getFcmRegistrationStatus: () => FcmStatus;
  getCachedFcmToken: () => string | null;
  getUserId?: () => string | null;
  getUserEmail?: () => string | null;
  getBusinessId?: () => string | null;
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
  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  if (!native) {
    store.setMonitoringError('WinsoftMonitoring native module not found.');
    return;
  }

  // Subscribe to native events.
  if (subscriptions.length === 0) {
    eventEmitter = new NativeEventEmitter(native as never);
     
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
    const initialIntent = await native.getInitialPrintIntent();
    if (initialIntent) {
      await handlePrintAction(initialIntent);
    }
  } catch (_) {
    // Non-fatal — continue initialisation.
  }

  // Retrieve FCM token.
  try {
    const token = await native.getFcmToken();
    if (token) {
      store.setFcmToken(token);
      const folderId = store.getSourceFolderId();
      if (folderId) {
        await registerDevice(token, folderId, false).catch(() => {});
      }
    }
  } catch (e) {
    store.setMonitoringError(`FCM token error: ${String(e)}`);
  }

  // Schedule WorkManager reconciliation (idempotent).
  try {
    await native.scheduleReconciliation();
  } catch (_) {
    // Not fatal — FCM is the primary path.
  }

  // Check for deferred files from previous LATER taps.
  await processDeferredNativeFiles();
}

// ---------------------------------------------------------------------------
// Device registration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Device registration & Push Connection Lifecycle
// ---------------------------------------------------------------------------

/**
 * Returns true if initialize() has been called with a valid store accessor.
 */
export function isInitialized(): boolean {
  return _initialized && store !== null;
}

/**
 * Primary device registration call.
 * Sends FCM token, folder info, user identity, and device metadata to Cloud Function /registerdevice.
 */
export async function registerDevice(
  fcmToken: string,
  folderId: string,
  forceRefresh = false,
): Promise<void> {
  if (!store || !backendUrl) return;

  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  let deviceId: string | undefined;
  if (native && typeof native.getDeviceId === 'function') {
    try {
      deviceId = await native.getDeviceId();
    } catch (_) {}
  }

  const tokenSuffix = fcmToken.length > 6 ? `...${fcmToken.slice(-6)}` : fcmToken;
  console.log(`[WinPrint][Push] FCM token obtained (length: ${fcmToken.length}, suffix: ${tokenSuffix})`);
  console.log(`[WinPrint][Push] Registering device (folderId: ${folderId})`);

  store.setFcmRegistrationStatus('registering');
  const url = `${backendUrl}/registerdevice`;

  try {
    const payload = {
      fcmToken,
      folderId,
      folderName: store.getSourceFolderName?.() ?? undefined,
      uid: store.getUserId?.() ?? undefined,
      userEmail: store.getUserEmail?.() ?? undefined,
      businessId: store.getBusinessId?.() ?? undefined,
      platform: Platform.OS,
      appVersion: '1.0.0',
      deviceId,
      forceRefresh,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawBody = await resp.text();
    const contentType = resp.headers.get('content-type') ?? '';

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(rawBody) as { error?: string; message?: string; serviceAccountEmail?: string };
          if (parsed.serviceAccountEmail) {
            store.setServiceAccountEmail(parsed.serviceAccountEmail);
          }
          if (parsed.error === 'FOLDER_NOT_SHARED') {
            errMsg = parsed.message || 'Incoming folder is not shared with the monitoring service account.';
          } else {
            errMsg = parsed.message || parsed.error || errMsg;
          }
        } catch (_) {}
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

    const data = JSON.parse(rawBody) as {
      serviceAccountEmail?: string;
      channelId?: string;
      status?: string;
    };

    store.setFcmRegistrationStatus('registered');
    if (data.serviceAccountEmail) {
      store.setServiceAccountEmail(data.serviceAccountEmail);
    }
    store.setMonitoringError(null);

    console.log(`[WinPrint][Push] Registration successful (channelId: ${data.channelId ?? 'active'})`);
    console.log('[WinPrint][Push] Push connection connected');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    store.setFcmRegistrationStatus('error');
    store.setMonitoringError(`Registration failed: ${msg}`);
    console.error(`[WinPrint][Push] Registration failed: ${msg}`);
    throw e;
  }
}

/**
 * Ensures the device is registered with the backend.
 * Called automatically when user signs in or app boots with an active Incoming folder.
 * Safe to call multiple times.
 */
export async function ensureRegistered(): Promise<void> {
  if (!store || !_initialized) return;

  // If already registered and valid, nothing to do
  const currentStatus = store.getFcmRegistrationStatus();
  if (currentStatus === 'registered') return;

  const folderId = store.getSourceFolderId();
  if (!folderId) {
    store.setMonitoringError('Incoming Source Folder not configured.');
    return;
  }

  const token = store.getCachedFcmToken();
  if (!token) {
    store.setFcmRegistrationStatus('error');
    store.setMonitoringError(
      'FCM token not available. Background monitoring cannot register until a push token is obtained.',
    );
    return;
  }

  try {
    await registerDevice(token, folderId, false);
  } catch (e) {
    console.warn('[WinPrint][Push] ensureRegistered error:', e);
  }
}

/**
 * Re-register with the backend using the cached FCM token and updated folder ID.
 */
export async function updateMonitoredFolder(folderId: string): Promise<void> {
  if (!store || !_initialized) return;
  const token = store.getCachedFcmToken();
  if (token && backendUrl) {
    await registerDevice(token, folderId, true).catch(() => {});
  }
}

/**
 * Actionable Reconnect/Connect flow triggered from SettingsScreen.
 * Requests notification permission if missing, refreshes token, and re-registers device.
 */
export async function reconnect(): Promise<void> {
  if (!store) throw new Error('Monitoring service not initialized');

  const folderId = store.getSourceFolderId();
  if (!folderId) {
    const err = 'Incoming Drive folder not configured. Please select an Incoming folder first.';
    store.setMonitoringError(err);
    store.setFcmRegistrationStatus('error');
    throw new Error(err);
  }

  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  if (!native) {
    const err = 'Native monitoring module not available.';
    store.setMonitoringError(err);
    store.setFcmRegistrationStatus('error');
    throw new Error(err);
  }

  // Check / request notification permission
  let perm: string = 'granted';
  try {
    perm = await native.getNotificationPermissionStatus();
  } catch (_) {}

  if (perm === 'denied') {
    let requested = 'denied';
    try {
      requested = await native.requestNotificationPermission();
    } catch (_) {}
    if (requested === 'denied') {
      const err = 'Notification permission is disabled in Android settings.';
      store.setMonitoringError(err);
      store.setFcmRegistrationStatus('error');
      throw new Error(err);
    }
  }

  store.setFcmRegistrationStatus('registering');
  store.setMonitoringError(null);

  // Retrieve fresh token
  let token: string | null = null;
  try {
    token = await native.getFcmToken();
    if (token) {
      store.setFcmToken(token);
    }
  } catch (e) {
    const err = `Cannot obtain FCM token: ${String(e)}`;
    store.setMonitoringError(err);
    store.setFcmRegistrationStatus('error');
    throw new Error(err);
  }

  if (!token) {
    const err = 'FCM token not available.';
    store.setMonitoringError(err);
    store.setFcmRegistrationStatus('error');
    throw new Error(err);
  }

  await registerDevice(token, folderId, true);
}

/**
 * Disconnects the local push state (called on sign out).
 */
export function disconnect(): void {
  if (!store) return;
  store.setFcmRegistrationStatus('unregistered');
  store.setMonitoringError(null);
}

/**
 * Copy text to system clipboard via native module.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  if (native && typeof native.copyToClipboard === 'function') {
    return native.copyToClipboard(text);
  }
  return false;
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

export function handleLaterAction(fileId: string, folderId: string, fileName?: string): void {
  if (!store) return;
  const entry = fileName ? `${fileId}::${folderId}::${fileName}` : `${fileId}::${folderId}`;
  store.addDeferredFileId(entry);
}

// ---------------------------------------------------------------------------
// Reconciliation (WorkManager fallback)
// ---------------------------------------------------------------------------

/**
 * Run a reconciliation pass:
 *  - List all CSVs currently in the Incoming Drive folder.
 *  - Enqueue any that haven't already been processed (duplicate protection).
 *  - Skips files currently present in deferredFileIds (respects user LATER choice).
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

  const deferredIds = store.getDeferredFileIds ? store.getDeferredFileIds() : [];
  const deferredSet = new Set(deferredIds.map(d => d.split('::')[0]));

  try {
    const csvFiles = await DriveService.listCsvFiles(accessToken, folderId);
    for (const file of csvFiles) {
      // Prevent normal reconciliation from automatically enqueuing explicitly deferred files
      if (deferredSet.has(file.id)) {
        continue;
      }
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
  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  if (!native || !store) return;
  try {
    if (typeof native.getDeferredFiles === 'function') {
      const entries = await native.getDeferredFiles();
      if (entries && entries.length > 0) {
        for (const entry of entries) {
          const [fileId, folderId] = entry.split('::');
          if (fileId && folderId) {
            store.addDeferredFileId(entry);
          }
        }
        if (typeof native.clearDeferredFiles === 'function') {
          await native.clearDeferredFiles(entries);
        }
      }
    } else if (typeof native.consumeDeferredFiles === 'function') {
      const entries = await native.consumeDeferredFiles();
      for (const entry of entries) {
        const [fileId, folderId] = entry.split('::');
        if (fileId && folderId) {
          store.addDeferredFileId(entry);
        }
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
  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  if (!native) return 'unavailable';
  return native.requestNotificationPermission();
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
  if (!native) return 'unavailable';
  return native.getNotificationPermissionStatus();
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
  // Re-register with the updated token if a folder is configured.
  const folderId = store.getSourceFolderId();
  if (folderId) {
    registerDevice(token, folderId, true).catch(() => {});
  }
}

function onPrintActionReceived(data: PrintIntentData): void {
  handlePrintAction(data).catch(() => {});
}

export function onLaterActionReceived(data: { fileId: string; folderId: string; fileName?: string }): void {
  handleLaterAction(data.fileId, data.folderId, data.fileName);
  const entry = data.fileName
    ? `${data.fileId}::${data.folderId}::${data.fileName}`
    : `${data.fileId}::${data.folderId}`;
  try {
    const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
    if (native && typeof native.clearDeferredFiles === 'function') {
      void native.clearDeferredFiles([entry, `${data.fileId}::${data.folderId}`]);
    }
  } catch (_) {
    // Non-fatal
  }
}

export function onReconciliationRequested(): void {
  runReconciliation().catch(() => {});
}

export function onDeferredFilesReady(entries: string[]): void {
  if (!store || !entries || entries.length === 0) return;
  for (const entry of entries) {
    store.addDeferredFileId(entry);
  }
  try {
    const native = NativeModules.WinsoftMonitoring || WinsoftMonitoring;
    if (native && typeof native.clearDeferredFiles === 'function') {
      void native.clearDeferredFiles(entries);
    }
  } catch (_) {
    // Non-fatal
  }
}
