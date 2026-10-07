/**
 * MonitoringSlice.test.ts
 *
 * Unit tests for Slice 5 — Drive push notification monitoring.
 *
 * Strategy:
 *  - The store monitoring slice is tested directly (no mocking needed for state).
 *  - MonitoringService is tested by mocking its imports (DriveService) and
 *    injecting the WinsoftMonitoring native module into NativeModules at runtime,
 *    which the @react-native/jest-preset allows without replacing the whole module.
 *
 * We do NOT do jest.mock('react-native') because:
 *  - The preset already stubs all required native internals.
 *  - Replacing the whole module breaks TurboModuleRegistry in tests.
 */

import { NativeModules, Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import type { FcmRegistrationStatus } from '../store/useAppStore';
import type { Receipt } from '../models/Receipt';

// ---------------------------------------------------------------------------
// Inject WinsoftMonitoring stub into NativeModules before importing service
// ---------------------------------------------------------------------------

const mockGetFcmToken = jest.fn().mockResolvedValue('test-fcm-token');
const mockGetNotificationPermissionStatus = jest.fn().mockResolvedValue('granted');
const mockRequestNotificationPermission = jest.fn().mockResolvedValue('granted');
const mockScheduleReconciliation = jest.fn().mockResolvedValue(true);
const mockGetInitialPrintIntent = jest.fn().mockResolvedValue(null);
const mockGetDeferredFiles = jest.fn().mockResolvedValue([]);
const mockClearDeferredFiles = jest.fn().mockResolvedValue(true);
const mockConsumeDeferredFiles = jest.fn().mockResolvedValue([]);

// Inject before any require of MonitoringService
(NativeModules as Record<string, unknown>).WinsoftMonitoring = {
  getFcmToken: mockGetFcmToken,
  getNotificationPermissionStatus: mockGetNotificationPermissionStatus,
  requestNotificationPermission: mockRequestNotificationPermission,
  scheduleReconciliation: mockScheduleReconciliation,
  cancelReconciliation: jest.fn().mockResolvedValue(true),
  getInitialPrintIntent: mockGetInitialPrintIntent,
  getDeferredFiles: mockGetDeferredFiles,
  clearDeferredFiles: mockClearDeferredFiles,
  consumeDeferredFiles: mockConsumeDeferredFiles,
  copyToClipboard: jest.fn().mockResolvedValue(true),
  getDeviceId: jest.fn().mockResolvedValue('test-device-id'),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

// ---------------------------------------------------------------------------
// Mock DriveService
// ---------------------------------------------------------------------------

const mockListCsvFiles = jest.fn();
const mockDownloadAndParseCsv = jest.fn();
const mockGetFileMetadata = jest.fn();

jest.mock('../services/drive/DriveService', () => ({
  listCsvFiles: (...args: unknown[]) => mockListCsvFiles(...args),
  downloadAndParseCsv: (...args: unknown[]) => mockDownloadAndParseCsv(...args),
  getFileMetadata: (...args: unknown[]) => mockGetFileMetadata(...args),
  moveFile: jest.fn(),
  listFolders: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import service (after NativeModules injection)
// ---------------------------------------------------------------------------

import * as MonitoringService from '../services/monitoring/MonitoringService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReceipt(transNo: string, fileId = 'file-abc'): Receipt {
  return {
    transactionType: 'INV',
    transactionNumber: transNo,
    date: '2024-01-01',
    customer: { code: 'C001', name: 'Test Customer' },
    lineItems: [],
    totals: { subtotal: 100, tax: 0, total: 100 },
    sourceFile: { driveFileId: fileId, driveFileName: 'test.csv' },
  } as unknown as Receipt;
}

function makeParsedCsv(receipts: Receipt[]) {
  return {
    file: { id: receipts[0].sourceFile!.driveFileId, name: 'test.csv', mimeType: 'text/csv' },
    receipts,
    malformedRows: [],
  };
}

function buildStoreAccessor(processQueueMock = jest.fn().mockResolvedValue(undefined)) {
  return {
    getAccessToken: () => 'test-access-token',
    getSourceFolderId: () => 'folder-123',
    getFcmRegistrationStatus: () => useAppStore.getState().fcmRegistrationStatus,
    getCachedFcmToken: () => useAppStore.getState().fcmToken,
    enqueueReceipt: (r: Receipt) => useAppStore.getState().enqueueReceipt(r),
    processQueue: processQueueMock,
    setFcmToken: (t: string) => useAppStore.getState().setFcmToken(t),
    setFcmRegistrationStatus: (s: FcmRegistrationStatus) =>
      useAppStore.getState().setFcmRegistrationStatus(s),
    setServiceAccountEmail: (e: string) => useAppStore.getState().setServiceAccountEmail(e),
    recordDriveNotification: () => useAppStore.getState().recordDriveNotification(),
    recordReconciliation: () => useAppStore.getState().recordReconciliation(),
    setMonitoringError: (msg: string | null) => useAppStore.getState().setMonitoringError(msg),
    addDeferredFileId: (entry: string) => useAppStore.getState().addDeferredFileId(entry),
    removeDeferredFileId: (entry: string) => useAppStore.getState().removeDeferredFileId(entry),
    getDeferredFileIds: () => useAppStore.getState().deferredFileIds,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAppStore.setState({
    queue: [],
    csvProgress: {},
    monitoringEnabled: false,
    fcmToken: null,
    fcmRegistrationStatus: 'unregistered',
    serviceAccountEmail: null,
    lastDriveNotificationAt: null,
    lastReconciliationAt: null,
    lastMonitoringError: null,
    deferredFileIds: [],
    deferredLoadingId: null,
    deferredError: null,
  });

  jest.clearAllMocks();
  mockGetInitialPrintIntent.mockResolvedValue(null);
  mockGetDeferredFiles.mockResolvedValue([]);
  mockClearDeferredFiles.mockResolvedValue(true);
  mockConsumeDeferredFiles.mockResolvedValue([]);
  MonitoringService.destroy();

  // Restore the module stub on NativeModules after clearAllMocks
  mockGetFcmToken.mockResolvedValue('test-fcm-token');
  mockScheduleReconciliation.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Group 1: Store state machine
// ---------------------------------------------------------------------------

describe('MonitoringSlice — store state', () => {
  test('1. enableMonitoring / disableMonitoring toggles state', () => {
    const store = useAppStore.getState();
    expect(store.monitoringEnabled).toBe(false);
    store.enableMonitoring();
    expect(useAppStore.getState().monitoringEnabled).toBe(true);
    store.disableMonitoring();
    expect(useAppStore.getState().monitoringEnabled).toBe(false);
  });

  test('2. setFcmToken stores token', () => {
    useAppStore.getState().setFcmToken('tok-123');
    expect(useAppStore.getState().fcmToken).toBe('tok-123');
  });

  test('3. setFcmRegistrationStatus transitions correctly', () => {
    useAppStore.getState().setFcmRegistrationStatus('registering');
    expect(useAppStore.getState().fcmRegistrationStatus).toBe('registering');
    useAppStore.getState().setFcmRegistrationStatus('registered');
    expect(useAppStore.getState().fcmRegistrationStatus).toBe('registered');
  });

  test('4. addDeferredFileId is idempotent', () => {
    const store = useAppStore.getState();
    store.addDeferredFileId('file-1::folder-1');
    store.addDeferredFileId('file-1::folder-1'); // duplicate
    store.addDeferredFileId('file-2::folder-1');
    expect(useAppStore.getState().deferredFileIds).toHaveLength(2);
  });

  test('5. removeDeferredFileId removes only the specified entry', () => {
    const store = useAppStore.getState();
    store.addDeferredFileId('file-1::folder-1');
    store.addDeferredFileId('file-2::folder-1');
    store.removeDeferredFileId('file-1::folder-1');
    expect(useAppStore.getState().deferredFileIds).toEqual(['file-2::folder-1']);
  });
});

// ---------------------------------------------------------------------------
// Group 2: MonitoringService flows
// ---------------------------------------------------------------------------

describe('MonitoringService — flows', () => {
  const backendUrl = 'https://backend.example.com';

  function mockSuccessBackend() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        serviceAccountEmail: 'sa@test.iam.gserviceaccount.com',
      })),
    } as unknown as Response);
  }

  test('6. handlePrintAction before initialize: no Drive call', async () => {
    // No accessor injected — service not initialized
    await MonitoringService.handlePrintAction({
      fileId: 'file-abc',
      folderId: 'folder-123',
      fileName: 'test.csv',
    });
    expect(mockListCsvFiles).not.toHaveBeenCalled();
  });

  test('7. After initialize: PRINT verifies Drive before enqueue', async () => {
    const receipt = makeReceipt('001');
    mockListCsvFiles.mockResolvedValue([
      { id: 'file-abc', name: 'test.csv', mimeType: 'text/csv' },
    ]);
    mockDownloadAndParseCsv.mockResolvedValue(makeParsedCsv([receipt]));
    mockSuccessBackend();

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    await MonitoringService.handlePrintAction({
      fileId: 'file-abc',
      folderId: 'folder-123',
      fileName: 'test.csv',
    });

    expect(mockListCsvFiles).toHaveBeenCalledWith('test-access-token', 'folder-123');
    expect(mockDownloadAndParseCsv).toHaveBeenCalled();
    const queue = useAppStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].receipt.transactionNumber).toBe('001');
  });

  test('8. Repeated PRINT with same identity → no duplicate in queue', async () => {
    const receipt = makeReceipt('002');
    mockListCsvFiles.mockResolvedValue([
      { id: 'file-abc', name: 'test.csv', mimeType: 'text/csv' },
    ]);
    mockDownloadAndParseCsv.mockResolvedValue(makeParsedCsv([receipt]));
    mockSuccessBackend();

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    await MonitoringService.handlePrintAction({
      fileId: 'file-abc',
      folderId: 'folder-123',
      fileName: 'test.csv',
    });
    await MonitoringService.handlePrintAction({
      fileId: 'file-abc',
      folderId: 'folder-123',
      fileName: 'test.csv',
    });

    const matching = useAppStore.getState().queue.filter(
      q => q.identity === 'file-abc::INV::002',
    );
    expect(matching).toHaveLength(1);
  });

  test('9. PRINT action → processQueue called', async () => {
    const receipt = makeReceipt('003');
    mockListCsvFiles.mockResolvedValue([
      { id: 'file-abc', name: 'test.csv', mimeType: 'text/csv' },
    ]);
    mockDownloadAndParseCsv.mockResolvedValue(makeParsedCsv([receipt]));
    mockSuccessBackend();

    const processQueueMock = jest.fn().mockResolvedValue(undefined);
    const accessor = buildStoreAccessor(processQueueMock);
    await MonitoringService.initialize(accessor, backendUrl);
    await MonitoringService.handlePrintAction({
      fileId: 'file-abc',
      folderId: 'folder-123',
      fileName: 'test.csv',
    });

    expect(processQueueMock).toHaveBeenCalledTimes(1);
  });

  test('10. LATER action → deferredFileIds grows, queue stays empty', async () => {
    mockSuccessBackend();
    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    MonitoringService.handleLaterAction('file-later', 'folder-123');

    expect(useAppStore.getState().deferredFileIds).toContain('file-later::folder-123');
    expect(useAppStore.getState().queue).toHaveLength(0);
  });

  test('11. Reconciliation enqueues CSV without calling processQueue', async () => {
    const receipt = makeReceipt('005');
    mockListCsvFiles.mockResolvedValue([
      { id: 'file-abc', name: 'test.csv', mimeType: 'text/csv' },
    ]);
    mockDownloadAndParseCsv.mockResolvedValue(makeParsedCsv([receipt]));
    mockSuccessBackend();

    const processQueueMock = jest.fn().mockResolvedValue(undefined);
    const accessor = buildStoreAccessor(processQueueMock);
    await MonitoringService.initialize(accessor, backendUrl);
    await MonitoringService.runReconciliation();

    expect(useAppStore.getState().queue).toHaveLength(1);
    expect(processQueueMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().lastReconciliationAt).not.toBeNull();
  });

  test('12. Drive error in PRINT action → setMonitoringError, queue unchanged', async () => {
    mockListCsvFiles.mockResolvedValue([
      { id: 'file-abc', name: 'bad.csv', mimeType: 'text/csv' },
    ]);
    mockDownloadAndParseCsv.mockRejectedValue(new Error('CSV missing required columns'));
    mockSuccessBackend();

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    await MonitoringService.handlePrintAction({
      fileId: 'file-abc',
      folderId: 'folder-123',
      fileName: 'bad.csv',
    });

    expect(useAppStore.getState().lastMonitoringError).toMatch(/Print action failed/);
    expect(useAppStore.getState().queue).toHaveLength(0);
  });

  test('13. Network failure during registration → fcmRegistrationStatus = error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    try {
      await MonitoringService.registerDevice('fake-token', 'folder-123');
    } catch (_) {
      // Expected to throw after setting error state
    }

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
    expect(useAppStore.getState().lastMonitoringError).toMatch(/Registration failed/);
  });

  test('13b. HTTP error with JSON body → exposes structured error message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json; charset=utf-8' },
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'startPageToken failed: 403' })),
    } as unknown as Response);

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.getState().setFcmToken('token-ok');
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    await MonitoringService.ensureRegistered();

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
    expect(useAppStore.getState().lastMonitoringError).toMatch(/startPageToken failed/);
  });

  test('13c. HTTP 500 with non-JSON body → truncated safe body exposed, no JSON crash', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'text/html' },
      text: jest.fn().mockResolvedValue('<html><body>Internal Server Error</body></html>'),
    } as unknown as Response);

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.getState().setFcmToken('token-ok');
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    await MonitoringService.ensureRegistered();

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
    // Must include HTTP status; must NOT throw JSON parse error
    expect(useAppStore.getState().lastMonitoringError).toMatch(/HTTP 500/);
  });

  test('13d. 2xx with non-JSON content-type → descriptive error, not JSON crash', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain' },
      text: jest.fn().mockResolvedValue('OK'),
    } as unknown as Response);

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.getState().setFcmToken('token-ok');
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    await MonitoringService.ensureRegistered();

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
    expect(useAppStore.getState().lastMonitoringError).toMatch(/non-JSON/);
  });


  test('14. Already-PRINTED transaction cannot be re-enqueued', () => {
    const receipt = makeReceipt('008');
    const store = useAppStore.getState();

    store.enqueueReceipt(receipt);
    expect(useAppStore.getState().queue[0].status).toBe('QUEUED');

    // Simulate it being printed
    const { queue: currentQueue } = useAppStore.getState();
    const updatedQueue = currentQueue.map(q =>
      q.identity === 'file-abc::INV::008' ? { ...q, status: 'PRINTED' as const } : q,
    );
    useAppStore.setState({ queue: updatedQueue });

    // Try to enqueue again — duplicate protection prevents it
    store.enqueueReceipt(receipt);
    const matching = useAppStore.getState().queue.filter(
      q => q.identity === 'file-abc::INV::008',
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].status).toBe('PRINTED');
  });
});

// ---------------------------------------------------------------------------
// Group 3: ensureRegistered()
// ---------------------------------------------------------------------------

describe('MonitoringService — ensureRegistered()', () => {
  const backendUrl = 'https://backend.example.com';

  function mockSuccessBackend() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        serviceAccountEmail: 'sa@project.iam.gserviceaccount.com',
      })),
    } as unknown as Response);
  }

  test('15. Enabling monitoring with token + folderId registers device and stores serviceAccountEmail', async () => {
    mockSuccessBackend();

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    // Pre-populate the cached token in store (simulates what initialize() does on Android).
    useAppStore.getState().setFcmToken('fresh-token');
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    await MonitoringService.ensureRegistered();

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('registered');
    expect(useAppStore.getState().serviceAccountEmail).toBe('sa@project.iam.gserviceaccount.com');
    expect(useAppStore.getState().lastMonitoringError).toBeNull();
  });

  test('16. Missing sourceFolderId → sets error, does NOT call registerdevice', async () => {
    const accessor = {
      ...buildStoreAccessor(),
      getSourceFolderId: () => null as string | null,
    };
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.getState().setFcmToken('some-token');
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    global.fetch = jest.fn();
    await MonitoringService.ensureRegistered();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(useAppStore.getState().lastMonitoringError).toMatch(/Source Folder/);
  });

  test('17. No cached token and WinsoftMonitoring unavailable → status = error, message explains', async () => {
    // In tests WinsoftMonitoring is not available as a module-level reference.
    // Simulate: no cached token in store, so ensureRegistered cannot get one.
    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    // Do NOT set fcmToken — simulates missing token
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    global.fetch = jest.fn();
    await MonitoringService.ensureRegistered();

    // No token available, no WinsoftMonitoring in test env — expect error state
    expect(global.fetch).not.toHaveBeenCalled();
    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
    expect(useAppStore.getState().lastMonitoringError).toMatch(/FCM token/);
  });

  test('18. Registration HTTP failure → status = error, lastMonitoringError set', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json; charset=utf-8' },
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Service unavailable' })),
    } as unknown as Response);

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.getState().setFcmToken('token-ok');
    useAppStore.getState().setFcmRegistrationStatus('unregistered');

    await MonitoringService.ensureRegistered();

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
    expect(useAppStore.getState().lastMonitoringError).toMatch(/Registration failed/);
  });

  test('19. Already registered → ensureRegistered is a no-op (fetch not called again)', async () => {
    mockSuccessBackend();

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    // Manually mark as registered
    useAppStore.getState().setFcmRegistrationStatus('registered');

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    await MonitoringService.ensureRegistered();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('20. Repeated initialize() does not create duplicate native subscriptions', async () => {
    mockSuccessBackend();
    const accessor = buildStoreAccessor();

    await MonitoringService.initialize(accessor, backendUrl);
    const addListenerCallCount1 = (NativeModules.WinsoftMonitoring.addListener as jest.Mock).mock.calls.length;

    // Second initialize — subscriptions.length > 0 guard should prevent new adds
    await MonitoringService.initialize(accessor, backendUrl);
    const addListenerCallCount2 = (NativeModules.WinsoftMonitoring.addListener as jest.Mock).mock.calls.length;

    expect(addListenerCallCount2).toBe(addListenerCallCount1);
  });
});

// ---------------------------------------------------------------------------
// Group 4: LATER / Deferred Receipt Flow
// ---------------------------------------------------------------------------

describe('MonitoringSlice — LATER / Deferred Receipts', () => {
  const backendUrl = 'https://backend.example.com';

  function mockSuccessBackend() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        ok: true,
        serviceAccountEmail: 'sa@test.iam.gserviceaccount.com',
      })),
    } as unknown as Response);
  }

  test('21. addDeferredFileId upgrades entry with rich fileName and deduplicates by fileId', () => {
    const store = useAppStore.getState();
    store.addDeferredFileId('file-100::folder-1');
    expect(useAppStore.getState().deferredFileIds).toEqual(['file-100::folder-1']);

    // Duplicate fileId with fileName upgrades the entry
    store.addDeferredFileId('file-100::folder-1::Invoice.csv');
    expect(useAppStore.getState().deferredFileIds).toEqual(['file-100::folder-1::Invoice.csv']);

    // Duplicate without fileName does not downgrade
    store.addDeferredFileId('file-100::folder-1');
    expect(useAppStore.getState().deferredFileIds).toEqual(['file-100::folder-1::Invoice.csv']);
  });

  test('22. removeDeferredFileId matches by fileId prefix', () => {
    const store = useAppStore.getState();
    store.addDeferredFileId('file-200::folder-1::Receipt.csv');
    store.removeDeferredFileId('file-200::folder-1');
    expect(useAppStore.getState().deferredFileIds).toHaveLength(0);
  });

  test('23. Native clearDeferredFiles acknowledgement on initialize()', async () => {
    const origPlatform = Platform.OS;
    (Platform as { OS: string }).OS = 'android';
    try {
      mockSuccessBackend();
      mockGetDeferredFiles.mockResolvedValue(['file-init::folder-1::init.csv']);

      const accessor = buildStoreAccessor();
      await MonitoringService.initialize(accessor, backendUrl);

      expect(useAppStore.getState().deferredFileIds).toContain('file-init::folder-1::init.csv');
      expect(mockClearDeferredFiles).toHaveBeenCalledWith(['file-init::folder-1::init.csv']);
    } finally {
      (Platform as { OS: string }).OS = origPlatform;
    }
  });

  test('24. Native clearDeferredFiles acknowledgement on LATER action', async () => {
    mockSuccessBackend();
    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);

    MonitoringService.onLaterActionReceived({
      fileId: 'file-evt',
      folderId: 'folder-1',
      fileName: 'bill.csv',
    });

    expect(useAppStore.getState().deferredFileIds).toContain('file-evt::folder-1::bill.csv');
    expect(mockClearDeferredFiles).toHaveBeenCalledWith([
      'file-evt::folder-1::bill.csv',
      'file-evt::folder-1',
    ]);
  });

  test('25. enqueueDeferredFile: success with multiple receipts and no processQueue() call', async () => {
    const r1 = makeReceipt('010', 'file-multi');
    const r2 = makeReceipt('011', 'file-multi');
    mockGetFileMetadata.mockResolvedValue({
      id: 'file-multi',
      name: 'multi.csv',
      mimeType: 'text/csv',
    });
    mockDownloadAndParseCsv.mockResolvedValue(makeParsedCsv([r1, r2]));

    useAppStore.setState({
      accessToken: 'valid-token',
      sourceFolderId: 'folder-123',
      deferredFileIds: ['file-multi::folder-123::multi.csv'],
    });

    const store = useAppStore.getState();
    const success = await store.enqueueDeferredFile('file-multi::folder-123::multi.csv');

    expect(success).toBe(true);
    expect(useAppStore.getState().deferredFileIds).toHaveLength(0);
    const queue = useAppStore.getState().queue;
    expect(queue).toHaveLength(2);
    expect(queue[0].identity).toBe('file-multi::INV::010');
    expect(queue[0].status).toBe('QUEUED');
    expect(queue[1].identity).toBe('file-multi::INV::011');
    expect(queue[1].status).toBe('QUEUED');

    // Expected count in csvProgress tracked for auto-archive
    expect(useAppStore.getState().csvProgress['file-multi']?.expectedCount).toBe(2);

    // Verify processQueue was NOT called (no auto-printing)
    expect(useAppStore.getState().printLoading).toBe(false);
  });

  test('26. Drive/download failure preserves deferred item and sets deferredError', async () => {
    mockGetFileMetadata.mockRejectedValue(new Error('Network timeout'));
    mockListCsvFiles.mockRejectedValue(new Error('Folder unreadable'));
    mockDownloadAndParseCsv.mockRejectedValue(new Error('Download failed: 503'));

    useAppStore.setState({
      accessToken: 'valid-token',
      sourceFolderId: 'folder-123',
      deferredFileIds: ['file-err::folder-123::err.csv'],
    });

    const store = useAppStore.getState();
    const success = await store.enqueueDeferredFile('file-err::folder-123::err.csv');

    expect(success).toBe(false);
    // Item is preserved!
    expect(useAppStore.getState().deferredFileIds).toEqual(['file-err::folder-123::err.csv']);
    expect(useAppStore.getState().deferredError).toMatch(/Download failed: 503/);
    expect(useAppStore.getState().queue).toHaveLength(0);
  });

  test('27. Reconciliation ignores explicitly deferred file IDs', async () => {
    const freshReceipt = makeReceipt('999', 'file-fresh');
    mockListCsvFiles.mockResolvedValue([
      { id: 'file-deferred', name: 'deferred.csv', mimeType: 'text/csv' },
      { id: 'file-fresh', name: 'fresh.csv', mimeType: 'text/csv' },
    ]);
    mockDownloadAndParseCsv.mockResolvedValue(makeParsedCsv([freshReceipt]));
    mockSuccessBackend();

    useAppStore.setState({
      accessToken: 'valid-token',
      sourceFolderId: 'folder-123',
      deferredFileIds: ['file-deferred::folder-123::deferred.csv'],
    });

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    await MonitoringService.runReconciliation();

    // Only file-fresh was downloaded & enqueued
    expect(mockDownloadAndParseCsv).toHaveBeenCalledTimes(1);
    expect(mockDownloadAndParseCsv).toHaveBeenCalledWith(
      'test-access-token',
      expect.objectContaining({ id: 'file-fresh' }),
    );

    const queue = useAppStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].identity).toBe('file-fresh::INV::999');

    // file-deferred is STILL in deferredFileIds
    expect(useAppStore.getState().deferredFileIds).toContain(
      'file-deferred::folder-123::deferred.csv',
    );
  });

  test('28. enqueueAllDeferredFiles enqueues all entries', async () => {
    const r1 = makeReceipt('101', 'file-a');
    const r2 = makeReceipt('102', 'file-b');
    mockGetFileMetadata.mockImplementation((_tok, id) =>
      Promise.resolve({ id, name: `${id}.csv`, mimeType: 'text/csv' }),
    );
    mockDownloadAndParseCsv.mockImplementation((_tok, file) => {
      const receipt = file.id === 'file-a' ? r1 : r2;
      return Promise.resolve(makeParsedCsv([receipt]));
    });

    useAppStore.setState({
      accessToken: 'valid-token',
      sourceFolderId: 'folder-123',
      deferredFileIds: ['file-a::folder-123', 'file-b::folder-123'],
    });

    const store = useAppStore.getState();
    await store.enqueueAllDeferredFiles();

    expect(useAppStore.getState().deferredFileIds).toHaveLength(0);
    expect(useAppStore.getState().queue).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Reconnect / Disconnect Lifecycle & Clipboard
  // ---------------------------------------------------------------------------

  test('29. reconnect() checks permission, refreshes token, calls backend with forceRefresh: true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      text: jest.fn().mockResolvedValue(JSON.stringify({
        status: 'ok',
        channelId: 'new-chan-456',
        serviceAccountEmail: 'sa@example.com',
      })),
    } as unknown as Response);

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.setState({ sourceFolderId: 'folder-123' });
    mockGetFcmToken.mockResolvedValue('fresh-fcm-token');

    await MonitoringService.reconnect();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://backend.example.com/registerdevice',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"forceRefresh":true'),
      }),
    );
    expect(useAppStore.getState().fcmRegistrationStatus).toBe('registered');
    expect(useAppStore.getState().serviceAccountEmail).toBe('sa@example.com');
  });

  test('30. reconnect() throws if sourceFolderId is missing', async () => {
    const accessor = {
      ...buildStoreAccessor(),
      getSourceFolderId: () => null as string | null,
    };
    await MonitoringService.initialize(accessor, backendUrl);

    await expect(MonitoringService.reconnect()).rejects.toThrow(/Incoming Drive folder not configured/);
    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
  });

  test('31. reconnect() throws if notification permission is denied', async () => {
    mockGetNotificationPermissionStatus.mockResolvedValueOnce('denied');
    mockRequestNotificationPermission.mockResolvedValueOnce('denied');

    const accessor = buildStoreAccessor();
    await MonitoringService.initialize(accessor, backendUrl);
    useAppStore.setState({ sourceFolderId: 'folder-123' });

    await expect(MonitoringService.reconnect()).rejects.toThrow(/Notification permission is disabled/);
    expect(useAppStore.getState().fcmRegistrationStatus).toBe('error');
  });

  test('32. disconnect() resets status to unregistered and clears error', () => {
    const accessor = buildStoreAccessor();
    void MonitoringService.initialize(accessor, backendUrl);
    useAppStore.setState({
      fcmRegistrationStatus: 'registered',
      lastMonitoringError: 'some error',
    });

    MonitoringService.disconnect();

    expect(useAppStore.getState().fcmRegistrationStatus).toBe('unregistered');
    expect(useAppStore.getState().lastMonitoringError).toBeNull();
  });

  test('33. copyToClipboard() calls native module clipboard method', async () => {
    const res = await MonitoringService.copyToClipboard('test-text');
    expect(res).toBe(true);
  });
});

