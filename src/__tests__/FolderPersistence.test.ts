/**
 * FolderPersistence.test.ts
 *
 * Verifies the canonical Google Drive folder persistence & validation lifecycle:
 *  1. Selecting Incoming folder saves ID, name, path, and triggers monitoring update
 *  2. Selecting Printed folder saves ID, name, and path
 *  3. partialize includes canonical folder keys
 *  4. Hydration marks _hasHydrated = true
 *  5. validateSavedFolders keeps valid folders and updates name if renamed
 *  6. validateSavedFolders flags invalid/deleted folder with user-friendly error
 *  7. Preserves folder configuration across signOut
 */

import {useAppStore} from '../store/useAppStore';
import * as DriveService from '../services/drive/DriveService';
import * as MonitoringService from '../services/monitoring/MonitoringService';

jest.mock('../services/drive/DriveService', () => ({
  listFolders: jest.fn(),
  listCsvFiles: jest.fn(),
  getFileMetadata: jest.fn(),
  moveFile: jest.fn(),
}));

jest.mock('../services/monitoring/MonitoringService', () => ({
  updateMonitoredFolder: jest.fn().mockResolvedValue(undefined),
  registerDevice: jest.fn().mockResolvedValue(undefined),
  ensureRegistered: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  reconnect: jest.fn().mockResolvedValue(undefined),
}));

describe('Folder Persistence & Canonical Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      accessToken: 'test-access-token',
      sourceFolderId: null,
      sourceFolderName: null,
      sourceFolderPath: null,
      sourceFolderValid: true,
      archiveFolderId: null,
      archiveFolderName: null,
      archiveFolderPath: null,
      archiveFolderValid: true,
      driveError: null,
      _hasHydrated: true,
    });
  });

  test('1. Selecting Incoming folder updates store and notifies MonitoringService', async () => {
    await useAppStore.getState().selectFolder({
      id: 'folder-incoming-123',
      name: 'Incoming',
      path: 'My Drive / Winsoft / Customer A / Incoming',
    });

    const state = useAppStore.getState();
    expect(state.sourceFolderId).toBe('folder-incoming-123');
    expect(state.sourceFolderName).toBe('Incoming');
    expect(state.sourceFolderPath).toBe('My Drive / Winsoft / Customer A / Incoming');
    expect(state.sourceFolderValid).toBe(true);
    expect(MonitoringService.updateMonitoredFolder).toHaveBeenCalledWith('folder-incoming-123');
  });

  test('2. Selecting Printed folder updates archive configuration', () => {
    useAppStore.getState().selectArchiveFolder({
      id: 'folder-archive-456',
      name: 'Printed',
      path: 'My Drive / Winsoft / Customer A / Printed',
    });

    const state = useAppStore.getState();
    expect(state.archiveFolderId).toBe('folder-archive-456');
    expect(state.archiveFolderName).toBe('Printed');
    expect(state.archiveFolderPath).toBe('My Drive / Winsoft / Customer A / Printed');
    expect(state.archiveFolderValid).toBe(true);
  });

  test('3. partialize includes canonical folder configuration', () => {
    const state = useAppStore.getState();
    state.sourceFolderId = 'source-id-1';
    state.sourceFolderName = 'Incoming';
    state.sourceFolderPath = 'Root / Incoming';
    state.archiveFolderId = 'archive-id-2';
    state.archiveFolderName = 'Printed';
    state.archiveFolderPath = 'Root / Printed';

    // Retrieve partialize function from Zustand persist options
    const persistOptions = (useAppStore as any).persist?.getOptions?.();
    expect(persistOptions).toBeDefined();

    const partial = persistOptions.partialize(state);
    expect(partial.sourceFolderId).toBe('source-id-1');
    expect(partial.sourceFolderName).toBe('Incoming');
    expect(partial.sourceFolderPath).toBe('Root / Incoming');
    expect(partial.archiveFolderId).toBe('archive-id-2');
    expect(partial.archiveFolderName).toBe('Printed');
    expect(partial.archiveFolderPath).toBe('Root / Printed');
  });

  test('4. Hydration flag lifecycle', () => {
    useAppStore.getState().setHasHydrated(false);
    expect(useAppStore.getState()._hasHydrated).toBe(false);

    useAppStore.getState().setHasHydrated(true);
    expect(useAppStore.getState()._hasHydrated).toBe(true);
  });

  test('5. validateSavedFolders keeps valid folders and updates renamed folder name', async () => {
    useAppStore.setState({
      sourceFolderId: 'valid-folder-id',
      sourceFolderName: 'Old Name',
      archiveFolderId: 'valid-archive-id',
      archiveFolderName: 'Old Archive',
    });

    (DriveService.getFileMetadata as jest.Mock).mockImplementation((_token, id) => {
      if (id === 'valid-folder-id') {
        return Promise.resolve({
          id: 'valid-folder-id',
          name: 'Renamed Incoming',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
        });
      }
      if (id === 'valid-archive-id') {
        return Promise.resolve({
          id: 'valid-archive-id',
          name: 'Renamed Printed',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    await useAppStore.getState().validateSavedFolders();

    const state = useAppStore.getState();
    expect(state.sourceFolderValid).toBe(true);
    expect(state.sourceFolderName).toBe('Renamed Incoming');
    expect(state.archiveFolderValid).toBe(true);
    expect(state.archiveFolderName).toBe('Renamed Printed');
    expect(state.driveError).toBeNull();
  });

  test('6. validateSavedFolders flags deleted/inaccessible folder without silently overwriting', async () => {
    useAppStore.setState({
      sourceFolderId: 'deleted-folder-id',
      sourceFolderName: 'Incoming',
    });

    (DriveService.getFileMetadata as jest.Mock).mockRejectedValue({
      status: 404,
      message: 'File not found: deleted-folder-id',
    });

    await useAppStore.getState().validateSavedFolders();

    const state = useAppStore.getState();
    // Marked invalid
    expect(state.sourceFolderValid).toBe(false);
    // Preserved ID so user knows what folder failed
    expect(state.sourceFolderId).toBe('deleted-folder-id');
    expect(state.driveError).toMatch(/Access to the configured source folder was revoked or it was deleted/i);
  });

  test('7. signOut preserves saved canonical folder preferences', async () => {
    useAppStore.setState({
      user: {email: 'user@example.com', name: 'User'} as any,
      accessToken: 'valid-token',
      sourceFolderId: 'folder-keep-1',
      sourceFolderName: 'Incoming',
      archiveFolderId: 'folder-keep-2',
      archiveFolderName: 'Printed',
    });

    await useAppStore.getState().signOut();

    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    // Canonical folders must NOT be wiped
    expect(state.sourceFolderId).toBe('folder-keep-1');
    expect(state.sourceFolderName).toBe('Incoming');
    expect(state.archiveFolderId).toBe('folder-keep-2');
    expect(state.archiveFolderName).toBe('Printed');
  });
});
