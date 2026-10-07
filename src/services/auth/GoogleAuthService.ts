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
  /** OAuth access token — used for Drive API calls. */
  accessToken: string;
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
 */
export function configure(): void {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    scopes: [DRIVE_READONLY_SCOPE],
    offlineAccess: false,
  });
}

/**
 * Sign in interactively. Opens the Google account picker.
 * Returns AuthResult on success or throws AuthError.
 */
export async function signIn(): Promise<AuthResult> {
  configure();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    if (!isSuccessResponse(userInfo)) {
      throw { code: statusCodes.SIGN_IN_CANCELLED, message: 'Sign-in was cancelled.' };
    }
    const tokens = await GoogleSignin.getTokens();

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

    return {
      user: {
        id: userInfo.data.user.id,
        name: userInfo.data.user.name,
        email: userInfo.data.user.email,
        photo: userInfo.data.user.photo,
      },
      accessToken: tokens.accessToken,
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
 * Sign out and clear session.
 */
export async function signOut(): Promise<void> {
  configure();
  try {
    await GoogleSignin.signOut();
  } catch (error: unknown) {
    throw mapError(error);
  }
}

/**
 * Check if a user is currently signed in and return their tokens.
 * Returns null if not signed in.
 */
export async function getCurrentUser(): Promise<AuthResult | null> {
  configure();
  try {
    const userInfo = GoogleSignin.getCurrentUser();
    if (!userInfo) {
      return null;
    }
    const tokens = await GoogleSignin.getTokens();
    const idToken = userInfo.idToken;
    if (!idToken) {
      // Cannot restore session without an idToken — require fresh sign-in
      console.warn('[WinPrint][GoogleAuth] getCurrentUser: no idToken available; requiring fresh sign-in.');
      return null;
    }
    return {
      user: {
        id: userInfo.user.id,
        name: userInfo.user.name ?? null,
        email: userInfo.user.email,
        photo: userInfo.user.photo ?? null,
      },
      accessToken: tokens.accessToken,
      idToken,
    };
  } catch {
    return null;
  }
}

/**
 * Get a fresh access token for an already-signed-in user.
 * Refreshes silently if needed.
 */
export async function getAccessToken(): Promise<string | null> {
  configure();
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch {
    return null;
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
