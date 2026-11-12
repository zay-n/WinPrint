/**
 * User-controlled workflow: the user picks which CSVs to process and which
 * receipts to print. Nothing is enqueued or printed just because it was detected.
 */
import React from 'react';
import {Alert, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import DriveScreen from '../screens/drive/DriveScreen';
import QueueScreen from '../screens/queue/QueueScreen';
import {useAppStore} from '../store/useAppStore';
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

const rcpt = (n: string, id: string): Receipt =>
  ({
    sourceRows: [{transno: n}], transactionType: 'INV', transactionNumber: n, date: '01/10/2023',
    customer: {name: 'Acme'}, financials: {total: 42}, additional: {},
    items: [{sourceFields: {}, description: 'Widget'}],
    sourceFile: {driveFileId: id, driveFileName: `${id}.csv`},
  }) as Receipt;
const f = (id: string) => ({id, name: `${id}.csv`, mimeType: 'text/csv'}) as any;
const st = () => useAppStore.getState();
const flush = () => new Promise(r => setImmediate(r));
const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat(Infinity).join(''));
const printed = () => mockPrint.mock.calls.map(c => (c[0] as Receipt).transactionNumber);
const statusOf = (id: string) => st().queue.find(q => q.identity === id)?.status;
const defaults = {
  processQueue: st().processQueue, retryFailedPrints: st().retryFailedPrints,
  processCsvFiles: st().processCsvFiles,
};
/** Each CSV "fN" contains receipts per `contents`. */
const serve = (contents: Record<string, string[]>) =>
  (DriveService.downloadAndParseCsv as jest.Mock).mockImplementation(async (file: any) => {
    if (!contents[file.id]) throw new Error('The CSV is missing required Winsoft columns: transtype and transno.');
    return {file, receipts: contents[file.id].map(n => rcpt(n, file.id)), malformedRows: []};
  });
const queueUp = (id: string, numbers: string[]) => {
  st().prepareCsvForQueue(id, 'src', numbers.length);
  st().enqueueReceipts(numbers.map(n => rcpt(n, id)));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrint.mockResolvedValue({success: true});
  (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
  (DriveService.listCsvFiles as jest.Mock).mockResolvedValue([]);
  useAppStore.setState({
    ...defaults,
    user: {id: 'u', email: 'u@example.com', name: 'U', photo: null} as any,
    sourceFolderId: 'src', sourceFolderName: 'Pending', archiveFolderId: 'arch', archiveFolderName: 'Printed',
    queue: [], csvProgress: {}, reprintHistory: [], receipts: [], lastParsedFileId: null,
    csvFiles: [], archiveFiles: [], deferredFileIds: [],
    csvError: null, driveError: null, processingFileId: null, batchProgress: null,
    parseLoading: false, printLoading: false, selectedPrinterType: 'office',
  });
});

describe('Incoming CSVs: detect, select, process', () => {
  it('multiple CSVs are detected and listed but none is parsed or enqueued', async () => {
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder => (folder === 'src' ? [f('f1'), f('f2'), f('f3')] : []));
    await st().refreshDriveListings();
    st().setCsvFiles([f('f1'), f('f2'), f('f3')]); // background detection path
    expect(st().csvFiles.map(x => x.id)).toEqual(['f1', 'f2', 'f3']);
    expect(DriveService.downloadAndParseCsv).not.toHaveBeenCalled();
    expect(st().queue).toEqual([]);
    expect(st().csvProgress).toEqual({});
    expect(mockPrint).not.toHaveBeenCalled();
  });

  it('processing one selected CSV leaves the other CSVs untouched', async () => {
    useAppStore.setState({csvFiles: [f('f1'), f('f2')]});
    serve({f1: ['1', '2'], f2: ['7']});
    const result = await st().processCsvFiles([f('f1')]);
    expect(result).toEqual({processed: 1, added: 2, skipped: 0, failed: []});
    expect(DriveService.downloadAndParseCsv).toHaveBeenCalledTimes(1);
    expect(st().queue.map(q => q.identity)).toEqual(['f1::INV::1', 'f1::INV::2']);
    expect(st().csvProgress.f2).toBeUndefined();
    expect(st().csvFiles.map(x => x.id)).toEqual(['f1', 'f2']);
    expect(mockPrint).not.toHaveBeenCalled(); // processing never prints
    expect(st().batchProgress).toBeNull();
  });

  it('processes multiple selected CSVs, continuing past a file that fails', async () => {
    serve({f1: ['1', '2'], f3: ['9']}); // f2 is unreadable
    const result = await st().processCsvFiles([f('f1'), f('f2'), f('f3')]);
    expect(result).toMatchObject({processed: 2, added: 3, skipped: 0});
    expect(result!.failed).toEqual([{name: 'f2.csv', error: expect.stringContaining('missing required')}]);
    expect(st().queue.map(q => q.identity)).toEqual(['f1::INV::1', 'f1::INV::2', 'f3::INV::9']);
    expect(st().csvProgress.f2).toBeUndefined();
    // processing the same selection again adds no duplicates
    expect(await st().processCsvFiles([f('f1'), f('f3')])).toMatchObject({added: 0, skipped: 3});
    expect(st().queue).toHaveLength(3);
  });

  it('Drive tab: checkboxes, Select All / Deselect All and Process Selected (N)', async () => {
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder => (folder === 'src' ? [f('f1'), f('f2'), f('f3')] : []));
    serve({f1: ['1'], f2: ['2'], f3: ['3']});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DriveScreen navigation={{navigate: jest.fn()} as any} route={{} as any} />);
      await flush();
    });
    const press = async (label: string) => {
      await act(async () => {
        tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress();
        await flush();
      });
    };
    const byText = (text: string) =>
      tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === text))
        .slice(-1)[0];

    expect(texts(tree)).toContain('Process Selected (0)');
    await press('Process Selected (0)');
    expect(alert).toHaveBeenCalledWith('No files selected', expect.any(String));
    expect(DriveService.downloadAndParseCsv).not.toHaveBeenCalled();

    await act(async () => { byText('Select All').props.onPress(); });
    expect(texts(tree)).toContain('Process Selected (3)');
    await act(async () => { byText('Deselect All').props.onPress(); });
    expect(texts(tree)).toContain('Process Selected (0)');

    await press('Select f2.csv');
    expect(texts(tree)).toContain('Process Selected (1)');
    await press('Process Selected (1)');
    expect((DriveService.downloadAndParseCsv as jest.Mock).mock.calls.map(c => c[0].id)).toEqual(['f2']);
    expect(st().queue.map(q => q.identity)).toEqual(['f2::INV::2']);
    const t = texts(tree);
    expect(t).toContain('1 file processed: 1 receipt added to the print queue. Not printed yet — choose what to print.');
    expect(t).toContain('2 files waiting to be processed');
    expect(t).toContain('Process Selected (0)');
    // the processed file is no longer selectable; the other two still are
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Select f2.csv')).toHaveLength(0);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Select f1.csv').length).toBeGreaterThan(0);
    expect(mockPrint).not.toHaveBeenCalled();
    alert.mockRestore();
    act(() => tree.unmount());
  });
});

describe('Print queue: print only what the user selects', () => {
  it('printing one receipt prints only that receipt', async () => {
    queueUp('f1', ['1', '2', '3']);
    await st().processQueue(['f1::INV::2']);
    expect(printed()).toEqual(['2']);
    expect(st().queue.map(q => q.status)).toEqual(['QUEUED', 'PRINTED', 'QUEUED']);
    expect(DriveService.moveFile).not.toHaveBeenCalled();
  });

  it('printing several selected receipts prints only those, in order, once each', async () => {
    queueUp('f1', ['1', '2', '3']);
    queueUp('f2', ['8']);
    await st().processQueue(['f1::INV::3', 'f1::INV::1']);
    expect(printed()).toEqual(['1', '3']);
    expect(statusOf('f1::INV::2')).toBe('QUEUED');
    expect(statusOf('f2::INV::8')).toBe('QUEUED');
    await st().processQueue(['f1::INV::3', 'f1::INV::1']);
    expect(mockPrint).toHaveBeenCalledTimes(2);
  });

  it('bulk printing skips receipts that are already printed or currently printing', async () => {
    queueUp('f1', ['1', '2', '3']);
    await st().processQueue(['f1::INV::1']);
    await st().updateQueueItemStatus('f1::INV::2', 'PRINTING'); // e.g. another job owns it
    mockPrint.mockClear();
    await st().processQueue(['f1::INV::1', 'f1::INV::2', 'f1::INV::3']);
    expect(printed()).toEqual(['3']);
    expect(st().queue.map(q => q.status)).toEqual(['PRINTED', 'PRINTING', 'PRINTED']);
  });

  it('a second print request while one is running starts no second job', async () => {
    queueUp('f1', ['1', '2']);
    let finish: (v: unknown) => void = () => {};
    mockPrint.mockReturnValueOnce(new Promise(r => { finish = r; }));
    const first = st().processQueue(['f1::INV::1']);
    await flush();
    await st().processQueue(['f1::INV::2']); // ignored: printer busy
    await st().processQueue(['f1::INV::1']);
    expect(mockPrint).toHaveBeenCalledTimes(1);
    finish({success: true});
    await first;
    expect(st().queue.map(q => q.status)).toEqual(['PRINTED', 'QUEUED']);
  });

  it('an individual print failure is not marked Printed and can be retried on its own', async () => {
    queueUp('f1', ['1', '2']);
    mockPrint.mockResolvedValueOnce({success: false, error: 'Office print failed: canceled'});
    await st().processQueue(['f1::INV::1']);
    expect(st().queue[0]).toMatchObject({status: 'FAILED', error: expect.stringContaining('canceled')});
    expect(st().csvProgress.f1.printedCount).toBe(0);

    st().retryFailedPrints(['f1::INV::1']);
    await st().processQueue(['f1::INV::1']);
    expect(st().queue.map(q => q.status)).toEqual(['PRINTED', 'QUEUED']);
    expect(printed()).toEqual(['1', '1']);
  });

  it('retrying one failed receipt leaves other failed receipts alone', async () => {
    queueUp('f1', ['1', '2']);
    mockPrint.mockResolvedValue({success: false, error: 'x'});
    await st().processQueue();
    st().retryFailedPrints(['f1::INV::2']);
    expect(st().queue.map(q => q.status)).toEqual(['FAILED', 'QUEUED']);
  });

  it('the CSV is archived only after every one of its receipts has printed', async () => {
    queueUp('f1', ['1', '2', '3']);
    await st().processQueue(['f1::INV::1', 'f1::INV::3']);
    expect(st().csvProgress.f1).toMatchObject({printedCount: 2, expectedCount: 3, archiveStatus: 'PENDING'});
    expect(DriveService.moveFile).not.toHaveBeenCalled();

    mockPrint.mockResolvedValueOnce({success: false, error: 'jam'});
    await st().processQueue(['f1::INV::2']);
    expect(DriveService.moveFile).not.toHaveBeenCalled(); // a failed receipt blocks archiving

    st().retryFailedPrints(['f1::INV::2']);
    await st().processQueue(['f1::INV::2']);
    expect(DriveService.moveFile).toHaveBeenCalledTimes(1);
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
  });

  it('a returned archived CSV cannot be selected into new print jobs', async () => {
    queueUp('f1', ['1']);
    await st().processQueue();
    expect(st().csvProgress.f1.archiveStatus).toBe('ARCHIVED');
    mockPrint.mockClear();
    serve({f1: ['1']});

    const result = await st().processCsvFiles([f('f1')]); // file was moved back to Incoming
    expect(result).toMatchObject({processed: 0, added: 0});
    expect(result!.failed[0].error).toContain('already printed');
    expect(DriveService.downloadAndParseCsv).not.toHaveBeenCalled();
    await st().processQueue();
    await st().processQueue(['f1::INV::1']);
    expect(mockPrint).not.toHaveBeenCalled();
    expect(st().queue).toHaveLength(1);
    expect(st().queue[0].status).toBe('PRINTED');
  });
});

describe('Queue screen selection and actions', () => {
  const processQueue = jest.fn(async (_ids?: string[]) => {});
  const retryFailedPrints = jest.fn();
  let tree: renderer.ReactTestRenderer;
  let alert: jest.SpyInstance;
  const render = async () => {
    useAppStore.setState({processQueue, retryFailedPrints});
    await act(async () => { tree = renderer.create(<QueueScreen />); });
  };
  const press = (label: string) =>
    act(() => {
      tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress();
    });
  const pressText = (text: string) =>
    act(() => {
      tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === text))
        .slice(-1)[0].props.onPress();
    });
  const has = (label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label).length > 0;
  const confirm = () => act(() => alert.mock.calls[alert.mock.calls.length - 1][2][1].onPress());

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    processQueue.mockClear();
    retryFailedPrints.mockClear();
  });
  afterEach(() => { alert.mockRestore(); act(() => tree?.unmount()); });

  it('each waiting receipt has its own Print action that prints just that receipt', async () => {
    queueUp('f1', ['1', '2', '3']);
    await render();
    press('Print receipt 2');
    expect(processQueue).toHaveBeenCalledTimes(1);
    expect(processQueue).toHaveBeenCalledWith(['f1::INV::2']);
  });

  it('Print Selected (N) prints only ticked receipts after confirmation', async () => {
    queueUp('f1', ['1', '2', '3']);
    await render();
    expect(has('Print Selected (0)')).toBe(true);
    press('Print Selected (0)');
    expect(alert).toHaveBeenLastCalledWith('No receipts selected', expect.any(String));
    expect(processQueue).not.toHaveBeenCalled();

    press('Select receipt INV 1');
    press('Select receipt INV 3');
    expect(has('Print Selected (2)')).toBe(true);
    press('Print Selected (2)');
    expect(processQueue).not.toHaveBeenCalled(); // waits for confirmation
    expect(alert).toHaveBeenLastCalledWith('Print selected receipts?', expect.stringContaining('2 receipts'), expect.any(Array));
    confirm();
    expect(processQueue).toHaveBeenCalledWith(['f1::INV::1', 'f1::INV::3']);
    expect(has('Print Selected (0)')).toBe(true); // selection cleared
  });

  it('Select All / Deselect All, and Print All asks first', async () => {
    queueUp('f1', ['1', '2', '3']);
    await render();
    pressText('Select All');
    expect(has('Print Selected (3)')).toBe(true);
    pressText('Deselect All');
    expect(has('Print Selected (0)')).toBe(true);

    press('Print All (3)');
    expect(processQueue).not.toHaveBeenCalled();
    confirm();
    expect(processQueue).toHaveBeenCalledWith(['f1::INV::1', 'f1::INV::2', 'f1::INV::3']);
  });

  it('printing and failed receipts cannot be selected or printed; failed ones offer Retry', async () => {
    queueUp('f1', ['1', '2', '3']);
    useAppStore.setState({
      queue: st().queue.map((q, i) =>
        i === 0 ? {...q, status: 'FAILED' as const, error: 'jam'} : q),
    });
    await render();
    expect(has('Select receipt INV 1')).toBe(false);
    expect(has('Print receipt 1')).toBe(false);
    press('Retry receipt 1');
    expect(retryFailedPrints).toHaveBeenCalledWith(['f1::INV::1']);
    expect(processQueue).toHaveBeenCalledWith(['f1::INV::1']);
    act(() => tree.unmount());

    processQueue.mockClear();
    useAppStore.setState({
      queue: st().queue.map((q, i) => (i === 1 ? {...q, status: 'PRINTING' as const} : q)),
    });
    await render();
    expect(has('Select receipt INV 2')).toBe(false);
    expect(has('Print receipt 2')).toBe(false);
    // while something is printing, no other print can be started
    press('Print receipt 3');
    press('Print All (1)');
    expect(processQueue).not.toHaveBeenCalled();
  });
});
