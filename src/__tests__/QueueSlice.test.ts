import { useAppStore } from '../store/useAppStore';
import * as DriveService from '../services/drive/DriveService';
import type { Receipt } from '../models/Receipt';

jest.mock('../services/drive/DriveService', () => ({
  moveFile: jest.fn(),
  listFolders: jest.fn(),
  listCsvFiles: jest.fn(),
  downloadAndParseCsv: jest.fn(),
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
      accessToken: 'dummy-token',
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
    expect(DriveService.moveFile).toHaveBeenCalledWith('dummy-token', 'file-1', 'root', 'archive-id');
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

    expect(DriveService.moveFile).toHaveBeenCalledWith('dummy-token', 'file-1', 'root', 'archive-id');
    expect(useAppStore.getState().csvProgress['file-1'].archiveStatus).toBe('ARCHIVED');
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
