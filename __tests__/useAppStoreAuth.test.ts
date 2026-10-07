import {useAppStore} from '../src/store/useAppStore';
import * as GoogleAuthService from '../src/services/auth/GoogleAuthService';
import * as FirebaseAuthService from '../src/services/auth/FirebaseAuthService';
import type {AuthResult} from '../src/services/auth/GoogleAuthService';

jest.mock('@react-native-firebase/auth', () => () => ({
  signInWithCredential: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('@react-native-firebase/auth', () => {
  const auth = () => ({ signInWithCredential: jest.fn(), signOut: jest.fn() });
  auth.GoogleAuthProvider = { credential: jest.fn() };
  return auth;
});
jest.mock('@react-native-firebase/firestore', () => () => ({
  collection: jest.fn(),
}));

jest.mock('../src/services/auth/GoogleAuthService');
jest.mock('../src/services/auth/FirebaseAuthService');
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

describe('useAppStore - Auth Flows', () => {
  beforeEach(() => {
    useAppStore.setState({
      user: null,
      authProfile: null,
      accessToken: null,
      signInError: null,
    });
    jest.clearAllMocks();
  });

  const mockGoogleResult: AuthResult = {
    user: {id: '123', email: 'test@example.com', name: 'Test', photo: null},
    accessToken: 'google_access_token',
    idToken: 'google_id_token',
  };

  it('handles sign in with an ACTIVE user profile', async () => {
    (GoogleAuthService.signIn as jest.Mock).mockResolvedValue(mockGoogleResult);
    (FirebaseAuthService.signInWithGoogleToken as jest.Mock).mockResolvedValue('firebase_uid_123');
    (FirebaseAuthService.fetchUserProfile as jest.Mock).mockResolvedValue({
      uid: 'firebase_uid_123',
      email: 'test@example.com',
      displayName: 'Test',
      status: 'active',
      role: 'user',
    });

    await useAppStore.getState().signIn();

    const state = useAppStore.getState();
    expect(state.user).toEqual(mockGoogleResult.user);
    expect(state.accessToken).toEqual('google_access_token');
    expect(state.authProfile).toBeDefined();
    expect(state.authProfile?.status).toBe('active');
  });

  it('handles sign in when user does NOT exist in Firestore (pending)', async () => {
    (GoogleAuthService.signIn as jest.Mock).mockResolvedValue(mockGoogleResult);
    (FirebaseAuthService.signInWithGoogleToken as jest.Mock).mockResolvedValue('firebase_uid_456');
    (FirebaseAuthService.fetchUserProfile as jest.Mock).mockResolvedValue(null); // User not provisioned

    await useAppStore.getState().signIn();

    const state = useAppStore.getState();
    expect(state.user).toEqual(mockGoogleResult.user);
    expect(state.authProfile).toBeNull();
  });

  it('handles sign out and clears session', async () => {
    useAppStore.setState({
      user: mockGoogleResult.user,
      authProfile: {uid: 'firebase_uid_123', email: '', displayName: '', status: 'active', role: 'user'},
      accessToken: 'google_access_token',
    });

    await useAppStore.getState().signOut();

    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.authProfile).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(FirebaseAuthService.signOutFirebase).toHaveBeenCalled();
    expect(GoogleAuthService.signOut).toHaveBeenCalled();
  });
});
