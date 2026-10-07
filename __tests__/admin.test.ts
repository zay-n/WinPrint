/**
 * admin.test.ts — Admin feature tests
 *
 * Tests cover:
 *  1. Auth configuration (release-safe)
 *  2. Auth error handling
 *  3. Admin user actions
 *  4. Business assignment/removal
 *  5. Admin self-protection
 *  6. Device management
 *  7. Audit log logic
 *  8. Security-sensitive state transitions
 *  9. AdminStats computation
 */

import * as GoogleAuthService from '../src/services/auth/GoogleAuthService';
import * as FirebaseAuthService from '../src/services/auth/FirebaseAuthService';

// ---------------------------------------------------------------------------
// Mock firebase modules
// ---------------------------------------------------------------------------

jest.mock('@react-native-firebase/auth', () => {
  const auth = jest.fn(() => ({
    signInWithCredential: jest.fn(),
    signOut: jest.fn(),
  }));
  (auth as any).GoogleAuthProvider = {
    credential: jest.fn().mockReturnValue({ providerId: 'google.com' }),
  };
  return {
    getAuth: auth,
    GoogleAuthProvider: (auth as any).GoogleAuthProvider,
    signInWithCredential: jest.fn().mockResolvedValue({ user: { uid: 'test_uid' } }),
    signOut: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const mockDocGet = jest.fn();
  const mockSetDoc = jest.fn().mockResolvedValue(undefined);
  const mockUpdateDoc = jest.fn().mockResolvedValue(undefined);
  const mockBatchUpdate = jest.fn();
  const mockBatchSet = jest.fn();
  const mockBatchCommit = jest.fn().mockResolvedValue(undefined);

  return {
    getFirestore: jest.fn(() => ({})),
    collection: jest.fn((db: any, path: string) => ({
      get: jest.fn().mockResolvedValue({ docs: [] }),
      path,
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
    doc: jest.fn((db: any, collection: any, id: string) => ({
      get: mockDocGet,
      id,
    })),
    setDoc: mockSetDoc,
    updateDoc: mockUpdateDoc,
    writeBatch: jest.fn(() => ({
      update: mockBatchUpdate,
      set: mockBatchSet,
      commit: mockBatchCommit,
    })),
    FieldValue: {
      delete: jest.fn(() => '__DELETE__'),
      serverTimestamp: jest.fn(() => '__SERVER_TIMESTAMP__'),
    },
    __mocks: {
      mockDocGet,
      mockSetDoc,
      mockUpdateDoc,
      mockBatchUpdate,
      mockBatchSet,
      mockBatchCommit,
    },
  };
});

const {
  mockDocGet,
  mockSetDoc,
  mockUpdateDoc,
  mockBatchUpdate,
  mockBatchSet,
  mockBatchCommit,
} = (jest.requireMock('@react-native-firebase/firestore') as any).__mocks;

// ---------------------------------------------------------------------------
// Mock Google Sign-In module
// ---------------------------------------------------------------------------

jest.mock('@react-native-google-signin/google-signin', () => {
  const mockConfigure = jest.fn();
  const mockHasPlayServices = jest.fn().mockResolvedValue(true);
  const mockSignIn = jest.fn();
  const mockGetTokens = jest.fn().mockResolvedValue({
    accessToken: 'mock_access_token',
    idToken: 'mock_id_token',
  });
  const mockGetCurrentUser = jest.fn();
  const mockSignOut = jest.fn().mockResolvedValue(undefined);

  return {
    GoogleSignin: {
      configure: mockConfigure,
      hasPlayServices: mockHasPlayServices,
      signIn: mockSignIn,
      getTokens: mockGetTokens,
      getCurrentUser: mockGetCurrentUser,
      signOut: mockSignOut,
    },
    isSuccessResponse: jest.fn((resp: any) => resp?.type !== 'cancelled'),
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    },
    __mocks: {
      mockConfigure,
      mockHasPlayServices,
      mockSignIn,
      mockGetTokens,
      mockGetCurrentUser,
      mockSignOut,
    },
  };
});

const {
  mockConfigure,
  mockHasPlayServices,
  mockSignIn,
  mockGetTokens,
  mockGetCurrentUser,
  mockSignOut,
} = (jest.requireMock('@react-native-google-signin/google-signin') as any).__mocks;

// ---------------------------------------------------------------------------
// GoogleAuthService tests
// ---------------------------------------------------------------------------

describe('GoogleAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('configure()', () => {
    it('always calls GoogleSignin.configure with webClientId', () => {
      GoogleAuthService.configure();
      expect(mockConfigure).toHaveBeenCalledWith(
        expect.objectContaining({
          webClientId: expect.stringContaining('.apps.googleusercontent.com'),
          offlineAccess: false,
        }),
      );
    });

    it('is safe to call multiple times', () => {
      GoogleAuthService.configure();
      GoogleAuthService.configure();
      GoogleAuthService.configure();
      expect(mockConfigure).toHaveBeenCalledTimes(3);
    });
  });

  describe('signIn()', () => {
    it('returns AuthResult with idToken and accessToken on success', async () => {
      mockSignIn.mockResolvedValue({
        type: 'success',
        data: {
          user: { id: 'gid', name: 'Test User', email: 'test@example.com', photo: null },
          idToken: 'test_id_token',
        },
      });

      const result = await GoogleAuthService.signIn();
      expect(result.user.email).toBe('test@example.com');
      expect(result.idToken).toBe('test_id_token');
      expect(result.accessToken).toBe('mock_access_token');
    });

    it('throws CANCELLED error when user cancels', async () => {
      mockSignIn.mockResolvedValue({ type: 'cancelled' });
      await expect(GoogleAuthService.signIn()).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    });

    it('throws NO_ID_TOKEN error when idToken is missing', async () => {
      mockSignIn.mockResolvedValue({
        type: 'success',
        data: {
          user: { id: 'gid', name: 'Test', email: 'test@example.com', photo: null },
          idToken: null,
        },
      });
      await expect(GoogleAuthService.signIn()).rejects.toMatchObject({
        code: 'NO_ID_TOKEN',
      });
    });

    it('maps DEVELOPER_ERROR (10) to friendly message', async () => {
      mockSignIn.mockRejectedValue({ code: '10', nativeErrorCode: '10', message: 'DEVELOPER_ERROR' });
      await expect(GoogleAuthService.signIn()).rejects.toMatchObject({
        code: 'DEVELOPER_ERROR',
        message: expect.stringContaining('configuration error'),
      });
    });

    it('handles PLAY_SERVICES_NOT_AVAILABLE', async () => {
      mockHasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
      await expect(GoogleAuthService.signIn()).rejects.toMatchObject({
        code: 'PLAY_SERVICES_UNAVAILABLE',
      });
    });
  });

  describe('getCurrentUser()', () => {
    it('returns null when no user is signed in', async () => {
      mockGetCurrentUser.mockReturnValue(null);
      const result = await GoogleAuthService.getCurrentUser();
      expect(result).toBeNull();
    });

    it('returns null when current user has no idToken', async () => {
      mockGetCurrentUser.mockReturnValue({
        user: { id: 'gid', name: 'Test', email: 'test@example.com', photo: null },
        idToken: null,
      });
      const result = await GoogleAuthService.getCurrentUser();
      expect(result).toBeNull();
    });

    it('returns AuthResult when user is signed in with valid idToken', async () => {
      mockGetCurrentUser.mockReturnValue({
        user: { id: 'gid', name: 'Test', email: 'test@example.com', photo: null },
        idToken: 'valid_id_token',
      });
      const result = await GoogleAuthService.getCurrentUser();
      expect(result).not.toBeNull();
      expect(result?.user.email).toBe('test@example.com');
      expect(result?.idToken).toBe('valid_id_token');
    });
  });
});

// ---------------------------------------------------------------------------
// FirebaseAuthService - User profile tests
// ---------------------------------------------------------------------------

describe('FirebaseAuthService - fetchUserProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a new pending user profile on first sign-in', async () => {
    mockDocGet.mockResolvedValue({ exists: () => false });
    const profile = await FirebaseAuthService.fetchUserProfile('new_uid', 'new@example.com', 'New User');
    expect(mockSetDoc).toHaveBeenCalled();
    expect(profile?.status).toBe('pending');
    expect(profile?.role).toBe('user');
    expect(profile?.email).toBe('new@example.com');
  });

  it('returns existing user profile without creating', async () => {
    mockDocGet.mockResolvedValue({
      exists: () => true,
      data: () => ({
        email: 'existing@example.com',
        displayName: 'Existing',
        status: 'active',
        role: 'user',
      }),
    });
    const profile = await FirebaseAuthService.fetchUserProfile('existing_uid');
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(profile?.status).toBe('active');
  });

  it('returns null on permission-denied (unprovisioned user)', async () => {
    mockDocGet.mockRejectedValue({ code: 'firestore/permission-denied' });
    const profile = await FirebaseAuthService.fetchUserProfile('denied_uid');
    expect(profile).toBeNull();
  });

  it('re-throws non-permission errors', async () => {
    mockDocGet.mockRejectedValue(new Error('Network failure'));
    await expect(FirebaseAuthService.fetchUserProfile('uid')).rejects.toThrow('Network failure');
  });
});

// ---------------------------------------------------------------------------
// Admin user actions
// ---------------------------------------------------------------------------

describe('FirebaseAuthService - Admin user actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adminUpdateUser calls updateDoc and writes audit log', async () => {
    await FirebaseAuthService.adminUpdateUser('target_uid', { status: 'active' }, 'admin_uid', 'admin@example.com');
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'active' }),
    );
    // Audit log setDoc should be called
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it('adminUpdateUser with status=active produces approve_user action', async () => {
    await FirebaseAuthService.adminUpdateUser('uid', { status: 'active' }, 'admin_uid', 'admin@test.com');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'approve_user', targetType: 'user', targetId: 'uid' }),
    );
  });

  it('adminUpdateUser with status=suspended produces suspend_user action', async () => {
    await FirebaseAuthService.adminUpdateUser('uid', { status: 'suspended' }, 'admin_uid', 'admin@test.com');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'suspend_user' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Business assignment
// ---------------------------------------------------------------------------

describe('FirebaseAuthService - Business assignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it('adminAssignBusiness uses batch to update user + customer atomically', async () => {
    await FirebaseAuthService.adminAssignBusiness('user_uid', 'BIZ-001', 'admin_uid', 'admin@test.com');
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { businessId: 'BIZ-001' },
    );
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      { allowedUserIds: { user_uid: true } },
      { merge: true },
    );
    expect(mockBatchCommit).toHaveBeenCalled();
    // Audit log
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'assign_business', targetId: 'user_uid' }),
    );
  });

  it('adminRemoveBusiness removes businessId from user and uid from customer', async () => {
    await FirebaseAuthService.adminRemoveBusiness('user_uid', 'BIZ-001', 'admin_uid', 'admin@test.com');
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { businessId: '__DELETE__' },
    );
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { 'allowedUserIds.user_uid': '__DELETE__' },
    );
    expect(mockBatchCommit).toHaveBeenCalled();
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'remove_business' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Device management
// ---------------------------------------------------------------------------

describe('FirebaseAuthService - Device management', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adminUpdateDevice with disabled=true produces revoke_device audit action', async () => {
    await FirebaseAuthService.adminUpdateDevice('device_uid', { disabled: true }, 'admin_uid', 'admin@test.com');
    expect(mockSetDoc).toHaveBeenCalledTimes(2); // device update + audit log
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'revoke_device', targetType: 'device', targetId: 'device_uid' }),
    );
  });

  it('adminUpdateDevice with disabled=false produces restore_device audit action', async () => {
    await FirebaseAuthService.adminUpdateDevice('device_uid', { disabled: false }, 'admin_uid', 'admin@test.com');
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'restore_device' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

describe('FirebaseAuthService - Audit log', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writeAuditLog calls setDoc with server timestamp', async () => {
    await FirebaseAuthService.writeAuditLog({
      actorUid: 'admin_uid',
      actorEmail: 'admin@test.com',
      action: 'test_action',
      targetType: 'user',
      targetId: 'target_uid',
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'test_action',
        timestamp: '__SERVER_TIMESTAMP__',
        actorUid: 'admin_uid',
      }),
    );
  });

  it('writeAuditLog does not throw on Firestore error (non-blocking)', async () => {
    mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));
    // Should not throw
    await expect(
      FirebaseAuthService.writeAuditLog({
        actorUid: 'admin_uid',
        action: 'test_action',
        targetType: 'user',
        targetId: 'uid',
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AdminStats computation
// ---------------------------------------------------------------------------

describe('FirebaseAuthService - computeAdminStats', () => {
  const users: FirebaseAuthService.UserProfile[] = [
    { uid: '1', email: 'a@test.com', displayName: 'A', status: 'active', role: 'admin' },
    { uid: '2', email: 'b@test.com', displayName: 'B', status: 'active', role: 'user' },
    { uid: '3', email: 'c@test.com', displayName: 'C', status: 'pending', role: 'user' },
    { uid: '4', email: 'd@test.com', displayName: 'D', status: 'suspended', role: 'user' },
  ];

  const customers: FirebaseAuthService.Customer[] = [
    { businessId: 'BIZ-1', businessName: 'Biz 1', status: 'active', allowedUserIds: {} },
    { businessId: 'BIZ-2', businessName: 'Biz 2', status: 'suspended', allowedUserIds: {} },
  ];

  const devices: FirebaseAuthService.DeviceRecord[] = [
    { uid: 'u1', platform: 'android', monitoringEnabled: true, disabled: false },
    { uid: 'u2', platform: 'android', monitoringEnabled: false, disabled: false },
    { uid: 'u3', platform: 'android', monitoringEnabled: true, disabled: true },
  ];

  it('computes correct user counts', () => {
    const stats = FirebaseAuthService.computeAdminStats(users, customers, devices);
    expect(stats.totalUsers).toBe(4);
    expect(stats.activeUsers).toBe(2);
    expect(stats.pendingUsers).toBe(1);
    expect(stats.suspendedUsers).toBe(1);
  });

  it('computes correct business counts', () => {
    const stats = FirebaseAuthService.computeAdminStats(users, customers, devices);
    expect(stats.totalBusinesses).toBe(2);
    expect(stats.activeBusinesses).toBe(1);
    expect(stats.suspendedBusinesses).toBe(1);
  });

  it('computes correct device counts (only non-disabled monitoring active)', () => {
    const stats = FirebaseAuthService.computeAdminStats(users, customers, devices);
    expect(stats.totalDevices).toBe(3);
    // u1: monitoring=true, disabled=false → active
    // u2: monitoring=false → not active
    // u3: monitoring=true, disabled=true → not active (disabled)
    expect(stats.monitoringActiveDevices).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Security-sensitive state transitions
// ---------------------------------------------------------------------------

describe('Security - state transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('new user profile must start as pending/user role', async () => {
    mockDocGet.mockResolvedValue({ exists: () => false });
    const profile = await FirebaseAuthService.fetchUserProfile('new_uid', 'new@example.com');
    expect(profile?.status).toBe('pending');
    expect(profile?.role).toBe('user');
    // businessId should NOT be set by default
    expect(profile?.businessId).toBeUndefined();
  });

  it('adminAssignBusiness produces consistent batch (no partial state)', async () => {
    mockBatchCommit.mockResolvedValue(undefined);
    await FirebaseAuthService.adminAssignBusiness('uid', 'BIZ-001', 'admin', 'admin@test.com');
    // Both user and customer must be updated in same batch
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('adminRemoveBusiness produces consistent batch (no partial state)', async () => {
    mockBatchCommit.mockResolvedValue(undefined);
    await FirebaseAuthService.adminRemoveBusiness('uid', 'BIZ-001', 'admin', 'admin@test.com');
    // Both user businessId removal and customer allowedUserIds removal in same batch
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});
