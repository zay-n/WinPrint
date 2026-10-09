import * as GoogleAuthService from '../services/auth/GoogleAuthService';
import * as DriveClient from '../services/drive/DriveClient';
import { DriveApiError, DriveAuthError, downloadFileAsText, listCsvFiles, listFolders, moveFile } from '../services/drive/DriveClient';

jest.mock('../services/auth/GoogleAuthService', () => ({
  getValidDriveAccessToken: jest.fn(),
  clearCachedAccessToken: jest.fn(),
}));

const response = (status: number, body: unknown = {}, content = '') => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 401 ? 'Unauthorized' : 'Request failed',
  json: jest.fn().mockResolvedValue(body),
  text: jest.fn().mockResolvedValue(content),
} as unknown as Response);

describe('DriveClient token lifecycle', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    (GoogleAuthService.getValidDriveAccessToken as jest.Mock).mockResolvedValue('token-current');
  });

  it('uses the current token for folder listing', async () => {
    fetchMock.mockResolvedValue(response(200, {files: []}));
    await listFolders('parent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-current');
  });

  it('paginates Incoming folder listing when discovering CSV files', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, {files: [{id: 'one', name: 'one.csv', mimeType: 'text/csv'}], nextPageToken: 'page-2'}))
      .mockResolvedValueOnce(response(200, {files: [{id: 'two', name: 'two.csv', mimeType: 'text/csv'}]}));
    const files = await listCsvFiles('incoming');
    expect(files.map(file => file.id)).toEqual(['one', 'two']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(fetchMock.mock.calls[1][0])).toContain('pageToken=page-2');
  });

  it('clears the stale token and retries the same request once with a fresh token', async () => {
    (GoogleAuthService.getValidDriveAccessToken as jest.Mock)
      .mockResolvedValueOnce('token-stale')
      .mockResolvedValueOnce('token-fresh');
    fetchMock
      .mockResolvedValueOnce(response(401, {error: {message: 'expired'}}))
      .mockResolvedValueOnce(response(200, {files: []}));

    await listFolders('parent');

    expect(GoogleAuthService.clearCachedAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
    expect(fetchMock.mock.calls[0][1].method).toBe(fetchMock.mock.calls[1][1].method);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token-fresh');
  });

  it('throws a recoverable auth error when the one retry is still unauthorized', async () => {
    (GoogleAuthService.getValidDriveAccessToken as jest.Mock)
      .mockResolvedValueOnce('token-stale')
      .mockResolvedValueOnce('token-fresh');
    fetchMock
      .mockResolvedValueOnce(response(401, {error: {message: 'expired'}}))
      .mockResolvedValueOnce(response(401, {error: {message: 'still expired'}}));

    await expect(listFolders('parent')).rejects.toBeInstanceOf(DriveAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('converts a failed token refresh after 401 into DriveAuthError', async () => {
    const getToken = GoogleAuthService.getValidDriveAccessToken as jest.Mock;
    getToken.mockResolvedValueOnce('old-token').mockRejectedValueOnce(new Error('native auth unavailable'));
    global.fetch = jest.fn().mockResolvedValueOnce(response(401, {error: {message: 'expired'}}));

    await expect(DriveClient.listFolders('root')).rejects.toBeInstanceOf(DriveAuthError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(GoogleAuthService.clearCachedAccessToken).toHaveBeenCalledTimes(1);
  });

  it('surfaces an initial 403 as recoverable Drive authorization', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(403, {error: {message: 'insufficient permissions'}}));

    await expect(DriveClient.listFolders('root')).rejects.toBeInstanceOf(DriveAuthError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses the same retry behavior for CSV download and archive move', async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, {}, 'csv'))
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, {id: 'file-1'}));

    await expect(downloadFileAsText('file-1')).resolves.toBe('csv');
    await moveFile('file-1', 'incoming', 'printed');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[3][1].method).toBe('PATCH');
    expect(decodeURIComponent(fetchMock.mock.calls[2][0])).toContain('addParents=printed');
    expect(decodeURIComponent(fetchMock.mock.calls[2][0])).toContain('removeParents=incoming');
    expect(decodeURIComponent(fetchMock.mock.calls[2][0])).toContain('supportsAllDrives=true');
  });

  it('retries a text download exactly once and surfaces a second 401 as DriveAuthError', async () => {
    fetchMock
      .mockResolvedValueOnce(response(401, {}, 'expired'))
      .mockResolvedValueOnce(response(401, {}, 'still expired'));

    await expect(downloadFileAsText('file-1')).rejects.toBeInstanceOf(DriveAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(GoogleAuthService.clearCachedAccessToken).toHaveBeenCalledTimes(1);
  });

  it('keeps a non-authentication error after retry as DriveApiError', async () => {
    fetchMock
      .mockResolvedValueOnce(response(401, {}, 'expired'))
      .mockResolvedValueOnce(response(500, {error: {message: 'Drive unavailable'}}));

    await expect(listFolders('parent')).rejects.toBeInstanceOf(DriveApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a non-authentication text-download error as DriveApiError', async () => {
    fetchMock
      .mockResolvedValueOnce(response(401, {}, 'expired'))
      .mockResolvedValueOnce(response(500, {}, 'Drive unavailable'));

    await expect(downloadFileAsText('file-1')).rejects.toBeInstanceOf(DriveApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an unrecoverable 403 after retry as DriveAuthError', async () => {
    fetchMock
      .mockResolvedValueOnce(response(401, {}, 'expired'))
      .mockResolvedValueOnce(response(403, {error: {message: 'insufficient permissions'}}));

    await expect(listFolders('parent')).rejects.toBeInstanceOf(DriveAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
