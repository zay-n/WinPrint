/**
 * Regression tests:
 *  1. An archived CSV moved back to the Incoming folder (same Drive file ID)
 *     must be visible in Incoming, without resetting printed history.
 *  2. Enqueue -> explicit print action -> adapter -> final status, including
 *     recovery of a receipt left in PRINTING by an app restart.
 */
import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DriveScreen from '../screens/drive/DriveScreen';
import {useAppStore, INTERRUPTED_PRINT_ERROR} from '../store/useAppStore';
import {buildReceiptGroups} from '../store/driveWorkflow';
import * as DriveService from '../services/drive/DriveService';
import type {Receipt} from '../models/Receipt';

const mockPrint = jest.fn();
jest.mock('../services/printer/PrinterService', () => ({
  PrinterService: {getAdapter: jest.fn(() => ({print: (...a: unknown[]) => mockPrint(...a)}))},
}));
jest.mock('../services/drive/DriveService', () => ({
  moveFile: jest.fn(), listFolders: jest.fn(), listCsvFiles: jest.fn(),
  downloadAndParseCsv: jest.fn(), getFileMetadata: jest.fn(),
}));
jest.mock('../services/monitoring/MonitoringService', () => ({
  runReconciliation: jest.fn(async () => 0), disconnect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {SafeAreaView: View};
});
jest.mock('../components/DriveFolderPickerModal', () => () => null);

const rcpt = (n: string, id = 'f1'): Receipt =>
  ({
    sourceRows: [{transno: n}], transactionType: 'INVOICE', transactionNumber: n, date: '01/10/2023',
    customer: {name: 'Acme'}, financials: {total: 42}, additional: {},
    items: [{sourceFields: {}, description: 'Widget'}],
    sourceFile: {driveFileId: id, driveFileName: 'sales.csv'},
  }) as Receipt;
const file = {id: 'f1', name: 'sales.csv', mimeType: 'text/csv'} as any;
const st = () => useAppStore.getState();
const flush = () => new Promise(r => setImmediate(r));
const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat(Infinity).join(''));
const defaults = {
  printReceipt: st().printReceipt, processQueue: st().processQueue,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrint.mockResolvedValue({success: true});
  useAppStore.setState({
    ...defaults,
    user: {id: 'u', email: 'u@example.com', name: 'U', photo: null} as any,
    sourceFolderId: 'src', sourceFolderName: 'Pending', archiveFolderId: 'arch', archiveFolderName: 'Printed',
    queue: [], csvProgress: {}, reprintHistory: [], receipts: [], lastParsedFileId: null,
    csvFiles: [], archiveFiles: [], deferredFileIds: [], deferredError: null, deferredLoadingId: null,
    csvError: null, driveError: null, processingFileId: null, parseLoading: false, printLoading: false,
    selectedPrinterType: 'office',
  });
  (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([]);
});

describe('Issue 1 — archived CSV moved back to the Incoming folder', () => {
  const archivedLongAgo = () =>
    useAppStore.setState({
      queue: [{identity: 'f1::INVOICE::1', status: 'PRINTED', receipt: rcpt('1'), queuedAt: 1, completedAt: 2}],
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED', archivedAt: Date.now() - 10 * 60_000}},
    });

  it('refresh lists the file from its current Drive folder despite old archive state', async () => {
    archivedLongAgo();
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder => (folder === 'src' ? [file] : []));
    await st().refreshDriveListings();
    expect(st().csvFiles).toEqual([file]);
    expect(st().archiveFiles).toEqual([]);
  });

  it('legacy archive records without a timestamp do not hide the file either', async () => {
    useAppStore.setState({
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED'}},
    });
    (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([file]);
    await st().loadCsvFiles();
    expect(st().csvFiles).toEqual([file]);
  });

  it('keeps printed history and never re-queues or reprints automatically', async () => {
    archivedLongAgo();
    (DriveService.downloadAndParseCsv as jest.Mock).mockResolvedValue({file, receipts: [rcpt('1')], malformedRows: []});
    expect(st().enqueueReceipts([rcpt('1')])).toEqual({added: 0, skipped: 1, total: 1});
    expect(await st().processCsv(file)).toBeNull();
    await st().processQueue();
    expect(mockPrint).not.toHaveBeenCalled();
    expect(st().queue).toHaveLength(1);
    expect(st().queue[0].status).toBe('PRINTED');
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    expect(buildReceiptGroups(st().queue, st().csvProgress, [], null)).toEqual([]);
  });

  it('deferred (notification) enqueue of the returned file adds nothing and says why', async () => {
    archivedLongAgo();
    useAppStore.setState({deferredFileIds: ['f1::src::sales.csv']});
    (DriveService.getFileMetadata as jest.Mock).mockResolvedValue(file);
    (DriveService.downloadAndParseCsv as jest.Mock).mockResolvedValue({file, receipts: [rcpt('1')], malformedRows: []});
    expect(await st().enqueueDeferredFile('f1::src::sales.csv')).toBe(true);
    expect(st().queue.filter(q => q.status === 'QUEUED')).toHaveLength(0);
    expect(st().deferredFileIds).toEqual([]);
    expect(st().deferredError).toContain('already printed');
  });

  it('deferred enqueue of a new file still queues it with no error', async () => {
    const f2 = {id: 'f2', name: 'new.csv', mimeType: 'text/csv'} as any;
    useAppStore.setState({deferredFileIds: ['f2::src::new.csv']});
    (DriveService.getFileMetadata as jest.Mock).mockResolvedValue(f2);
    (DriveService.downloadAndParseCsv as jest.Mock).mockResolvedValue({file: f2, receipts: [rcpt('5', 'f2'), rcpt('6', 'f2')], malformedRows: []});
    expect(await st().enqueueDeferredFile('f2::src::new.csv')).toBe(true);
    expect(st().queue.map(q => q.status)).toEqual(['QUEUED', 'QUEUED']);
    expect(st().deferredError).toBeNull();
    expect(st().csvProgress.f2).toMatchObject({expectedCount: 2, printedCount: 0});
  });

  it('Drive tab shows it in Incoming as Already Printed, once, with no Process action', async () => {
    archivedLongAgo();
    // Printed listing is stale and still returns the file too.
    (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([file]);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DriveScreen navigation={{navigate: jest.fn()} as any} route={{} as any} />);
      await flush();
    });
    const t = texts(tree);
    expect(t.filter(x => x === 'sales.csv')).toHaveLength(1);
    expect(t).toContain('Already Printed');
    expect(t).toContain('No files waiting');
    expect(t.filter(x => x === 'Completed')).toHaveLength(1);
    // no checkbox: a returned file cannot be added to the print queue again
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Select sales.csv')).toHaveLength(0);
    expect(t).not.toContain('Add to Print Queue (0)');
    act(() => tree.unmount());
  });
});

describe('Issue 2 — queued receipts print only through the explicit print action', () => {
  const prime = (n: number) => {
    st().prepareCsvForQueue('f1', 'src', n);
    return st().enqueueReceipts(Array.from({length: n}, (_, i) => rcpt(String(i + 1))));
  };

  it('enqueue does not print; processQueue prints each receipt once, in order, then archives', async () => {
    expect(prime(2)).toEqual({added: 2, skipped: 0, total: 2});
    expect(mockPrint).not.toHaveBeenCalled();
    expect(st().queue.map(q => q.status)).toEqual(['QUEUED', 'QUEUED']);

    const seen: string[] = [];
    mockPrint.mockImplementation(async (r: Receipt) => {
      seen.push(`${r.transactionNumber}:${st().queue.find(q => q.receipt === r)?.status}`);
      return {success: true};
    });
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    await st().processQueue();
    expect(seen).toEqual(['1:PRINTING', '2:PRINTING']);
    expect(st().queue.map(q => q.status)).toEqual(['PRINTED', 'PRINTED']);
    expect(DriveService.moveFile).toHaveBeenCalledTimes(1);
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    expect(st().printLoading).toBe(false);

    await st().processQueue();
    expect(mockPrint).toHaveBeenCalledTimes(2); // no duplicate jobs
  });

  it('a failed print stays retryable, the CSV is not archived until every receipt prints', async () => {
    prime(2);
    mockPrint.mockResolvedValueOnce({success: true}).mockResolvedValueOnce({success: false, error: 'Office print failed: canceled'});
    await st().processQueue();
    expect(st().queue.map(q => q.status)).toEqual(['PRINTED', 'FAILED']);
    expect(st().queue[1].error).toContain('canceled');
    expect(DriveService.moveFile).not.toHaveBeenCalled();

    (DriveService.moveFile as jest.Mock).mockRejectedValueOnce(new Error('drive down'));
    st().retryFailedPrints();
    await st().processQueue();
    expect(mockPrint).toHaveBeenCalledTimes(3); // receipt 1 was not printed again
    expect(st().queue.map(q => q.status)).toEqual(['PRINTED', 'PRINTED']);
    expect(st().csvProgress.f1.archiveStatus).toBe('FAILED');

    (DriveService.moveFile as jest.Mock).mockResolvedValueOnce(undefined);
    await st().retryArchive('f1');
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    expect(mockPrint).toHaveBeenCalledTimes(3); // archive retry never reprints
  });

  it('a receipt left in PRINTING by a restart was a dead end; it is now recovered as retryable', async () => {
    prime(1);
    await st().updateQueueItemStatus('f1::INVOICE::1', 'PRINTING');
    // Without recovery nothing can move it: the processor only takes QUEUED,
    // retry only takes FAILED, cancel only takes QUEUED.
    await st().processQueue();
    st().retryFailedPrints();
    expect(st().cancelQueueItem('f1::INVOICE::1')).toBe(false);
    expect(mockPrint).not.toHaveBeenCalled();
    expect(st().queue[0].status).toBe('PRINTING');

    expect(st().recoverInterruptedPrints()).toBe(1);
    expect(st().queue[0]).toMatchObject({status: 'FAILED', error: INTERRUPTED_PRINT_ERROR});
    expect(mockPrint).not.toHaveBeenCalled(); // never reprinted automatically
    expect(st().csvProgress.f1.printedCount).toBe(0);

    st().retryFailedPrints();
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    await st().processQueue();
    expect(mockPrint).toHaveBeenCalledTimes(1);
    expect(st().queue[0].status).toBe('PRINTED');
  });

  it('recovery runs when persisted state is loaded at app start, and not during a live print', async () => {
    const stored = {state: {queue: [{identity: 'f1::INVOICE::1', status: 'PRINTING', receipt: rcpt('1'), queuedAt: 1}]}, version: 0};
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));
    await useAppStore.persist.rehydrate();
    expect(st().queue[0].status).toBe('FAILED');

    // Live print in progress: recovery must not touch it.
    useAppStore.setState({queue: []});
    prime(1);
    let finish: (v: unknown) => void = () => {};
    mockPrint.mockReturnValue(new Promise(r => { finish = r; }));
    const running = st().processQueue();
    await flush();
    expect(st().queue[0].status).toBe('PRINTING');
    expect(st().recoverInterruptedPrints()).toBe(0);
    expect(st().queue[0].status).toBe('PRINTING');
    finish({success: true});
    await running;
    expect(st().queue[0].status).toBe('PRINTED');
  });

  it('Drive tab has no print actions or receipt cards: printing happens only in the Print Queue', async () => {
    const processQueue = jest.fn(async (_ids?: string[]) => {});
    useAppStore.setState({processQueue, csvFiles: [file]});
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder => (folder === 'src' ? [file] : []));
    prime(2);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DriveScreen navigation={{navigate: jest.fn()} as any} route={{} as any} />);
      await flush();
    });
    const t = texts(tree);
    expect(t).toContain('In Print Queue');
    expect(t).toContain('0 of 2 printed. Its receipts are waiting in the Print Queue.');
    expect(t.some(x => /Print (These|Now|All|Selected)/.test(x))).toBe(false);
    expect(t).not.toContain('INVOICE 1');
    const labels = tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel as string);
    expect(labels.some(l => /^Print /.test(l))).toBe(false);
    expect(processQueue).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
