/**
 * GoogleAuthService.ts — Google Sign-In wrapper
 *
 * Wraps @react-native-google-signin/google-signin.
 *
 * Configuration:
 *  - webClientId: The Web OAuth 2.0 Client ID from Google Cloud Console.
 *    This is the client_type:3 entry in google-services.json.
 *    It is used by requestIdToken() to get the ID token for Firebase Auth.
 *  - The Android OAuth client (client_type:1) in google-services.json must
 *    have the app's signing certificate SHA-1 registered.
 *    Debug SHA-1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
 *    Release SHA-1: C6:D1:EA:87:36:38:3D:99:E6:22:76:E2:C4:17:58:46:CE:27:1B:91
 *
 * AUTH ARCHITECTURE:
 *  - Firebase Auth is the authoritative application session.
 *  - Google Sign-In is the identity provider used to establish/refresh credentials.
 *  - On app restart: Firebase onAuthStateChanged restores the session.
 *  - Google Sign-In tokens are obtained on-demand for Drive API calls.
 *  - Short-lived access tokens are NEVER persisted to AsyncStorage/Zustand.
 */

import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

// ---------------------------------------------------------------------------
// Web Client ID — from google-services.json (client_type:3)
// This is the single source of truth for the web client ID.
// ---------------------------------------------------------------------------
const WEB_CLIENT_ID =
  '270826652071-0nd7ju81r4ets6gfdh41ld2b226h37nr.apps.googleusercontent.com';

// ---------------------------------------------------------------------------
// Drive scope required for reading CSV files
// ---------------------------------------------------------------------------
const DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly';

// ---------------------------------------------------------------------------
// Configuration state — configure() must be called before any other method.
// It is safe to call multiple times; native layer is idempotent.
// ---------------------------------------------------------------------------
let _configured = false;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface GoogleUser {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
}

export interface AuthResult {
  user: GoogleUser;
  /** Google ID token — used for Firebase Authentication. */
  idToken: string;
}

export interface AuthError {
  code: string;
  message: string;
}

/**
 * Configure Google Sign-In. Safe to call multiple times.
 * Always re-applies configuration so stale state cannot persist.
 * Call this once at app startup before any other method.
 */
export function configure(): void {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    scopes: [DRIVE_READONLY_SCOPE],
    offlineAccess: false,
  });
  _configured = true;
}

/**
 * Sign in interactively. Opens the Google account picker.
 * Returns AuthResult on success or throws AuthError.
 * NOTE: Does NOT return accessToken — use getValidAccessToken() for Drive calls.
 */
export async function signIn(): Promise<AuthResult> {
  configure();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    if (!isSuccessResponse(userInfo)) {
      throw { code: statusCodes.SIGN_IN_CANCELLED, message: 'Sign-in was cancelled.' };
    }

    const idToken = userInfo.data.idToken;
    if (!idToken) {
      // Log even in release — this is a configuration error, not a user action
      console.error('[WinPrint][GoogleAuth] CRITICAL: Google Sign-In succeeded but returned no idToken.');
      console.error('[WinPrint][GoogleAuth] Check that the Web Client ID is registered in Google Cloud Console');
      console.error('[WinPrint][GoogleAuth] and that offlineAccess is false when using requestIdToken.');
      throw {
        code: 'NO_ID_TOKEN',
        message: 'Google Sign-In returned no ID token. Ensure the Web OAuth client is configured correctly.',
      };
    }

    console.log('[WinPrint][Auth] Google Sign-In: account selected, idToken obtained');

    return {
      user: {
        id: userInfo.data.user.id,
        name: userInfo.data.user.name,
        email: userInfo.data.user.email,
        photo: userInfo.data.user.photo,
      },
      idToken,
    };
  } catch (error: unknown) {
    // Always log sign-in errors — they are needed for release debugging
    const e = error as Record<string, unknown>;
    const code = String(e?.code ?? 'unknown');
    const nativeCode = String(e?.nativeErrorCode ?? '');
    const msg = String(e?.message ?? error);

    // Suppress expected user-cancellation noise
    if (
      code !== statusCodes.SIGN_IN_CANCELLED &&
      code !== statusCodes.IN_PROGRESS &&
      code !== 'CANCELLED'
    ) {
      console.error('[WinPrint][GoogleAuth] Sign-in error:');
      console.error('  code:', code);
      console.error('  nativeErrorCode:', nativeCode, '(10=DEVELOPER_ERROR, 12500=sign-in failed, 12501=cancelled)');
      console.error('  message:', msg);
      if (nativeCode === '10' || code === '10') {
        console.error('[WinPrint][GoogleAuth] DEVELOPER_ERROR (10): This means the app signing certificate SHA-1');
        console.error('[WinPrint][GoogleAuth]   is not registered in Google Cloud Console for this package.');
        console.error('[WinPrint][GoogleAuth]   Debug SHA-1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25');
        console.error('[WinPrint][GoogleAuth]   Release SHA-1: C6:D1:EA:87:36:38:3D:99:E6:22:76:E2:C4:17:58:46:CE:27:1B:91');
        console.error('[WinPrint][GoogleAuth]   Ensure BOTH are registered as separate Android OAuth clients at:');
        console.error('[WinPrint][GoogleAuth]   https://console.cloud.google.com/apis/credentials');
      }
    }
    throw mapError(error);
  }
}

/**
 * Sign out from Google Sign-In and clear native session.
 */
export async function signOut(): Promise<void> {
  configure();
  _configured = false; // Reset so next configure() re-applies cleanly
  try {
    await GoogleSignin.signOut();
  } catch (error: unknown) {
    throw mapError(error);
  }
}

/**
 * Attempt a silent sign-in for an already-authenticated user.
 * Returns the idToken if successful, or null if silent sign-in is unavailable.
 * This is used ONLY to get a fresh idToken for Firebase — not for Drive tokens.
 *
 * NOTE: On app restart, prefer Firebase onAuthStateChanged over this.
 * Only use this if Firebase reports no current user but Google session exists.
 */
export async function signInSilently(): Promise<AuthResult | null> {
  configure();
  try {
    const hasPrevious = GoogleSignin.hasPreviousSignIn();
    if (!hasPrevious) {
      console.log('[WinPrint][Auth] Google: no previous sign-in detected');
      return null;
    }

    const userInfo = await GoogleSignin.signInSilently();
    if (!userInfo || !('data' in userInfo) || !userInfo.data) {
      return null;
    }

    const idToken = userInfo.data.idToken;
    if (!idToken) {
      console.warn('[WinPrint][Auth] Google signInSilently: no idToken returned');
      return null;
    }

    console.log('[WinPrint][Auth] Google: silent sign-in succeeded');
    return {
      user: {
        id: userInfo.data.user.id,
        name: userInfo.data.user.name,
        email: userInfo.data.user.email,
        photo: userInfo.data.user.photo,
      },
      idToken,
    };
  } catch (error: unknown) {
    const e = error as { code?: string; message?: string };
    // Silent sign-in failure is non-fatal — Firebase session takes precedence
    console.warn('[WinPrint][Auth] Google signInSilently failed:', e?.code, e?.message);
    return null;
  }
}

/**
 * Get the currently cached Google user info (synchronous — no network call).
 * Returns null if no user is signed in according to the native layer.
 */
export function getCurrentUserSync(): GoogleUser | null {
  if (!_configured) configure();
  try {
    const userInfo = GoogleSignin.getCurrentUser();
    if (!userInfo) return null;
    return {
      id: userInfo.user.id,
      name: userInfo.user.name ?? null,
      email: userInfo.user.email,
      photo: userInfo.user.photo ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Get a valid Drive access token for the currently signed-in Google account.
 *
 * This is the ONLY method that should be used to obtain access tokens for
 * Google Drive API calls. It always calls getTokens() on the native layer,
 * which returns a cached-but-fresh token (the native SDK handles refresh
 * automatically).
 *
 * ACCESS TOKENS ARE NEVER STORED IN ZUSTAND OR ASYNCSTORAGE.
 * They are fetched on-demand here for every Drive request.
 *
 * Returns null if no Google account is currently signed in.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (!_configured) configure();
  try {
    // GoogleSignin.getTokens() handles token refresh natively.
    const tokens = await GoogleSignin.getTokens();
    if (tokens.accessToken) return tokens.accessToken;
  } catch (error: unknown) {
    const e = error as { code?: string; message?: string };
    console.warn('[WinPrint][Auth] getTokens failed; checking for a restorable Google session:', e?.code, e?.message);
  }

  // A Firebase session can outlive the native Google user cache. Make one
  // silent restoration attempt when Google reports a prior account; never
  // open interactive UI from a Drive request.
  try {
    if (!GoogleSignin.hasPreviousSignIn()) return null;
    const silent = await GoogleSignin.signInSilently();
    if (!silent || !('data' in silent) || !silent.data) return null;
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken || null;
  } catch (error: unknown) {
    const e = error as { code?: string; message?: string };
    console.warn('[WinPrint][Auth] Silent Drive authorization restore failed:', e?.code, e?.message);
    return null;
  }
}

/** Canonical name used by DriveClient for Drive-scoped OAuth credentials. */
export const getValidDriveAccessToken = getValidAccessToken;

/**
 * Clear the cached Google OAuth access token.
 *
 * Call this when a Drive API request returns HTTP 401, before retrying.
 * The native Google Sign-In SDK will obtain a fresh token on the next
 * getTokens() call.
 */
export async function clearCachedAccessToken(): Promise<void> {
  if (!_configured) configure();
  try {
    // getTokens() first to get the current token value for clearCachedToken()
    const tokens = await GoogleSignin.getTokens();
    if (tokens.accessToken) {
      await GoogleSignin.clearCachedAccessToken(tokens.accessToken);
      console.log('[WinPrint][Auth] Drive token cache cleared for 401 retry');
    }
  } catch (error: unknown) {
    // Non-fatal — best effort cache clear
    const e = error as { code?: string; message?: string };
    console.warn('[WinPrint][Auth] clearCachedAccessToken failed (non-fatal):', e?.code, e?.message);
  }
}

/**
 * Returns true if the native Google Sign-In layer has a previous sign-in
 * (may still need a token refresh — use getValidAccessToken() to get the token).
 */
export function hasPreviousSignIn(): boolean {
  if (!_configured) configure();
  try {
    return GoogleSignin.hasPreviousSignIn();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapError(error: unknown): AuthError {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error
  ) {
    const e = error as { code: string; message?: string };
    switch (e.code) {
      case statusCodes.SIGN_IN_CANCELLED:
      case 'CANCELLED':
        return { code: 'CANCELLED', message: 'Sign-in was cancelled by the user.' };
      case statusCodes.IN_PROGRESS:
        return { code: 'IN_PROGRESS', message: 'Sign-in is already in progress.' };
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return {
          code: 'PLAY_SERVICES_UNAVAILABLE',
          message: 'Google Play Services is not available or needs updating.',
        };
      case '10':
      case 'DEVELOPER_ERROR':
        return {
          code: 'DEVELOPER_ERROR',
          message:
            'Google Sign-In configuration error. The app signing certificate may not be registered. ' +
            'Please contact support.',
        };
      default:
        return {
          code: e.code,
          message: e.message ?? 'Unknown authentication error.',
        };
    }
  }
  return { code: 'UNKNOWN', message: String(error) };
}
