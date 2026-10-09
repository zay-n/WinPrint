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
          sourceFolderId: 'root',
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

    await useAppStore.getState().updateQueueItemStatus(r1.sourceFile!.driveFileId + '::INVOICE::001', 'PRINTED');

    // One printed, should not archive yet
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().csvProgress['file-1'].printedCount).toBe(1);

    await useAppStore.getState().updateQueueItemStatus(r2.sourceFile!.driveFileId + '::INVOICE::002', 'PRINTED');

    // Both printed, should archive
    expect(DriveService.moveFile).toHaveBeenCalledWith('file-1', 'root', 'archive-id');
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('ARCHIVED');
    expect(useAppStore.getState().csvProgress['file-1'].printedCount).toBe(2);
  });

  it('handles print failure without archiving', async () => {
    useAppStore.setState({
      csvProgress: {
        'file-1': {
          driveFileId: 'file-1',
          sourceFolderId: 'root',
          expectedCount: 1,
          printedCount: 0,
          archiveStatus: 'PENDING',
        }
      }
    });

    const store = useAppStore.getState();
    const r1 = mockReceipt('001', 'file-1');
    store.enqueueReceipt(r1);

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
          sourceFolderId: 'root',
          expectedCount: 1,
          printedCount: 0,
          archiveStatus: 'PENDING',
        }
      }
    });

    const store = useAppStore.getState();
    const r1 = mockReceipt('001', 'file-1');
    store.enqueueReceipt(r1);

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
          sourceFolderId: 'root',
          expectedCount: 1,
          printedCount: 1,
          archiveStatus: 'FAILED',
          archiveError: 'Network error',
        }
      }
    });

    await useAppStore.getState().retryArchive('file-1');

    expect(DriveService.moveFile).toHaveBeenCalledWith('file-1', 'root', 'archive-id');
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
});
