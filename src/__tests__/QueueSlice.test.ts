import { useAppStore } from '../store/useAppStore';
import * as DriveService from '../services/drive/DriveService';
import type { Receipt } from '../models/Receipt';

jest.mock('../services/drive/DriveService', () => ({
  moveFile: jest.fn(),
  listFolders: jest.fn(),
  listCsvFiles: jest.fn(),
  downloadAndParseCsv: jest.fn(),
}));

jest.mock('../services/printer/PrinterService', () => ({
  PrinterService: {
    getAdapter: jest.fn(() => ({ print: jest.fn().mockResolvedValue({ success: true }) })),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

const defaultPrintReceipt = useAppStore.getState().printReceipt;

const mockReceipt = (transactionNumber: string, driveFileId: string): Receipt => ({
  sourceRows: [],
  transactionType: 'INVOICE',
  transactionNumber,
  date: '2023-10-01',
  customer: { name: 'Test Customer' } as any,
  financials: { total: 100 } as any,
  additional: {} as any,
  items: [],
  sourceFile: {
    driveFileId,
    driveFileName: 'test.csv',
  }
});

describe('QueueSlice in useAppStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      queue: [],
      csvProgress: {},
      reprintHistory: [],
      accessToken: 'dummy-token',
      user: {id: 'user-1', email: 'user@example.com', name: 'Test', photo: null},
      archiveFolderId: 'archive-id',
      printReceipt: defaultPrintReceipt,
    });
  });

  it('enqueues receipt and prevents duplicates', () => {
    const store = useAppStore.getState();
    const receipt = mockReceipt('001', 'file-1');

    store.enqueueReceipt(receipt);
    expect(useAppStore.getState().queue).toHaveLength(1);
    expect(useAppStore.getState().queue[0].status).toBe('QUEUED');

    // duplicate should be ignored
    store.enqueueReceipt(receipt);
    expect(useAppStore.getState().queue).toHaveLength(1);
  });

  it('keeps multiple transactions in one CSV independent', () => {
    const store = useAppStore.getState();
    const r1 = mockReceipt('001', 'file-1');
    const r2 = mockReceipt('002', 'file-1');

    store.enqueueReceipt(r1);
    store.enqueueReceipt(r2);
    expect(useAppStore.getState().queue).toHaveLength(2);
  });

  it('archives only after all expected transactions print', async () => {
    useAppStore.setState({
      csvProgress: {
        'file-1': {
          driveFileId: 'file-1',
          sourceFolderId: 'incoming-id',
          expectedCount: 2,
          printedCount: 0,
          archiveStatus: 'PENDING',
        }
      }
    });

    const store = useAppStore.getState();
    const r1 = mockReceipt('001', 'file-1');
    const r2 = mockReceipt('002', 'file-1');

    store.enqueueReceipt(r1);
    store.enqueueReceipt(r2);

    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'PRINTING');
    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'PRINTED');

    // One printed, should not archive yet
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().csvProgress['file-1'].printedCount).toBe(1);

    await useAppStore.getState().updateQueueItemStatus(r2.sourceFile!.driveFileId + '::INVOICE::002', 'PRINTING');
    await useAppStore.getState().updateQueueItemStatus(r2.sourceFile!.driveFileId + '::INVOICE::002', 'PRINTED');

    // Both printed, should archive
    expect(DriveService.moveFile).toHaveBeenCalledWith('file-1', 'incoming-id', 'archive-id');
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('ARCHIVED');
    expect(useAppStore.getState().csvProgress['file-1'].printedCount).toBe(2);
  });

  it('handles print failure without archiving', async () => {
    useAppStore.setState({
      csvProgress: {
        'file-1': {
          driveFileId: 'file-1',
          sourceFolderId: 'incoming-id',
          expectedCount: 1,
          printedCount: 0,
          archiveStatus: 'PENDING',
        }
      }
    });

    const store = useAppStore.getState();
    const r1 = mockReceipt('001', 'file-1');
    store.enqueueReceipt(r1);

    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'PRINTING');
    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'FAILED', 'Printer error');

    expect(useAppStore.getState().queue[0].status).toBe('FAILED');
    expect(useAppStore.getState().queue[0].error).toBe('Printer error');
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().csvProgress['file-1'].printedCount).toBe(0);
  });

  it('handles archive failure after successful print', async () => {
    (DriveService.moveFile as jest.Mock).mockRejectedValue(new Error('Network error'));

    useAppStore.setState({
      csvProgress: {
        'file-1': {
          driveFileId: 'file-1',
          sourceFolderId: 'incoming-id',
          expectedCount: 1,
          printedCount: 0,
          archiveStatus: 'PENDING',
        }
      }
    });

    const store = useAppStore.getState();
    const r1 = mockReceipt('001', 'file-1');
    store.enqueueReceipt(r1);

    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'PRINTING');
    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'PRINTED');

    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('FAILED');
    expect(useAppStore.getState().csvProgress['file-1'].archiveError).toBe('Network error');
  });

  it('can retry archive without reprinting', async () => {
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);

    useAppStore.setState({
      csvProgress: {
        'file-1': {
          driveFileId: 'file-1',
          sourceFolderId: 'incoming-id',
          expectedCount: 1,
          printedCount: 1,
          archiveStatus: 'FAILED',
          archiveError: 'Network error',
        }
      }
    });

    await useAppStore.getState().retryArchive('file-1');

    expect(DriveService.moveFile).toHaveBeenCalledWith('file-1', 'incoming-id', 'archive-id');
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('ARCHIVED');
  });

  it('restores a completed print archive operation after restart without enqueueing or printing', async () => {
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    useAppStore.setState({
      csvProgress: { 'file-1': { driveFileId: 'file-1', sourceFolderId: 'incoming', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVING' } },
    });
    await useAppStore.getState().resumePendingArchives();
    expect(DriveService.moveFile).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().queue).toHaveLength(0);
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('ARCHIVED');
  });

  it('prepares durable CSV accounting before receipts are enqueued and preserves duplicate discovery', () => {
    const store = useAppStore.getState();
    store.prepareCsvForQueue('file-3', 'incoming', 2);
    store.enqueueReceipt(mockReceipt('003', 'file-3'));
    store.prepareCsvForQueue('file-3', 'incoming', 2);
    store.enqueueReceipt(mockReceipt('003', 'file-3'));
    expect(useAppStore.getState().csvProgress['file-3']).toMatchObject({ expectedCount: 2, printedCount: 0, archiveStatus: 'PENDING' });
    expect(useAppStore.getState().queue).toHaveLength(1);
    expect(DriveService.moveFile).not.toHaveBeenCalled();
  });

  it('reprints a saved printed receipt without changing original state or moving its CSV', async () => {
    const receipt = { ...mockReceipt('001', 'file-1'), sourceRows: [{ transtype: 'INVOICE' }], items: [{ sourceFields: {}, description: 'Saved item' }] } as Receipt;
    useAppStore.setState({
      queue: [{ identity: 'file-1::INVOICE::001', status: 'PRINTED', receipt, queuedAt: 1, completedAt: 2 }],
      csvProgress: { 'file-1': { driveFileId: 'file-1', sourceFolderId: 'incoming', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED' } },
    });

    const result = await useAppStore.getState().reprintReceipt('file-1::INVOICE::001');

    expect(result.success).toBe(true);
    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('ARCHIVED');
    expect(useAppStore.getState().reprintHistory).toMatchObject([{identity: 'file-1::INVOICE::001', success: true}]);
    expect(DriveService.moveFile).not.toHaveBeenCalled();
  });

  it('keeps original printed and archive state when a reprint fails', async () => {
    const receipt = { ...mockReceipt('004', 'file-4'), sourceRows: [{ transtype: 'INVOICE' }], items: [{ sourceFields: {}, description: 'Saved item' }] } as Receipt;
    useAppStore.setState({
      queue: [{ identity: 'file-4::INVOICE::004', status: 'PRINTED', receipt, queuedAt: 1, completedAt: 2 }],
      csvProgress: { 'file-4': { driveFileId: 'file-4', sourceFolderId: 'incoming', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED' } },
    });
    const { PrinterService } = require('../services/printer/PrinterService');
    (PrinterService.getAdapter as jest.Mock).mockReturnValue({ print: jest.fn().mockResolvedValue({ success: false, error: 'Printer offline' }) });

    const result = await useAppStore.getState().reprintReceipt('file-4::INVOICE::004');

    expect(result.success).toBe(false);
    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(useAppStore.getState().csvProgress['file-4'].archiveStatus).toBe('ARCHIVED');
    expect(useAppStore.getState().reprintHistory).toMatchObject([{identity: 'file-4::INVOICE::004', success: false, error: 'Printer offline'}]);
    expect(DriveService.moveFile).not.toHaveBeenCalled();
  });

  it('does not start a second print for a rapid duplicate reprint request', async () => {
    const receipt = { ...mockReceipt('002', 'file-2'), sourceRows: [{ transtype: 'INVOICE' }], items: [{ sourceFields: {}, description: 'Saved item' }] } as Receipt;
    useAppStore.setState({ queue: [{ identity: 'file-2::INVOICE::002', status: 'PRINTED', receipt, queuedAt: 1 }] });
    let finishPrint!: (value: {success: boolean}) => void;
    const printMock = jest.fn(() => new Promise<{success: boolean}>(resolve => { finishPrint = resolve; }));
    const { PrinterService } = require('../services/printer/PrinterService');
    (PrinterService.getAdapter as jest.Mock).mockReturnValue({ print: printMock });

    const first = useAppStore.getState().reprintReceipt('file-2::INVOICE::002');
    const second = await useAppStore.getState().reprintReceipt('file-2::INVOICE::002');
    finishPrint({ success: true });
    await first;

    expect(second.success).toBe(false);
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it('processes a queued receipt through PRINTED and archives its source CSV', async () => {
    const printReceipt = jest.fn().mockResolvedValue({success: true});
    useAppStore.setState({printReceipt});
    useAppStore.getState().prepareCsvForQueue('file-queue', 'incoming-id', 1);
    useAppStore.getState().enqueueReceipt(mockReceipt('Q-1', 'file-queue'));

    await useAppStore.getState().processQueue();

    expect(printReceipt).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(useAppStore.getState().csvProgress['file-queue']).toMatchObject({printedCount: 1, archiveStatus: 'ARCHIVED'});
    expect(DriveService.moveFile).toHaveBeenCalledWith('file-queue', 'incoming-id', 'archive-id');
  });

  it('cancels only queued receipts and never prints or archives them', async () => {
    const receipt = mockReceipt('C-1', 'file-cancel');
    useAppStore.getState().prepareCsvForQueue('file-cancel', 'incoming-id', 1);
    useAppStore.getState().enqueueReceipt(receipt);
    const printReceipt = jest.fn().mockResolvedValue({success: true});
    useAppStore.setState({printReceipt});

    expect(useAppStore.getState().cancelQueueItem('file-cancel::INVOICE::C-1')).toBe(true);
    expect(useAppStore.getState().cancelQueueItem('file-cancel::INVOICE::C-1')).toBe(false);
    await useAppStore.getState().processQueue();

    expect(printReceipt).not.toHaveBeenCalled();
    expect(useAppStore.getState().queue[0].status).toBe('CANCELLED');
    expect(useAppStore.getState().csvProgress['file-cancel']).toMatchObject({printedCount: 0, archiveStatus: 'PENDING'});
    expect(DriveService.moveFile).not.toHaveBeenCalled();
  });

  it('does not cancel after the queue worker has claimed a receipt for printing', async () => {
    useAppStore.getState().prepareCsvForQueue('file-race', 'incoming-id', 1);
    useAppStore.getState().enqueueReceipt(mockReceipt('RACE-1', 'file-race'));
    let finishPrint!: (result: {success: boolean}) => void;
    const printReceipt = jest.fn(() => new Promise<{success: boolean}>(resolve => {finishPrint = resolve;}));
    useAppStore.setState({printReceipt});

    const processing = useAppStore.getState().processQueue();
    expect(useAppStore.getState().queue[0].status).toBe('PRINTING');
    expect(useAppStore.getState().cancelQueueItem('file-race::INVOICE::RACE-1')).toBe(false);
    expect(useAppStore.getState().csvProgress['file-race']).toMatchObject({printedCount: 0, archiveStatus: 'PENDING'});
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    await Promise.resolve();
    finishPrint({success: true});
    await processing;

    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(printReceipt).toHaveBeenCalledTimes(1);
  });
  it('caps history at 500', () => {
    const store = useAppStore.getState();
    for (let i = 0; i < 505; i++) {
      store.enqueueReceipt(mockReceipt(`T-${i}`, `file-${i}`));
    }
    expect(useAppStore.getState().queue).toHaveLength(500);
    // The first 5 should be removed. The latest should be T-504
    expect(useAppStore.getState().queue[0].identity).toBe('file-5::INVOICE::T-5');
    expect(useAppStore.getState().queue[499].identity).toBe('file-504::INVOICE::T-504');
  });

  // ── Regression: archive failures that caused the device bug ────────────────

  it('aborts archive and sets FAILED when sourceFolderId is empty string', async () => {
    // Empty string is invalid — retryArchive must NOT call moveFile.
    useAppStore.setState({
      csvProgress: {
        'file-nosrc': {
          driveFileId: 'file-nosrc',
          sourceFolderId: '',  // empty — bypasses the old null guard
          expectedCount: 1,
          printedCount: 1,
          archiveStatus: 'PENDING',
        },
      },
    });

    await useAppStore.getState().retryArchive('file-nosrc');

    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().csvProgress['file-nosrc'].archiveStatus).toBe('FAILED');
    expect(useAppStore.getState().csvProgress['file-nosrc'].archiveError).toMatch(/Incoming folder/i);
  });

  it('aborts archive and sets FAILED when sourceFolderId is "root"', async () => {
    // 'root' is a Drive API shorthand that cannot be used as a removeParents value.
    // The previous code used 'root' as a fallback, silently leaving the file un-moved.
    useAppStore.setState({
      csvProgress: {
        'file-root': {
          driveFileId: 'file-root',
          sourceFolderId: 'root',  // the dangerous bogus fallback
          expectedCount: 1,
          printedCount: 1,
          archiveStatus: 'PENDING',
        },
      },
    });

    await useAppStore.getState().retryArchive('file-root');

    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().csvProgress['file-root'].archiveStatus).toBe('FAILED');
    expect(useAppStore.getState().csvProgress['file-root'].archiveError).toMatch(/Incoming folder/i);
  });

  it('prepareCsvForQueue rejects "root" as sourceFolderId and never creates a csvProgress entry', () => {
    // If 'root' is passed as the folder (as was done by the old || 'root' fallback),
    // prepareCsvForQueue must silently skip — no csvProgress entry should be created.
    useAppStore.getState().prepareCsvForQueue('file-rootprep', 'root', 2);

    expect(useAppStore.getState().csvProgress['file-rootprep']).toBeUndefined();
    expect(DriveService.moveFile).not.toHaveBeenCalled();
  });

  it('prepareCsvForQueue accepts a real folder ID and creates a valid csvProgress entry', () => {
    const REAL_FOLDER = 'real-incoming-folder-xyz';
    useAppStore.getState().prepareCsvForQueue('file-real', REAL_FOLDER, 3);

    expect(useAppStore.getState().csvProgress['file-real']).toMatchObject({
      driveFileId: 'file-real',
      sourceFolderId: REAL_FOLDER,
      expectedCount: 3,
      printedCount: 0,
      archiveStatus: 'PENDING',
    });
  });


  it('aborts archive and sets FAILED when archiveFolderId is null', async () => {
    useAppStore.setState({
      archiveFolderId: null as any,
      csvProgress: {
        'file-noarch': {
          driveFileId: 'file-noarch',
          sourceFolderId: 'incoming-id',
          expectedCount: 1,
          printedCount: 1,
          archiveStatus: 'PENDING',
        },
      },
    });

    await useAppStore.getState().retryArchive('file-noarch');

    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().csvProgress['file-noarch'].archiveStatus).toBe('FAILED');
    expect(useAppStore.getState().csvProgress['file-noarch'].archiveError).toMatch(/Printed\/archive folder/i);
  });

  it('does not trigger archive when receipt has no driveFileId', async () => {
    // A receipt without sourceFile.driveFileId must never trigger an archive
    // move — there is no file to locate on Drive.
    const receiptWithoutFileId: Receipt = {
      sourceRows: [],
      transactionType: 'INVOICE',
      transactionNumber: 'NOID-1',
      date: '2023-10-01',
      customer: { name: 'Test' } as any,
      financials: { total: 0 } as any,
      additional: {} as any,
      items: [],
      sourceFile: undefined,  // no sourceFile at all
    };
    useAppStore.getState().enqueueReceipt(receiptWithoutFileId);
    const identity = 'local::INVOICE::NOID-1';

    await useAppStore.getState().updateQueueItemStatus(identity, 'PRINTING');
    await useAppStore.getState().updateQueueItemStatus(identity, 'PRINTED');

    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
  });

  it('printLoading resets even when printReceipt throws synchronously', async () => {
    // The finally block in printReceipt must always reset printLoading, even if
    // the adapter.print() call throws an uncaught exception.
    const { PrinterService } = require('../services/printer/PrinterService');
    (PrinterService.getAdapter as jest.Mock).mockReturnValue({
      print: jest.fn().mockRejectedValue(new Error('Unexpected crash')),
    });

    const store = useAppStore.getState();
    await store.printReceipt(mockReceipt('CRASH-1', 'file-crash'));

    expect(useAppStore.getState().printLoading).toBe(false);
  });

  it('processQueue is not re-entered while already running', async () => {
    // If processQueue is already in flight and called again, the second call
    // must return immediately without starting a second concurrent worker.
    const printReceipt = jest.fn().mockResolvedValue({ success: true });
    useAppStore.setState({ printReceipt });
    useAppStore.getState().prepareCsvForQueue('file-p1', 'incoming-id', 1);
    useAppStore.getState().enqueueReceipt(mockReceipt('P1', 'file-p1'));

    // Both calls issued concurrently; the second must be a no-op.
    const [r1, r2] = await Promise.all([
      useAppStore.getState().processQueue(),
      useAppStore.getState().processQueue(),
    ]);

    expect(printReceipt).toHaveBeenCalledTimes(1);
  });

  it('archive uses sourceFolderId from csvProgress, not a hardcoded root', async () => {
    // Verify the exact folder IDs passed to DriveService.moveFile.
    const INCOMING = 'real-incoming-folder-id';
    const ARCHIVE  = 'real-archive-folder-id';
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    useAppStore.setState({
      archiveFolderId: ARCHIVE,
      csvProgress: {
        'file-src': {
          driveFileId: 'file-src',
          sourceFolderId: INCOMING,
          expectedCount: 1,
          printedCount: 0,
          archiveStatus: 'PENDING',
        },
      },
    });

    const store = useAppStore.getState();
    store.enqueueReceipt(mockReceipt('S-1', 'file-src'));
    await store.updateQueueItemStatus('file-src::INVOICE::S-1', 'PRINTING');
    await store.updateQueueItemStatus('file-src::INVOICE::S-1', 'PRINTED');

    expect(DriveService.moveFile).toHaveBeenCalledWith('file-src', INCOMING, ARCHIVE);
    expect(useAppStore.getState().csvProgress['file-src'].archiveStatus).toBe('ARCHIVED');
  });

  it('notification path: prepareCsvForQueue + enqueue + processQueue archives with correct folder', async () => {
    // This test mirrors the handlePrintAction flow in MonitoringService:
    // prepareCsvForQueue is called with the FCM folderId, then receipts are
    // enqueued, then processQueue processes them and archives to the configured
    // archive folder.
    const FCM_FOLDER = 'fcm-incoming-folder';
    const ARCHIVE = 'configured-archive-folder';
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    useAppStore.setState({ archiveFolderId: ARCHIVE });

    const receipt = mockReceipt('FCM-1', 'file-fcm');
    useAppStore.getState().prepareCsvForQueue('file-fcm', FCM_FOLDER, 1);
    useAppStore.getState().enqueueReceipt(receipt);

    const printReceipt = jest.fn().mockResolvedValue({ success: true });
    useAppStore.setState({ printReceipt });

    await useAppStore.getState().processQueue();

    expect(DriveService.moveFile).toHaveBeenCalledWith('file-fcm', FCM_FOLDER, ARCHIVE);
    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(useAppStore.getState().csvProgress['file-fcm'].archiveStatus).toBe('ARCHIVED');
  });

  it('full processQueue end-to-end with real printReceipt and archive', async () => {
    // Full integration: processQueue drives the real printReceipt action which
    // calls PrinterService. After success the CSV must be archived.
    const { PrinterService } = require('../services/printer/PrinterService');
    (PrinterService.getAdapter as jest.Mock).mockReturnValue({
      print: jest.fn().mockResolvedValue({ success: true }),
    });
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);

    const INCOMING = 'incoming-folder';
    const ARCHIVE  = 'archive-folder';
    useAppStore.setState({ archiveFolderId: ARCHIVE });
    useAppStore.getState().prepareCsvForQueue('file-e2e', INCOMING, 1);
    useAppStore.getState().enqueueReceipt(mockReceipt('E2E-1', 'file-e2e'));

    // Use the real printReceipt from the store
    useAppStore.setState({ printReceipt: useAppStore.getState().printReceipt });

    await useAppStore.getState().processQueue();

    expect(useAppStore.getState().queue[0].status).toBe('PRINTED');
    expect(DriveService.moveFile).toHaveBeenCalledWith('file-e2e', INCOMING, ARCHIVE);
    expect(useAppStore.getState().csvProgress['file-e2e'].archiveStatus).toBe('ARCHIVED');
  });
});
