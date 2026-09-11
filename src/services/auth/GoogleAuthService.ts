/**
 * GoogleAuthService.ts — Google Sign-In wrapper
 *
 * Wraps @react-native-google-signin/google-signin.
 *
 * SETUP REQUIRED (you must perform this manually):
 *
 *  1. Go to https://console.cloud.google.com/
 *  2. Create a new project (or select existing).
 *  3. Enable "Google Drive API".
 *  4. Configure OAuth consent screen:
 *       - User Type: External
 *       - Add scope: https://www.googleapis.com/auth/drive.readonly
 *  5. Create an Android OAuth 2.0 Client ID:
 *       - Application type: Android
 *       - Package name: com.winsoftprintstation
 *       - SHA-1 certificate fingerprint: run in project root:
 *           cd android && .\gradlew signingReport
 *         Copy the SHA1 under ":app > Variant: debug > Store: ~/.android/debug.keystore"
 *  6. Create a Web OAuth 2.0 Client ID:
 *       - Application type: Web application
 *       - Copy the Client ID (looks like: XXXXXXX.apps.googleusercontent.com)
 *  7. Replace the WEB_CLIENT_ID placeholder below with your Web Client ID.
 *
 * NOTE: google-services.json is NOT required (we are not using Firebase).
 *       The Android Client ID is registered only for SHA-1 verification.
 *       The Web Client ID is what we pass to GoogleSignin.configure().
 */

import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

// ---------------------------------------------------------------------------
// TODO: Replace with your Web Client ID from Google Cloud Console
// ---------------------------------------------------------------------------
const WEB_CLIENT_ID = '856705756174-hlaortv29fn08r57r8kh7goh3v0f1s10.apps.googleusercontent.com';

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
}

export interface AuthError {
  code: string;
  message: string;
}

let _configured = false;

function ensureConfigured(): void {
  if (_configured) {
    return;
  }
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
 */
export async function signIn(): Promise<AuthResult> {
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    if (!isSuccessResponse(userInfo)) {
      throw {code: statusCodes.SIGN_IN_CANCELLED, message: 'Sign-in was cancelled.'};
    }
    const tokens = await GoogleSignin.getTokens();

    return {
      user: {
        id: userInfo.data.user.id,
        name: userInfo.data.user.name,
        email: userInfo.data.user.email,
        photo: userInfo.data.user.photo,
      },
      accessToken: tokens.accessToken,
    };
  } catch (error: unknown) {
    throw mapError(error);
  }
}

/**
 * Sign out and clear session.
 */
export async function signOut(): Promise<void> {
  ensureConfigured();
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
  ensureConfigured();
  try {
    const userInfo = GoogleSignin.getCurrentUser();
    if (!userInfo) {
      return null;
    }
    const tokens = await GoogleSignin.getTokens();
    return {
      user: {
        id: userInfo.user.id,
        name: userInfo.user.name ?? null,
        email: userInfo.user.email,
        photo: userInfo.user.photo ?? null,
      },
      accessToken: tokens.accessToken,
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
  ensureConfigured();
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
        return { code: 'CANCELLED', message: 'Sign-in was cancelled by the user.' };
      case statusCodes.IN_PROGRESS:
        return { code: 'IN_PROGRESS', message: 'Sign-in is already in progress.' };
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return {
          code: 'PLAY_SERVICES_UNAVAILABLE',
          message: 'Google Play Services is not available or needs updating.',
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
