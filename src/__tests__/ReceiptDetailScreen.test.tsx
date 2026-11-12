import React from 'react';
import {Alert, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import ReceiptDetailScreen from '../screens/history/ReceiptDetailScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import {useAppStore} from '../store/useAppStore';
import type {Receipt} from '../models/Receipt';

jest.mock('../services/drive/DriveService', () => ({
  moveFile: jest.fn(), listFolders: jest.fn(), listCsvFiles: jest.fn(), downloadAndParseCsv: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {SafeAreaView: View};
});

const receipt: Receipt = {
  sourceRows: [], transactionType: 'INVOICE', transactionNumber: '1001', date: '01/10/2023',
  customer: {name: 'Acme Trading'},
  items: [
    {sourceFields: {descript: 'Blue Widget'}, description: 'Blue Widget', quantity: 3, rate: 12.5, amount: 37.5, vatAmount: 1.88, itemDiscount: 0.5},
  ],
  financials: {subtotal: 37.5, discountAmount: 0.5, vatAmount: 1.88, vatRate: 5, total: 38.88},
  additional: {},
  sourceFile: {driveFileId: 'f1', driveFileName: 'sales.csv'},
};

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(t => [t.props.children].flat(Infinity).join(''));

describe('History transaction details', () => {
  const printReceipt = jest.fn(async () => ({success: true}));
  let tree: renderer.ReactTestRenderer;

  beforeEach(() => {
    printReceipt.mockClear();
    useAppStore.setState({
      queue: [
        {identity: 'f1::INVOICE::1001', status: 'PRINTED', receipt, queuedAt: 1, completedAt: 2},
        // legacy record: almost everything missing
        {identity: 'legacy', status: 'PRINTED', receipt: {transactionType: 'INVOICE', transactionNumber: '7'} as any, queuedAt: 1},
      ],
      csvProgress: {f1: {driveFileId: 'f1', sourceFolderId: 's', expectedCount: 1, printedCount: 1, archiveStatus: 'ARCHIVED'}},
      printLoading: false,
      printReceipt: printReceipt as any,
    });
  });
  afterEach(() => act(() => tree?.unmount()));

  const open = async (identity: string) => {
    await act(async () => {
      tree = renderer.create(<ReceiptDetailScreen route={{params: {identity}}} />);
    });
    return texts(tree);
  };

  it('renders stored fields and line items without touching queue or printing', async () => {
    const before = useAppStore.getState().queue;
    const t = await open('f1::INVOICE::1001');
    for (const expected of ['INVOICE · 1001', 'Acme Trading', '01/10/2023', 'sales.csv', 'Blue Widget', '3', '12.5', '37.5', '0.5', '1.88', '5%', '38.88', 'Printed', 'Moved to Printed folder', 'Reprint']) {
      expect(t).toContain(expected);
    }
    expect(printReceipt).not.toHaveBeenCalled();
    expect(useAppStore.getState().queue).toBe(before);
  });

  it('handles legacy records with missing fields', async () => {
    const t = await open('legacy');
    expect(t).toContain('INVOICE · 7');
    expect(t).toContain('Line Items (0)');
    expect(t).toContain('No customer details were supplied.');
  });

  it('shows a fallback for unknown records', async () => {
    expect(await open('nope')).toContain('Details unavailable');
  });

  it('Reprint asks first, then uses printReceipt and leaves queue + archive state alone', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await open('f1::INVOICE::1001');
    const before = {queue: useAppStore.getState().queue, csvProgress: useAppStore.getState().csvProgress};
    const btn = tree.root.findByProps({accessibilityLabel: 'Reprint receipt'});
    act(() => btn.props.onPress());
    expect(printReceipt).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => { buttons[1].onPress!(); });
    expect(printReceipt).toHaveBeenCalledTimes(1);
    expect(printReceipt).toHaveBeenCalledWith(receipt);
    expect(useAppStore.getState().queue).toBe(before.queue);
    expect(useAppStore.getState().csvProgress).toBe(before.csvProgress);
    expect(texts(tree)).toContain('Reprint sent to the printer.');
    alert.mockRestore();
  });

  it('History rows open details (including legacy rows) without printing', async () => {
    const navigate = jest.fn();
    await act(async () => {
      tree = renderer.create(<HistoryScreen navigation={{navigate} as any} route={{} as any} />);
    });
    const rows = tree.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('View details for') && typeof n.props.onPress === 'function');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    act(() => rows[0].props.onPress());
    expect(navigate).toHaveBeenCalledWith('HistoryDetail', expect.objectContaining({identity: expect.any(String)}));
    expect(printReceipt).not.toHaveBeenCalled();
  });
});
