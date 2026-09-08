/**
 * Jest configuration for Winsoft Print Station.
 *
 * transformIgnorePatterns is extended to allow Babel to process
 * React Navigation and related packages that ship ESM-only bundles.
 * See: https://reactnavigation.org/docs/testing
 */
module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      '@react-navigation|' +
      'react-native-screens|' +
      'react-native-safe-area-context|' +
      '@react-native|' +
      'react-native' +
      ')/)',
  ],
};

