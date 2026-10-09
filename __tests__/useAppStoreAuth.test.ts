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
    (FirebaseAuthService.waitForInitialAuthState as jest.Mock).mockResolvedValue(null);
  });

  const mockGoogleResult: AuthResult = {
    user: {id: '123', email: 'test@example.com', name: 'Test', photo: null},
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
    expect(state.accessToken).toBeNull();
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

  it('waits for Firebase restoration before resolving an unauthenticated state', async () => {
    let finishAuthState!: (value: null) => void;
    (FirebaseAuthService.waitForInitialAuthState as jest.Mock).mockReturnValue(
      new Promise(resolve => { finishAuthState = resolve; }),
    );

    const restoration = useAppStore.getState().restoreSession();
    expect(useAppStore.getState().restoreSessionLoading).toBe(true);
    finishAuthState(null);
    await restoration;

    expect(useAppStore.getState().restoreSessionLoading).toBe(false);
    expect(useAppStore.getState().user).toBeNull();
    expect(GoogleAuthService.signInSilently).not.toHaveBeenCalled();
  });

  it('restores Firebase identity when the Google native user cache is empty', async () => {
    (FirebaseAuthService.waitForInitialAuthState as jest.Mock).mockResolvedValue({
      uid: 'firebase-user', email: 'person@example.com', displayName: 'Person', photoURL: null,
    });
    (FirebaseAuthService.fetchUserProfile as jest.Mock).mockResolvedValue({
      uid: 'firebase-user', email: 'person@example.com', displayName: 'Person', status: 'active', role: 'admin',
    });
    (GoogleAuthService.getCurrentUserSync as jest.Mock).mockReturnValue(null);

    await useAppStore.getState().restoreSession();

    expect(useAppStore.getState().user).toMatchObject({id: 'firebase-user', email: 'person@example.com'});
    expect(GoogleAuthService.signInSilently).not.toHaveBeenCalled();
  });

  it('reconnects Drive without changing the Firebase application session', async () => {
    const appUser = {id: 'firebase-user', email: 'person@example.com', name: 'Person', photo: null};
    useAppStore.setState({user: appUser, driveNeedsReauth: true});
    (GoogleAuthService.getCurrentUserSync as jest.Mock).mockReturnValue({
      id: 'google-user', email: 'person@example.com', name: 'Person', photo: null,
    });
    (GoogleAuthService.getValidDriveAccessToken as jest.Mock).mockResolvedValue('fresh-drive-token');

    await useAppStore.getState().reconnectGoogleDrive();

    expect(useAppStore.getState().user).toEqual(appUser);
    expect(useAppStore.getState().driveNeedsReauth).toBe(false);
    expect(FirebaseAuthService.signInWithGoogleToken).not.toHaveBeenCalled();
  });

  it('clears Account A Google authorization before signing into Account B', async () => {
    useAppStore.setState({user: {id: 'firebase-a', email: 'a@example.com', name: 'A', photo: null}});
    (FirebaseAuthService.signOutFirebase as jest.Mock).mockResolvedValue(undefined);
    await useAppStore.getState().signOut();

    const accountB: AuthResult = {
      user: {id: 'google-b', email: 'b@example.com', name: 'B', photo: null},
      idToken: 'id-token-b',
    };
    (GoogleAuthService.signIn as jest.Mock).mockResolvedValue(accountB);
    (FirebaseAuthService.signInWithGoogleToken as jest.Mock).mockResolvedValue('firebase-b');
    (FirebaseAuthService.fetchUserProfile as jest.Mock).mockResolvedValue({
      uid: 'firebase-b', email: 'b@example.com', displayName: 'B', status: 'active', role: 'admin',
    });

    await useAppStore.getState().signIn();

    expect(GoogleAuthService.signOut).toHaveBeenCalled();
    expect(FirebaseAuthService.signInWithGoogleToken).toHaveBeenCalledWith('id-token-b');
    expect(useAppStore.getState().user?.email).toBe('b@example.com');
    expect(useAppStore.getState().accessToken).toBeNull();
  });
});
