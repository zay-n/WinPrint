import * as DriveClient from '../services/drive/DriveClient';
import {moveFile} from '../services/drive/DriveService';

jest.mock('../services/drive/DriveClient', () => ({
  getFileMetadata: jest.fn(),
  moveFile: jest.fn(),
  DriveApiError: class DriveApiError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  },
}));

const folder = {id: 'printed', name: 'Printed', mimeType: 'application/vnd.google-apps.folder', parents: ['root']};

describe('DriveService archive move', () => {
  beforeEach(() => jest.clearAllMocks());

  it('moves the original file from the configured Incoming parent and verifies returned parent IDs', async () => {
    (DriveClient.getFileMetadata as jest.Mock)
      .mockResolvedValueOnce({id: 'csv-1', name: 'bill.csv', mimeType: 'text/csv', parents: ['incoming']})
      .mockResolvedValueOnce(folder);
    (DriveClient.moveFile as jest.Mock).mockResolvedValue({id: 'csv-1', name: 'bill.csv', parents: ['printed']});

    const result = await moveFile('csv-1', 'incoming', 'printed');

    expect(DriveClient.moveFile).toHaveBeenCalledWith('csv-1', 'incoming', 'printed');
    expect(result.parents).toEqual(['printed']);
  });

  it('treats an already completed move as an idempotent archive retry', async () => {
    (DriveClient.getFileMetadata as jest.Mock)
      .mockResolvedValueOnce({id: 'csv-1', name: 'bill.csv', mimeType: 'text/csv', parents: ['printed']})
      .mockResolvedValueOnce(folder);

    await moveFile('csv-1', 'incoming', 'printed');

    expect(DriveClient.moveFile).not.toHaveBeenCalled();
  });

  it('refuses to report success when the source is no longer under Incoming', async () => {
    (DriveClient.getFileMetadata as jest.Mock)
      .mockResolvedValueOnce({id: 'csv-1', name: 'bill.csv', mimeType: 'text/csv', parents: ['other']})
      .mockResolvedValueOnce(folder);

    await expect(moveFile('csv-1', 'incoming', 'printed')).rejects.toThrow(/no longer in the configured Incoming folder/);
    expect(DriveClient.moveFile).not.toHaveBeenCalled();
  });
});
