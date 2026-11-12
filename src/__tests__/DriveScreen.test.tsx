import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import DriveScreen from '../screens/drive/DriveScreen';
import {useAppStore} from '../store/useAppStore';
import * as DriveService from '../services/drive/DriveService';
import type {Receipt} from '../models/Receipt';

jest.mock('../services/drive/DriveService', () => ({
  moveFile: jest.fn(), listFolders: jest.fn(), listCsvFiles: jest.fn(), downloadAndParseCsv: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {SafeAreaView: View};
});
jest.mock('../components/DriveFolderPickerModal', () => () => null);
jest.mock('../services/monitoring/MonitoringService', () => ({runReconciliation: jest.fn(async () => 0), disconnect: jest.fn()}));

const rcpt = (n: string): Receipt =>
  ({
    sourceRows: [], transactionType: 'INVOICE', transactionNumber: n, date: '01/10/2023',
    customer: {name: 'Acme'}, financials: {total: 42}, additional: {}, items: [],
    sourceFile: {driveFileId: 'f1', driveFileName: 'sales.csv'},
  }) as Receipt;
const file = {id: 'f1', name: 'sales.csv', mimeType: 'text/csv'} as any;
const done = {id: 'f0', name: 'old.csv', mimeType: 'text/csv'} as any;

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat(Infinity).join(''));
const flush = () => new Promise(r => setImmediate(r));

describe('DriveScreen workflow', () => {
  let tree: renderer.ReactTestRenderer;
  const navigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      user: {id: 'u', email: 'u@example.com', name: 'U', photo: null} as any,
      sourceFolderId: 'src', sourceFolderName: 'Incoming', archiveFolderId: 'arch', archiveFolderName: 'Printed',
      queue: [], csvProgress: {}, reprintHistory: [], receipts: [], lastParsedFileId: null, csvFiles: [], archiveFiles: [],
      csvError: null, driveError: null, processingFileId: null, parseLoading: false,
    });
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder =>
      folder === 'arch' ? [done] : [file],
    );
    (DriveService.downloadAndParseCsv as jest.Mock).mockResolvedValue({
      file, receipts: [rcpt('1'), rcpt('2')], malformedRows: [],
    });
  });
  afterEach(() => act(() => tree?.unmount()));

  it('select a CSV, Add to Print Queue, then it completes after printing and archiving', async () => {
    await act(async () => {
      tree = renderer.create(<DriveScreen navigation={{navigate} as any} route={{} as any} />);
      await flush();
    });
    const press = async (label: string) => {
      await act(async () => {
        tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress();
        await flush();
      });
    };
    let t = texts(tree);
    expect(t).toContain('Incoming CSV Files');
    expect(t).toContain('1 file not added to the print queue yet');
    expect(t).toContain('Completed');
    // Drive only handles files: no receipt cards and no print actions.
    for (const gone of ['Receipts Ready to Print', 'Enqueue All', 'Parsed Data', 'Process CSV']) {
      expect(t).not.toContain(gone);
    }

    await press('Select sales.csv');
    await press('Add to Print Queue (1)');
    t = texts(tree);
    expect(useAppStore.getState().queue).toHaveLength(2);
    expect(t).toContain('1 file processed: 2 receipts added to the print queue. Open the Print Queue to print them.');
    // Queued is not printed: nothing has been sent to the printer yet.
    expect(useAppStore.getState().queue.every(q => q.status === 'QUEUED')).toBe(true);
    expect(t).toContain('No files waiting');
    expect(t).toContain('In Print Queue');
    expect(t.some(x => x.startsWith('2 receipts'))).toBe(true); // receipt count on the file card
    expect(t).not.toContain('INVOICE 1'); // individual receipts live in the Print Queue only
    await press('Open Print Queue');
    expect(navigate).toHaveBeenCalledWith('Queue');

    // Print everything + archive succeeds -> gone from Incoming, no reopen needed
    (DriveService.moveFile as jest.Mock).mockResolvedValue(undefined);
    (DriveService.listCsvFiles as jest.Mock).mockImplementation(async folder =>
      folder === 'arch' ? [file, done] : [],
    );
    await act(async () => {
      for (const id of ['f1::INVOICE::1', 'f1::INVOICE::2']) {
        await useAppStore.getState().updateQueueItemStatus(id, 'PRINTING');
        await useAppStore.getState().updateQueueItemStatus(id, 'PRINTED');
      }
      await flush();
    });
    t = texts(tree);
    expect(t).toContain('No incoming files');
    expect(t).toContain('2 files printed and moved to the Printed folder');
    expect(useAppStore.getState().queue.filter(q => q.status === 'PRINTED')).toHaveLength(2);
  });

  it('archive failure shows Archive Pending with a retry, never Completed', async () => {
    useAppStore.setState({
      queue: [{identity: 'f1::INVOICE::1', status: 'PRINTED', receipt: rcpt('1'), queuedAt: 0, completedAt: 1}],
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 'src', expectedCount: 1, printedCount: 1, archiveStatus: 'FAILED', archiveError: 'boom'}},
    });
    await act(async () => {
      tree = renderer.create(<DriveScreen navigation={{navigate} as any} route={{} as any} />);
      await flush();
    });
    const t = texts(tree);
    expect(t).toContain('Archive Pending');
    expect(t).toContain('Retry Move to Printed');
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Select sales.csv')).toHaveLength(0);
  });
});
