import {useAppStore} from '../store/useAppStore';
import {buildReceiptGroups, csvDisplayStatus} from '../store/driveWorkflow';
import * as DriveService from '../services/drive/DriveService';
import type {Receipt} from '../models/Receipt';

jest.mock('../services/drive/DriveService', () => ({
  moveFile: jest.fn(),
  listFolders: jest.fn(),
  listCsvFiles: jest.fn(),
  downloadAndParseCsv: jest.fn(),
}));

const rcpt = (n: string, id = 'f1'): Receipt =>
  ({
    sourceRows: [], transactionType: 'INVOICE', transactionNumber: n, date: '2023-10-01',
    customer: {name: 'C'}, financials: {total: 1}, additional: {}, items: [],
    sourceFile: {driveFileId: id, driveFileName: 'a.csv'},
  }) as Receipt;

const file = {id: 'f1', name: 'a.csv', mimeType: 'text/csv'} as any;
const flush = () => new Promise(r => setImmediate(r));
const parsed = (receipts: Receipt[]) =>
  (DriveService.downloadAndParseCsv as jest.Mock).mockResolvedValue({file, receipts, malformedRows: []});
const st = () => useAppStore.getState();
const print = async (identity: string, ok = true, error?: string) => {
  await st().updateQueueItemStatus(identity, 'PRINTING');
  await st().updateQueueItemStatus(identity, ok ? 'PRINTED' : 'FAILED', error);
};
const status = () => csvDisplayStatus('f1', st().queue, st().csvProgress, st().lastParsedFileId);
const groups = () => buildReceiptGroups(st().queue, st().csvProgress, st().receipts, st().lastParsedFileId);

describe('Process CSV (one step) + Enqueue All', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      queue: [], csvProgress: {}, reprintHistory: [],
      user: {id: 'u', email: 'u@example.com', name: 'U', photo: null} as any,
      archiveFolderId: 'arch', sourceFolderId: 'src',
      csvFiles: [file], archiveFiles: [], receipts: [], lastParsedFileId: null,
      csvError: null, processingFileId: null, parseLoading: false,
    });
    (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([]);
  });

  it('parses and enqueues every receipt in one step with accurate counts', async () => {
    parsed([rcpt('1'), rcpt('2'), rcpt('3')]);
    expect(await st().processCsv(file)).toEqual({added: 3, skipped: 0, total: 3});
    expect(st().queue.map(q => q.status)).toEqual(['QUEUED', 'QUEUED', 'QUEUED']);
    expect(st().csvProgress.f1).toMatchObject({expectedCount: 3, printedCount: 0, archiveStatus: 'PENDING'});
    expect(st().processingFileId).toBeNull();
    expect(status()).toBe('QUEUED');
  });

  it('processing the same CSV twice never duplicates', async () => {
    parsed([rcpt('1'), rcpt('2')]);
    await st().processCsv(file);
    expect(await st().processCsv(file)).toEqual({added: 0, skipped: 2, total: 2});
    expect(st().queue).toHaveLength(2);
  });

  it('ignores repeated taps while processing', async () => {
    let release: (v: unknown) => void = () => {};
    (DriveService.downloadAndParseCsv as jest.Mock).mockReturnValue(new Promise(r => { release = r; }));
    const first = st().processCsv(file);
    expect(st().processingFileId).toBe('f1');
    expect(await st().processCsv(file)).toBeNull();
    release({file, receipts: [rcpt('1')], malformedRows: []});
    expect(await first).toEqual({added: 1, skipped: 0, total: 1});
    expect(DriveService.downloadAndParseCsv).toHaveBeenCalledTimes(1);
  });

  it('parse failure shows an error and enqueues nothing (even with older parsed receipts)', async () => {
    useAppStore.setState({receipts: [rcpt('9')], lastParsedFileId: 'f1'});
    (DriveService.downloadAndParseCsv as jest.Mock).mockRejectedValue(new Error('bad csv'));
    expect(await st().processCsv(file)).toBeNull();
    expect(st().csvError).toBe('bad csv');
    expect(st().queue).toHaveLength(0);
    expect(st().processingFileId).toBeNull();
  });

  it('empty CSV reports an error', async () => {
    parsed([]);
    expect(await st().processCsv(file)).toBeNull();
    expect(st().csvError).toContain('No receipts');
  });

  it('enqueueReceipts adds the remainder after one receipt was enqueued individually', () => {
    const all = [rcpt('1'), rcpt('2'), rcpt('3')];
    expect(st().enqueueReceipt(all[1])).toBe(true);
    expect(st().enqueueReceipts(all)).toEqual({added: 2, skipped: 1, total: 3});
    expect(st().queue).toHaveLength(3);
  });

  it('re-queues failed and cancelled receipts but never a printed one', async () => {
    parsed([rcpt('1'), rcpt('2'), rcpt('3')]);
    await st().processCsv(file);
    await print('f1::INVOICE::1');
    await print('f1::INVOICE::2', false, 'jam');
    expect(st().cancelQueueItem('f1::INVOICE::3')).toBe(true);
    expect(status()).toBe('PRINT_FAILED');
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(await st().processCsv(file)).toEqual({added: 2, skipped: 1, total: 3});
    const by = (n: string) => st().queue.find(q => q.identity === `f1::INVOICE::${n}`)!.status;
    expect([by('1'), by('2'), by('3')]).toEqual(['PRINTED', 'QUEUED', 'QUEUED']);
  });

  it('archive failure = Archive Pending; retry completes without reprinting and clears active sections', async () => {
    parsed([rcpt('1')]);
    await st().processCsv(file);
    (DriveService.moveFile as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await print('f1::INVOICE::1');
    expect(st().csvProgress.f1.archiveStatus).toBe('FAILED');
    expect(status()).toBe('ARCHIVE_PENDING');
    expect(groups()).toHaveLength(1);
    expect(groups()[0].archiveFailed).toBe(true);
    expect(st().csvFiles).toEqual([file]);
    expect(DriveService.listCsvFiles).not.toHaveBeenCalled();

    (DriveService.moveFile as jest.Mock).mockResolvedValueOnce(undefined);
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder => (folder === 'arch' ? [file] : []));
    await st().retryArchive('f1');
    await flush();
    expect(DriveService.moveFile).toHaveBeenCalledTimes(2);
    expect(status()).toBe('COMPLETED');
    expect(groups()).toHaveLength(0);
    expect(st().csvFiles).toEqual([]);
    expect(st().archiveFiles).toEqual([file]);
    expect(st().receipts).toEqual([]);
    expect(st().lastParsedFileId).toBeNull();
    expect(DriveService.listCsvFiles).toHaveBeenCalledTimes(2); // Incoming + Printed refreshed
    // History kept; completed CSV can never be enqueued or processed again
    expect(st().queue.filter(q => q.status === 'PRINTED')).toHaveLength(1);
    expect(st().enqueueReceipts([rcpt('1')])).toEqual({added: 0, skipped: 1, total: 1});
    expect(await st().processCsv(file)).toBeNull();
    expect(DriveService.downloadAndParseCsv).toHaveBeenCalledTimes(1);
  });

  it('a stale Incoming listing right after archiving does not show the completed CSV', async () => {
    useAppStore.setState({
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED', archivedAt: Date.now()}},
    });
    (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([file]);
    await st().loadCsvFiles();
    expect(st().csvFiles).toEqual([]);
  });

  it('500 cap drops finished history before waiting receipts', () => {
    useAppStore.setState({
      queue: [
        {identity: 'w', status: 'QUEUED', receipt: rcpt('w', 'fw'), queuedAt: 0},
        {identity: 'old', status: 'PRINTED', receipt: rcpt('old', 'f0'), queuedAt: 0},
        ...Array.from({length: 498}, (_, i) => ({
          identity: `x${i}`, status: 'QUEUED' as const, receipt: rcpt(`x${i}`, 'fx'), queuedAt: 0,
        })),
      ],
    });
    st().enqueueReceipt(rcpt('new', 'fn'));
    expect(st().queue).toHaveLength(500);
    expect(st().queue[0].identity).toBe('w');
    expect(st().queue.some(q => q.identity === 'old')).toBe(false);
  });

  it('groups: parsed-only receipts are Ready to Print; restart does not resurrect completed CSVs', () => {
    const g = buildReceiptGroups([], {}, [rcpt('1'), rcpt('2')], 'f1');
    expect(g).toHaveLength(1);
    expect(g[0].status).toBe('READY');
    expect(g[0].notQueued).toHaveLength(2);

    // After restart only persisted queue + csvProgress exist.
    const persistedQueue = [{identity: 'f1::INVOICE::1', status: 'PRINTED' as const, receipt: rcpt('1'), queuedAt: 0}];
    const archived = {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED' as const}};
    expect(buildReceiptGroups(persistedQueue, archived, [], null)).toEqual([]);
    expect(csvDisplayStatus('f1', persistedQueue, archived, null)).toBe('COMPLETED');
  });

  it('persists the full queue (receipt data), csvProgress and reprint history for restart', () => {
    st().enqueueReceipt({...rcpt('1'), items: [{sourceFields: {descript: 'Widget'}, description: 'Widget', quantity: 2, rate: 5, amount: 10}]});
    const saved = (useAppStore.persist.getOptions().partialize as any)(st());
    const roundTrip = JSON.parse(JSON.stringify(saved));
    expect(roundTrip.queue[0].receipt.items[0]).toMatchObject({description: 'Widget', quantity: 2, rate: 5, amount: 10});
    expect(roundTrip.csvProgress).toBeDefined();
    expect(roundTrip.reprintHistory).toBeDefined();
  });
});
