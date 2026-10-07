/**
 * DriveFolderPicker.test.tsx
 *
 * Verifies nested Google Drive folder picker behaviors using react-test-renderer:
 *  - Rendering folders at current level
 *  - Hierarchical navigation into child folders
 *  - Selecting the active nested folder
 *  - Back button navigation up one level
 */

import React from 'react';
import {FlatList, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import DriveFolderPickerModal from '../components/DriveFolderPickerModal';
import * as DriveService from '../services/drive/DriveService';

jest.mock('../services/drive/DriveService', () => ({
  listFolders: jest.fn(),
}));

describe('DriveFolderPickerModal', () => {
  let tree: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    tree = null;
  });

  afterEach(() => {
    if (tree) {
      act(() => {
        tree?.unmount();
      });
      tree = null;
    }
  });

  test('1. Loads root folders when opened', async () => {
    (DriveService.listFolders as jest.Mock).mockResolvedValue([
      {id: 'folder-1', name: 'Winsoft Receipts', mimeType: 'application/vnd.google-apps.folder'},
      {id: 'folder-2', name: 'Personal', mimeType: 'application/vnd.google-apps.folder'},
    ]);

    const onSelect = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      tree = renderer.create(
        <DriveFolderPickerModal
          visible={true}
          title="Select Source Folder"
          accessToken="test-token"
          onSelect={onSelect}
          onClose={onClose}
        />
      );
    });

    expect(DriveService.listFolders).toHaveBeenCalledWith('test-token', 'root');
    expect(tree).toBeDefined();
  });

  test('2. Navigates into nested folder and selects it', async () => {
    (DriveService.listFolders as jest.Mock).mockImplementation((_token, parentId) => {
      if (parentId === 'root') {
        return Promise.resolve([
          {id: 'folder-winsoft', name: 'Winsoft Receipts', mimeType: 'application/vnd.google-apps.folder'},
        ]);
      }
      if (parentId === 'folder-winsoft') {
        return Promise.resolve([
          {id: 'folder-incoming', name: 'Incoming', mimeType: 'application/vnd.google-apps.folder'},
        ]);
      }
      return Promise.resolve([]);
    });

    const onSelect = jest.fn();
    const onClose = jest.fn();

    let tree: any = null;
    await act(async () => {
      tree = renderer.create(
        <DriveFolderPickerModal
          visible={true}
          title="Select Incoming Folder"
          accessToken="test-token"
          onSelect={onSelect}
          onClose={onClose}
        />
      );
    });

    // Allow promises and state updates to resolve
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    const flatList = tree.root.findByType(FlatList);
    expect(flatList.props.data).toHaveLength(1);
    expect(flatList.props.data[0].name).toBe('Winsoft Receipts');

    // Find row for Winsoft Receipts
    const touchables = tree.root.findAll((node: any) => typeof node.props.onPress === 'function');
    const winsoftRow = touchables.find((node: any) => {
      const texts = node.findAllByType(Text);
      return texts.some((t: any) => t.props.children === 'Winsoft Receipts');
    });

    expect(winsoftRow).toBeDefined();

    await act(async () => {
      winsoftRow.props.onPress();
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(DriveService.listFolders).toHaveBeenCalledWith('test-token', 'folder-winsoft');

    // Now FlatList data has updated to nested folder
    expect(flatList.props.data).toHaveLength(1);
    expect(flatList.props.data[0].name).toBe('Incoming');

    // Tap "Select This Folder" button
    const touchablesAfter = tree.root.findAll((node: any) => typeof node.props.onPress === 'function');
    const selectBtn = touchablesAfter.find((node: any) => {
      const texts = node.findAllByType(Text);
      return texts.some((t: any) => t.props.children === 'Select This Folder');
    });

    expect(selectBtn).toBeDefined();

    if (selectBtn) {
      await act(async () => {
        selectBtn.props.onPress();
      });
    }

    expect(onSelect).toHaveBeenCalledWith({
      id: 'folder-winsoft',
      name: 'Winsoft Receipts',
      path: 'My Drive / Winsoft Receipts',
    });
    expect(onClose).toHaveBeenCalled();
  });

  test('3. Back button navigates up to parent folder', async () => {
    (DriveService.listFolders as jest.Mock).mockImplementation((_token, parentId) => {
      if (parentId === 'root') {
        return Promise.resolve([
          {id: 'folder-winsoft', name: 'Winsoft Receipts', mimeType: 'application/vnd.google-apps.folder'},
        ]);
      }
      if (parentId === 'folder-winsoft') {
        return Promise.resolve([
          {id: 'folder-incoming', name: 'Incoming', mimeType: 'application/vnd.google-apps.folder'},
        ]);
      }
      return Promise.resolve([]);
    });

    const onSelect = jest.fn();
    const onClose = jest.fn();

    let tree: any = null;
    await act(async () => {
      tree = renderer.create(
        <DriveFolderPickerModal
          visible={true}
          title="Select Incoming Folder"
          accessToken="test-token"
          onSelect={onSelect}
          onClose={onClose}
        />
      );
    });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // Navigate into Winsoft Receipts
    const touchables = tree.root.findAll((node: any) => typeof node.props.onPress === 'function');
    const winsoftRow = touchables.find((node: any) => {
      const texts = node.findAllByType(Text);
      return texts.some((t: any) => t.props.children === 'Winsoft Receipts');
    });

    expect(winsoftRow).toBeDefined();

    await act(async () => {
      winsoftRow.props.onPress();
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(DriveService.listFolders).toHaveBeenCalledWith('test-token', 'folder-winsoft');

    // Now back button should exist
    const touchablesAfter = tree.root.findAll((node: any) => typeof node.props.onPress === 'function');
    const backBtn = touchablesAfter.find(
      (node: any) => node.props.accessibilityLabel === 'Go back one folder level'
    );
    expect(backBtn).toBeDefined();

    await act(async () => {
      backBtn.props.onPress();
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // Should have re-fetched root
    expect(DriveService.listFolders).toHaveBeenCalledWith('test-token', 'root');
  });
});
