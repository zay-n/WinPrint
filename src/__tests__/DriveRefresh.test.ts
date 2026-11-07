import {useAppStore, csvWorkflowState} from '../store/useAppStore';
import * as DriveService from '../services/drive/DriveService';
import type {Receipt} from '../models/Receipt';

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

const rcpt = (n: string, id = 'f1'): Receipt =>
  ({
    sourceRows: [], transactionType: 'INVOICE', transactionNumber: n, date: '2023-10-01',
    customer: {name: 'C'} as any, financials: {total: 1} as any, additional: {} as any, items: [],
    sourceFile: {driveFileId: id, driveFileName: 'a.csv'},
  }) as Receipt;

const file = {id: 'f1', name: 'a.csv', mimeType: 'text/csv'} as any;
const flush = () => new Promise(r => setImmediate(r));

describe('Drive refresh + stale parse cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      queue: [], csvProgress: {}, accessToken: 't', archiveFolderId: 'arch', sourceFolderId: 'src',
      csvFiles: [file], archiveFiles: [], receipts: [rcpt('1')], lastParsedFileId: 'f1',
    });
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async (_t, folder) =>
      folder === 'arch' ? [file] : [],
    );
  });

  const prime = () => {
    useAppStore.setState({
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 0, archiveStatus: 'PENDING'}},
    });
    useAppStore.getState().enqueueReceipt(rcpt('1'));
  };

  it('print + archive success clears parsed state and refreshes both folders', async () => {
    prime();
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    await useAppStore.getState().updateQueueItemStatus('f1::INVOICE::1', 'PRINTED');
    await flush();
    const s = useAppStore.getState();
    expect(s.csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    expect(s.receipts).toEqual([]);
    expect(s.lastParsedFileId).toBeNull();
    expect(s.csvFiles).toEqual([]);
    expect(s.archiveFiles).toEqual([file]);
    expect(DriveService.listCsvFiles).toHaveBeenCalledTimes(2);
  });

  it('print failure keeps CSV in Incoming, no refresh', async () => {
    prime();
    await useAppStore.getState().updateQueueItemStatus('f1::INVOICE::1', 'FAILED', 'x');
    await flush();
    const s = useAppStore.getState();
    expect(s.csvFiles).toEqual([file]);
    expect(s.receipts).toHaveLength(1);
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(DriveService.listCsvFiles).not.toHaveBeenCalled();
  });

  it('archive failure keeps retry state, no refresh; retry success refreshes', async () => {
    prime();
    (DriveService.moveFile as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await useAppStore.getState().updateQueueItemStatus('f1::INVOICE::1', 'PRINTED');
    await flush();
    expect(useAppStore.getState().csvProgress.f1.archiveStatus).toBe('FAILED');
    expect(DriveService.listCsvFiles).not.toHaveBeenCalled();

    (DriveService.moveFile as jest.Mock).mockResolvedValueOnce(undefined);
    await useAppStore.getState().retryArchive('f1');
    await flush();
    expect(DriveService.moveFile).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    expect(DriveService.listCsvFiles).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().receipts).toEqual([]);
  });

  it('archived CSV cannot be enqueued, parsed, or listed as incoming', async () => {
    useAppStore.setState({
      queue: [],
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED'}},
    });
    useAppStore.getState().enqueueReceipt(rcpt('1'));
    expect(useAppStore.getState().queue).toHaveLength(0);

    await useAppStore.getState().downloadAndParse(file);
    expect(DriveService.downloadAndParseCsv).not.toHaveBeenCalled();

    (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([file]);
    await useAppStore.getState().loadCsvFiles();
    expect(useAppStore.getState().csvFiles).toEqual([]);
  });

  it('workflow states are distinct', () => {
    const q = (status: any) => [{identity: 'x', status, receipt: rcpt('1'), queuedAt: 0}];
    const none = {};
    expect(csvWorkflowState('f1', [], none, 'f1')).toBe('PARSED');
    expect(csvWorkflowState('f1', q('QUEUED'), none, 'f1')).toBe('QUEUED');
    expect(csvWorkflowState('f1', q('PRINTING'), none, 'f1')).toBe('PRINTING');
    expect(csvWorkflowState('f1', q('PRINTED'), none, 'f1')).toBe('PRINTED');
    expect(csvWorkflowState('f1', q('PRINTED'), {f1: {archiveStatus: 'ARCHIVED'} as any}, 'f1')).toBe('ARCHIVED');
  });
});
