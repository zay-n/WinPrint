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

describe('Process CSV (one step) + Enqueue All', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      queue: [], csvProgress: {}, accessToken: 't', archiveFolderId: 'arch', sourceFolderId: 'src',
      csvFiles: [file], archiveFiles: [], receipts: [], lastParsedFileId: null,
      csvError: null, processingFileId: null, parseLoading: false,
    });
    (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([]);
  });

  it('parses and enqueues every receipt in one step with accurate counts', async () => {
    parsed([rcpt('1'), rcpt('2'), rcpt('3')]);
    const result = await st().processCsv(file);
    expect(result).toEqual({added: 3, skipped: 0, total: 3});
    expect(st().queue.map(q => q.status)).toEqual(['QUEUED', 'QUEUED', 'QUEUED']);
    expect(st().csvProgress.f1).toMatchObject({expectedCount: 3, printedCount: 0, archiveStatus: 'PENDING'});
    expect(st().processingFileId).toBeNull();
    expect(csvDisplayStatus('f1', st().queue, st().csvProgress, st().lastParsedFileId)).toBe('QUEUED');
  });

  it('processing the same CSV twice never duplicates', async () => {
    parsed([rcpt('1'), rcpt('2')]);
    await st().processCsv(file);
    const again = await st().processCsv(file);
    expect(again).toEqual({added: 0, skipped: 2, total: 2});
    expect(st().queue).toHaveLength(2);
  });

  it('ignores repeated taps while processing', async () => {
    let release: (v: unknown) => void = () => {};
    (DriveService.downloadAndParseCsv as jest.Mock).mockReturnValue(
      new Promise(r => { release = r; }),
    );
    const first = st().processCsv(file);
    expect(st().processingFileId).toBe('f1');
    expect(await st().processCsv(file)).toBeNull();
    release({file, receipts: [rcpt('1')], malformedRows: []});
    expect(await first).toEqual({added: 1, skipped: 0, total: 1});
    expect(DriveService.downloadAndParseCsv).toHaveBeenCalledTimes(1);
  });

  it('parse failure shows an error and enqueues nothing', async () => {
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

  it('re-queues a failed receipt but never a printed one', async () => {
    parsed([rcpt('1'), rcpt('2')]);
    await st().processCsv(file);
    await st().updateQueueItemStatus('f1::INVOICE::1', 'PRINTED');
    await st().updateQueueItemStatus('f1::INVOICE::2', 'FAILED', 'jam');
    expect(csvDisplayStatus('f1', st().queue, st().csvProgress, 'f1')).toBe('PRINT_FAILED');
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    expect(await st().processCsv(file)).toEqual({added: 1, skipped: 1, total: 2});
    expect(st().queue.find(q => q.identity === 'f1::INVOICE::1')!.status).toBe('PRINTED');
    expect(st().queue.find(q => q.identity === 'f1::INVOICE::2')!.status).toBe('QUEUED');
  });

  it('archive failure = Archive Pending; retry completes without reprinting and clears active sections', async () => {
    parsed([rcpt('1')]);
    await st().processCsv(file);
    (DriveService.moveFile as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await st().updateQueueItemStatus('f1::INVOICE::1', 'PRINTED');
    expect(csvDisplayStatus('f1', st().queue, st().csvProgress, st().lastParsedFileId)).toBe('ARCHIVE_PENDING');
    let groups = buildReceiptGroups(st().queue, st().csvProgress, st().receipts, st().lastParsedFileId);
    expect(groups).toHaveLength(1);
    expect(groups[0].archiveFailed).toBe(true);
    expect(st().csvFiles).toEqual([file]);

    (DriveService.moveFile as jest.Mock).mockResolvedValueOnce(undefined);
    await st().retryArchive('f1');
    await flush();
    expect(csvDisplayStatus('f1', st().queue, st().csvProgress, st().lastParsedFileId)).toBe('COMPLETED');
    groups = buildReceiptGroups(st().queue, st().csvProgress, st().receipts, st().lastParsedFileId);
    expect(groups).toHaveLength(0);
    expect(st().csvFiles).toEqual([]);
    expect(DriveService.listCsvFiles).toHaveBeenCalledTimes(2); // Incoming + Printed refreshed
    // History kept
    expect(st().queue.filter(q => q.status === 'PRINTED')).toHaveLength(1);
    // Completed CSV can never be enqueued again
    expect(st().enqueueReceipts([rcpt('1')])).toEqual({added: 0, skipped: 1, total: 1});
  });

  it('receipts printed before tracking began are archived, not reprinted', async () => {
    st().enqueueReceipt(rcpt('1')); // e.g. queued from a notification: no csvProgress yet
    await st().updateQueueItemStatus('f1::INVOICE::1', 'PRINTED');
    expect(DriveService.moveFile).not.toHaveBeenCalled();
    parsed([rcpt('1')]);
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    expect(await st().processCsv(file)).toEqual({added: 0, skipped: 1, total: 1});
    expect(DriveService.moveFile).toHaveBeenCalledTimes(1);
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    expect(st().queue).toHaveLength(1);
    expect(st().queue[0].status).toBe('PRINTED');
  });

  it('receipts enqueued while an archive move is in flight are not lost', async () => {
    parsed([rcpt('1')]);
    await st().processCsv(file);
    let release: (v?: unknown) => void = () => {};
    (DriveService.moveFile as jest.Mock).mockReturnValue(new Promise(r => { release = r; }));
    const printing = st().updateQueueItemStatus('f1::INVOICE::1', 'PRINTED');
    st().enqueueReceipt(rcpt('9', 'f2'));
    release();
    await printing;
    expect(st().queue.map(q => q.identity)).toEqual(['f1::INVOICE::1', 'f2::INVOICE::9']);
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
  });

  it('500 cap drops printed history before waiting receipts', () => {
    st().enqueueReceipt(rcpt('old', 'f0'));
    useAppStore.setState({queue: st().queue.map(q => ({...q, status: 'PRINTED' as const}))});
    useAppStore.setState({
      queue: [
        {identity: 'w', status: 'QUEUED', receipt: rcpt('w', 'fw'), queuedAt: 0},
        ...st().queue,
        ...Array.from({length: 498}, (_, i) => ({
          identity: `x${i}`, status: 'QUEUED' as const, receipt: rcpt(`x${i}`, 'fx'), queuedAt: 0,
        })),
      ],
    });
    st().enqueueReceipt(rcpt('new', 'fn'));
    expect(st().queue).toHaveLength(500);
    expect(st().queue[0].identity).toBe('w');
    expect(st().queue.some(q => q.identity === 'f0::INVOICE::old')).toBe(false);
  });

  it('groups: parsed-only receipts are Ready to Print; restart does not resurrect completed CSVs', () => {
    const groups = buildReceiptGroups([], {}, [rcpt('1'), rcpt('2')], 'f1');
    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe('READY');
    expect(groups[0].notQueued).toHaveLength(2);

    // After restart only persisted queue + csvProgress exist.
    const persistedQueue = [{identity: 'f1::INVOICE::1', status: 'PRINTED' as const, receipt: rcpt('1'), queuedAt: 0}];
    const archived = {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED' as const}};
    expect(buildReceiptGroups(persistedQueue, archived, [], null)).toEqual([]);
    expect(csvDisplayStatus('f1', persistedQueue, archived, null)).toBe('COMPLETED');
  });

  it('persists the full queue (receipt data) and csvProgress for restart', () => {
    st().enqueueReceipt({...rcpt('1'), items: [{sourceFields: {descript: 'Widget'}, description: 'Widget', quantity: 2, rate: 5, amount: 10}]});
    const saved = (useAppStore.persist.getOptions().partialize as any)(st());
    const roundTrip = JSON.parse(JSON.stringify(saved));
    expect(roundTrip.queue[0].receipt.items[0]).toMatchObject({description: 'Widget', quantity: 2, rate: 5, amount: 10});
    expect(roundTrip.csvProgress).toBeDefined();
  });
});
