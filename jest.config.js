/**
 * Jest configuration for Winsoft Print Station.
 *
 * transformIgnorePatterns is extended to allow Babel to process
 * React Navigation and related packages that ship ESM-only bundles.
 * See: https://reactnavigation.org/docs/testing
 */
module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: [
    '<rootDir>/node_modules/@react-native-google-signin/google-signin/jest/build/jest/setup.js',
    '<rootDir>/jest.setup.js',
  ],
  moduleNameMapper: {
    '^react-native-fs$': '<rootDir>/__mocks__/react-native-fs.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@react-navigation|' +
      'react-native-screens|' +
      'react-native-safe-area-context|' +
      '@react-native|' +
      'react-native|' +
      '@react-native-google-signin/google-signin|' +
      '@react-native-async-storage/async-storage' +
      ')/)',
  ],
};
