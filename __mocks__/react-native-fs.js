module.exports = {
  DocumentDirectoryPath: '/mock-documents',
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
};
