/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/services/auth/FirebaseAuthService', () => ({
  waitForInitialAuthState: jest.fn().mockResolvedValue(null),
  getCurrentFirebaseUserUid: jest.fn().mockReturnValue(null),
  subscribeToAuthState: jest.fn().mockReturnValue(() => {}),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
