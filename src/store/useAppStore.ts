/**
 * useAppStore.ts â€” Zustand application state
 *
 * Manages slices for Auth, Drive, CSV, PDF, Printer, Queue, and Monitoring.
 *
 * AUTH ARCHITECTURE:
 *  - Firebase Auth is the authoritative session. onAuthStateChanged drives
 *    the restoreSession lifecycle on app restart.
 *  - Google Sign-In is used only as the identity provider (sign-in flow)
 *    and to obtain fresh Drive access tokens on-demand via DriveClient.
 *  - Access tokens are NEVER stored in Zustand or AsyncStorage.
 *  - driveNeedsReauth: true signals the "Reconnect Google Drive" UI path
 *    when Drive API returns a persistent 401 after one retry.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GoogleUser } from '../services/auth/GoogleAuthService';
import * as GoogleAuthService from '../services/auth/GoogleAuthService';
import type { UserProfile, Customer } from '../services/auth/FirebaseAuthService';
import * as FirebaseAuthService from '../services/auth/FirebaseAuthService';
import * as DriveService from '../services/drive/DriveService';
import type { DriveFile } from '../services/drive/DriveClient';
import { DriveAuthError } from '../services/drive/DriveClient';
import type { Receipt } from '../models/Receipt';
import type { BusinessProfile, A4Template, ThermalTemplate } from '../models/Profile';
import { DEFAULT_BUSINESS_PROFILE, DEFAULT_A4_TEMPLATE, DEFAULT_THERMAL_TEMPLATE } from '../models/Profile';
import * as ReceiptPdfService from '../services/pdf/ReceiptPdfService';
import type {
  PrinterType,
  BluetoothDevice,
  PrintResult,
} from '../services/printer/PrinterAdapter';
import { PrinterService } from '../services/printer/PrinterService';
import * as MonitoringService from '../services/monitoring/MonitoringService';

const archiveMovesInFlight = new Set<string>();
const reprintsInFlight = new Set<string>();
let queueProcessingInFlight = false;

// ---------------------------------------------------------------------------
// Profile slice
// ---------------------------------------------------------------------------

interface ProfileState {
  businessProfile: BusinessProfile;
  a4Template: A4Template;
  thermalTemplate: ThermalTemplate;
}

interface ProfileActions {
  updateBusinessProfile: (partial: Partial<BusinessProfile>) => void;
  updateA4Template: (partial: Partial<A4Template>) => void;
  updateThermalTemplate: (partial: Partial<ThermalTemplate>) => void;
  resetProfileAndTemplates: () => void;
}

// ---------------------------------------------------------------------------
// Auth slice
// ---------------------------------------------------------------------------

/**
 * Auth state machine:
 *  restoreSessionLoading=true  â†’ AUTH_CHECKING   (show loading spinner)
 *  user !== null               â†’ AUTHENTICATED   (may show blocked screens)
 *  user === null (after check) â†’ UNAUTHENTICATED  (show sign-in screen)
 *  signInError !== null        â†’ AUTH_ERROR       (show error + retry)
 *
 * Drive state:
 *  driveNeedsReauth=false â†’ DRIVE_CONNECTED (normal operation)
 *  driveNeedsReauth=true  â†’ DRIVE_NEEDS_REAUTH (show reconnect button)
 */
interface AuthState {
  user: GoogleUser | null;
  authProfile: UserProfile | null;
  customer: Customer | null;
  /** @deprecated Access tokens are no longer stored. Use DriveClient internally. */
  accessToken: string | null;
  signInLoading: boolean;
  restoreSessionLoading: boolean;
  signInError: string | null;
}

interface AuthActions {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
  reconnectGoogleDrive: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Drive slice
// ---------------------------------------------------------------------------

interface DriveState {
  /** Selected source folder ID */
  sourceFolderId: string | null;
  /** Display name of the selected folder */
  sourceFolderName: string | null;
  /** Display path / breadcrumb of the selected source folder */
  sourceFolderPath: string | null;
  /** Whether the configured source folder is confirmed valid and accessible */
  sourceFolderValid: boolean;
  /** Selected archive folder ID */
  archiveFolderId: string | null;
  /** Display name of the archive folder */
  archiveFolderName: string | null;
  /** Display path / breadcrumb of the selected archive folder */
  archiveFolderPath: string | null;
  /** Whether the configured archive folder is confirmed valid and accessible */
  archiveFolderValid: boolean;
  /** Folders visible to the user for selection */
  folders: DriveFile[];
  /** CSV files in the selected folder */
  csvFiles: DriveFile[];
  /** CSV files in the Printed (archive) folder */
  archiveFiles: DriveFile[];
  foldersLoading: boolean;
  csvLoading: boolean;
  driveError: string | null;
  /**
   * True when a Drive API call returned a persistent 401 after one retry.
   * The UI should show a "Reconnect Google Drive" button.
   */
  driveNeedsReauth: boolean;
  /** True only after a successful Drive request in the current app session. */
  driveAccessChecked: boolean;
}

export type FolderSelection = {
  id: string;
  name: string;
  path?: string;
};

interface DriveActions {
  loadFolders: (parentId?: string) => Promise<void>;
  selectFolder: (folder: FolderSelection | DriveFile) => Promise<void>;
  selectArchiveFolder: (folder: FolderSelection | DriveFile) => void;
  loadCsvFiles: () => Promise<void>;
  loadArchiveFiles: () => Promise<void>;
  /** Refresh Incoming + Printed listings (e.g. after a successful archive). */
  refreshDriveListings: () => Promise<void>;
  validateSavedFolders: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// CSV slice
// ---------------------------------------------------------------------------

interface CsvState {
  receipts: Receipt[];
  parseLoading: boolean;
  csvError: string | null;
  lastParsedFileId: string | null;
  /** CSV currently going through the one-step Process CSV flow. */
  processingFileId: string | null;
}

interface CsvActions {
  /** Resolves true when the CSV was parsed into `receipts`, false on failure (see csvError). */
  downloadAndParse: (file: DriveFile) => Promise<boolean>;
  /** One step: download + parse + enqueue every eligible receipt. Null on failure (see csvError). */
  processCsv: (file: DriveFile) => Promise<EnqueueResult | null>;
  clearReceipts: () => void;
}

// ---------------------------------------------------------------------------
// Receipt PDF slice
// ---------------------------------------------------------------------------

interface PdfState {
  /** Local app-private paths, keyed by the receipt's transaction identity. */
  generatedPdfPaths: Record<string, string>;
  generatingReceiptIndex: number | null;
  pdfError: string | null;
}

interface PdfActions {
  generateReceiptPdf: (receiptIndex: number) => Promise<string | null>;
  clearPdfError: () => void;
}

// ---------------------------------------------------------------------------
// Printer slice
// ---------------------------------------------------------------------------

interface PrinterState {
  selectedPrinterType: PrinterType;
  selectedBluetoothDevice: BluetoothDevice | null;
  pairedDevices: BluetoothDevice[];
  devicesLoading: boolean;
  printLoading: boolean;
  printerError: string | null;
  lastPrintResult: PrintResult | null;
}

interface PrinterActions {
  setPrinterType: (type: PrinterType) => void;
  setSelectedBluetoothDevice: (device: BluetoothDevice | null) => void;
  loadPairedDevices: () => Promise<void>;
  connectBluetoothPrinter: (device: BluetoothDevice) => Promise<boolean>;
  printReceipt: (receipt: Receipt) => Promise<PrintResult>;
  testPrintCurrentPrinter: () => Promise<PrintResult>;
  clearPrinterError: () => void;
}

// ---------------------------------------------------------------------------
// Queue & Archive slice
// ---------------------------------------------------------------------------

export type PrintStatus = 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED';

export interface QueueItem {
  identity: string;
  status: PrintStatus;
  receipt: Receipt;
  queuedAt: number;
  completedAt?: number;
  error?: string;
}

export interface EnqueueResult {
  /** Receipts newly added to the print queue. */
  added: number;
  /** Receipts skipped by duplicate / already-archived protection. */
  skipped: number;
  total: number;
}

export interface CsvProgress {
  driveFileId: string;
  sourceFolderId: string;
  expectedCount: number;
  printedCount: number;
  archiveStatus: 'PENDING' | 'ARCHIVING' | 'ARCHIVED' | 'FAILED';
  archiveError?: string;
  /** When the move to the Printed folder succeeded. */
  archivedAt?: number;
}

/** Just-archived CSVs are hidden from Incoming for this long (stale Drive listing guard). */
const ARCHIVE_LISTING_GRACE_MS = 60_000;
export const INTERRUPTED_PRINT_ERROR =
  'Printing was interrupted before it was confirmed. Check whether this receipt printed, then retry if needed.';

export interface ReprintAttempt {
  identity: string;
  attemptedAt: number;
  success: boolean;
  error?: string;
}

interface QueueState {
  queue: QueueItem[];
  csvProgress: Record<string, CsvProgress>;
  reprintHistory: ReprintAttempt[];
}

interface QueueActions {
  /** Returns true if added, false if skipped by duplicate / archived protection. */
  enqueueReceipt: (receipt: Receipt) => boolean;
  /** Enqueue many receipts through enqueueReceipt and report accurate counts. */
  enqueueReceipts: (receipts: Receipt[]) => EnqueueResult;
  prepareCsvForQueue: (driveFileId: string, sourceFolderId: string, expectedCount: number) => void;
  updateQueueItemStatus: (identity: string, status: PrintStatus, error?: string) => Promise<void>;
  retryFailedPrints: () => void;
  cancelQueueItem: (identity: string) => boolean;
  retryArchive: (driveFileId: string) => Promise<void>;
  resumePendingArchives: () => Promise<void>;
  clearHistory: () => void;
  processQueue: () => Promise<void>;
  /** After a restart: receipts left in PRINTING become FAILED (retryable, never auto-reprinted). */
  recoverInterruptedPrints: () => number;
  reprintReceipt: (identity: string) => Promise<PrintResult>;
}

// ---------------------------------------------------------------------------
// Monitoring slice
// ---------------------------------------------------------------------------

export type FcmRegistrationStatus = 'unregistered' | 'registering' | 'registered' | 'error';

interface MonitoringState {
  monitoringEnabled: boolean;
  fcmToken: string | null;
  fcmRegistrationStatus: FcmRegistrationStatus;
  /** Service account email displayed to users for folder-sharing setup. */
  serviceAccountEmail: string | null;
  lastDriveNotificationAt: number | null;
  lastReconciliationAt: number | null;
  lastMonitoringError: string | null;
  /** "fileId::folderId" or "fileId::folderId::fileName" entries deferred by tapping LATER on a notification. */
  deferredFileIds: string[];
  deferredLoadingId: string | null;
  deferredError: string | null;
}

interface MonitoringActions {
  enableMonitoring: () => void;
  disableMonitoring: () => void;
  setFcmToken: (token: string) => void;
  setFcmRegistrationStatus: (status: FcmRegistrationStatus) => void;
  setServiceAccountEmail: (email: string) => void;
  recordDriveNotification: () => void;
  recordReconciliation: () => void;
  setMonitoringError: (msg: string | null) => void;
  addDeferredFileId: (entry: string) => void;
  removeDeferredFileId: (entry: string) => void;
  clearDeferredError: () => void;
  enqueueDeferredFile: (entry: string) => Promise<boolean>;
  enqueueAllDeferredFiles: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hydration slice
// ---------------------------------------------------------------------------

interface HydrationState {
  _hasHydrated: boolean;
}

interface HydrationActions {
  setHasHydrated: (hydrated: boolean) => void;
}

interface OnboardingState {
  /** Current guide step only; completion is derived from real app configuration. */
  onboardingStep: number;
}

interface OnboardingActions {
  setOnboardingStep: (step: number) => void;
}

// ---------------------------------------------------------------------------
// Combined store
// ---------------------------------------------------------------------------

type AppStore = ProfileState &
  ProfileActions &
  AuthState &
  AuthActions &
  DriveState &
  DriveActions &
  CsvState &
  CsvActions &
  PdfState &
  PdfActions &
  PrinterState &
  PrinterActions &
  QueueState &
  QueueActions &
  MonitoringState &
  MonitoringActions &
  OnboardingState &
  OnboardingActions &
  HydrationState &
  HydrationActions;


export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // â”€â”€ Profile initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      businessProfile: DEFAULT_BUSINESS_PROFILE,
      a4Template: DEFAULT_A4_TEMPLATE,
      thermalTemplate: DEFAULT_THERMAL_TEMPLATE,
      onboardingStep: 0,
      setOnboardingStep: (step: number) => set({onboardingStep: Math.max(0, Math.min(4, Math.floor(step)))}),

      // â”€â”€ Profile actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      updateBusinessProfile: (partial) => set((state) => ({
        businessProfile: { ...state.businessProfile, ...partial },
        generatedPdfPaths: {}, // Invalidate cache so preview regenerates
      })),
      updateA4Template: (partial) => set((state) => ({
        a4Template: { ...state.a4Template, ...partial },
        generatedPdfPaths: {}, // Invalidate cache so preview regenerates
      })),
      updateThermalTemplate: (partial) => set((state) => ({
        thermalTemplate: { ...state.thermalTemplate, ...partial },
      })),
      resetProfileAndTemplates: () => set({
        businessProfile: DEFAULT_BUSINESS_PROFILE,
        a4Template: DEFAULT_A4_TEMPLATE,
        thermalTemplate: DEFAULT_THERMAL_TEMPLATE,
        generatedPdfPaths: {}, // Invalidate cache so preview regenerates
      }),

      // â”€â”€ Auth initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      user: null,
      authProfile: null,
      customer: null,
      accessToken: null, // kept for compat but never populated; Drive uses on-demand tokens
      signInLoading: false,
      restoreSessionLoading: false,
      signInError: null,

      // â”€â”€ Auth actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      signIn: async () => {
        set({ signInLoading: true, signInError: null });
        try {
          // â”€â”€ STAGE 1: Configure Google Sign-In â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          // configure() must be called before signIn() so the native module
          // is fully initialized. It is idempotent.
          GoogleAuthService.configure();

          // â”€â”€ STAGE 2: Google Sign-In â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          console.log('[WinPrint][Auth] STAGE 1: Starting Google Sign-In');
          let result: import('../services/auth/GoogleAuthService').AuthResult;
          try {
            result = await GoogleAuthService.signIn();
            console.log('[WinPrint][Auth] STAGE 1 OK: Google account selected, email:', result.user.email);
            if (!result.idToken) {
              console.error('[WinPrint][Auth] ERROR: idToken is null/undefined after Google Sign-In');
              throw new Error('Google Sign-In returned no ID token. Cannot authenticate with Firebase.');
            }
          } catch (googleErr: unknown) {
            const ge = googleErr as { code?: string; message?: string };
            if (ge?.code === 'CANCELLED' || ge?.code === 'SIGN_IN_CANCELLED') {
              console.log('[WinPrint][Auth]   â†’ User cancelled account picker (not an error)');
              set({ signInLoading: false, signInError: null });
              return;
            }
            console.error('[WinPrint][Auth] STAGE 1 FAILED: Google Sign-In error, code:', ge?.code);
            throw googleErr;
          }

          // â”€â”€ STAGE 3: Firebase signInWithCredential â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          console.log('[WinPrint][Auth] STAGE 2: Firebase signInWithCredential');
          let uid: string;
          try {
            uid = await FirebaseAuthService.signInWithGoogleToken(result.idToken);
            console.log('[WinPrint][Auth] STAGE 2 OK: Firebase UID obtained (length:', uid?.length, ')');
          } catch (firebaseErr: unknown) {
            const fe = firebaseErr as { code?: string; message?: string };
            console.error('[WinPrint][Auth] STAGE 2 FAILED: Firebase credential error, code:', fe?.code);
            throw firebaseErr;
          }

          // â”€â”€ STAGE 4: Firestore user profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          console.log('[WinPrint][Auth] STAGE 3: Fetching Firestore user profile');
          let authProfile: FirebaseAuthService.UserProfile | null;
          try {
            authProfile = await FirebaseAuthService.fetchUserProfile(uid, result.user.email, result.user.name ?? undefined);
            console.log('[WinPrint][Auth] STAGE 3 OK: status:', authProfile?.status, 'role:', authProfile?.role);
          } catch (profileErr: unknown) {
            const pe = profileErr as { code?: string; message?: string };
            console.error('[WinPrint][Auth] STAGE 3 FAILED: Firestore profile fetch error, code:', pe?.code);
            throw profileErr;
          }

          // â”€â”€ STAGE 5: Customer lookup (conditional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          let customer: FirebaseAuthService.Customer | null = null;
          if (authProfile?.status === 'active' && authProfile.businessId) {
            console.log('[WinPrint][Auth] STAGE 4: Fetching customer for businessId:', authProfile.businessId);
            try {
              customer = await FirebaseAuthService.fetchCustomer(authProfile.businessId);
              console.log('[WinPrint][Auth] STAGE 4 OK: customer.status:', customer?.status);
            } catch (customerErr: unknown) {
              const ce = customerErr as { code?: string; message?: string };
              console.error('[WinPrint][Auth] STAGE 4 FAILED: Customer fetch error, code:', ce?.code);
              // Non-fatal â€” allow sign-in to complete
              console.warn('[WinPrint][Auth]   â†’ Continuing with null customer');
            }
          } else {
            console.log('[WinPrint][Auth] STAGE 4: Skipped (status:', authProfile?.status, '/ businessId:', authProfile?.businessId ?? 'none)');
          }

          console.log('[WinPrint][Auth] Sign-in SUCCESS: All stages complete');
          set({
            user: result.user,
            authProfile,
            customer,
            accessToken: null, // Not stored â€” Drive uses on-demand tokens from DriveClient
            driveNeedsReauth: false,
            driveAccessChecked: false,
            signInLoading: false,
            signInError: null,
          });

          // Automatically ensure device is registered for monitoring if Incoming folder is set
          if (get().sourceFolderId) {
            void MonitoringService.ensureRegistered();
          }
        } catch (e: unknown) {
          const err = e as { code?: string; message?: string; nativeErrorMessage?: string };
          console.error('[WinPrint][Auth] UNHANDLED ERROR in signIn()', 'code:', err?.code, 'message:', err?.message);
          set({
            signInLoading: false,
            signInError: err?.message ?? 'Sign-in failed.',
          });
        }
      },

      signOut: async () => {
        try {
          await FirebaseAuthService.signOutFirebase();
        } catch {
          // Firebase logout failure must not prevent native Google logout.
        }
        try { await GoogleAuthService.signOut(); } catch { /* best effort */ }
        MonitoringService.disconnect();
        set({
          user: null,
          authProfile: null,
          customer: null,
          accessToken: null,
          driveNeedsReauth: false,
          driveAccessChecked: false,
          // Note: Canonical folder preferences (sourceFolderId, archiveFolderId)
          // are preserved across sessions so re-signing in does not wipe them.
          folders: [],
          csvFiles: [],
          archiveFiles: [],
          receipts: [],
          lastParsedFileId: null,
          generatedPdfPaths: {},
          generatingReceiptIndex: null,
          pdfError: null,
          queue: [],
          csvProgress: {},
        });
      },

      restoreSession: async () => {
        console.log('[WinPrint][Auth] App startup: restoreSession()');
        const previouslyAuthorizedUid = get().authProfile?.uid ?? null;
        set({ restoreSessionLoading: true, signInError: null });

        // Ensure Google Sign-In native module is configured BEFORE checking
        // Firebase state, so tokens are available for Drive if needed.
        GoogleAuthService.configure();
        console.log('[WinPrint][Auth] Google Sign-In configured');

        try {
          // â”€â”€ Step 1: Check Firebase Auth state (authoritative session source) â”€â”€
          // Firebase Auth persists the session across app restarts.
          // We do NOT rely on Google Sign-In state to determine if the user
          // is logged into Firebase.
          console.log('[WinPrint][Auth] Checking Firebase Auth current user...');
          const firebaseUser = await FirebaseAuthService.waitForInitialAuthState();

          if (firebaseUser) {
            console.log('[WinPrint][Auth] Firebase user restored (uid length:', firebaseUser.uid?.length, ')');

            // â”€â”€ Step 2: Load Firestore profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            console.log('[WinPrint][Auth] Fetching Firestore profile...');
            const authProfile = await FirebaseAuthService.fetchUserProfile(
              firebaseUser.uid,
              firebaseUser.email ?? undefined,
              firebaseUser.displayName ?? undefined,
            );
            console.log('[WinPrint][Auth] Profile: status:', authProfile?.status, 'role:', authProfile?.role);

            // â”€â”€ Step 3: Restore Google user info (for display purposes) â”€â”€â”€â”€â”€
            // The Google Sign-In native layer may or may not have a cached user
            // after a cold start. We get it synchronously if available; if not,
            // we construct a GoogleUser from Firebase data. This does NOT affect
            // Drive token availability â€” DriveClient gets tokens on-demand.
            // Firebase identity is authoritative; native Google state is only
            // needed later when a Drive operation obtains its OAuth token.
            const googleUser: GoogleUser = {
              id: firebaseUser.uid,
              email: firebaseUser.email ?? '',
              name: firebaseUser.displayName ?? null,
              photo: firebaseUser.photoURL ?? null,
            };

            // â”€â”€ Step 4: Customer lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let customer: FirebaseAuthService.Customer | null = null;
            if (authProfile?.status === 'active' && authProfile.businessId) {
              try {
                customer = await FirebaseAuthService.fetchCustomer(authProfile.businessId);
                console.log('[WinPrint][Auth] Customer restored: status:', customer?.status);
              } catch (ce) {
                console.warn('[WinPrint][Auth] Customer fetch failed (non-fatal):', ce);
              }
            }

            set({
              user: googleUser,
              authProfile,
              customer,
              accessToken: null, // Never stored; Drive uses on-demand tokens
              driveNeedsReauth: previouslyAuthorizedUid && previouslyAuthorizedUid !== firebaseUser.uid
                ? false
                : get().driveNeedsReauth,
              driveAccessChecked: previouslyAuthorizedUid && previouslyAuthorizedUid !== firebaseUser.uid
                ? false
                : get().driveAccessChecked,
              signInError: null,
            });
            console.log('[WinPrint][Auth] Session restored successfully via Firebase Auth');

          } else {
            // Firebase has completed its initial restoration and confirmed
            // there is no application session. A cached Google user alone
            // must never authenticate the application.
            console.log('[WinPrint][Auth] No Firebase session found');
            set({ user: null, authProfile: null, customer: null, accessToken: null, driveNeedsReauth: false, driveAccessChecked: false });
          }
        } catch (e: unknown) {
          const err = e as { message?: string };
          console.error('[WinPrint][Auth] RESTORE FAILED:', err?.message);
          set({ signInError: err?.message ?? 'Failed to verify account.' });
        } finally {
          set({ restoreSessionLoading: false });
          console.log('[WinPrint][Auth] restoreSession() complete');
        }
      },

      reconnectGoogleDrive: async () => {
        console.log('[WinPrint][Auth] reconnectGoogleDrive()');
        set({ driveError: null });
        try {
          const firebaseEmail = get().user?.email?.toLowerCase();
          let googleUser = GoogleAuthService.getCurrentUserSync();
          if (firebaseEmail && googleUser && googleUser.email.toLowerCase() !== firebaseEmail) {
            await GoogleAuthService.signOut();
            googleUser = null;
          }
          let token = await GoogleAuthService.getValidDriveAccessToken();
          googleUser = GoogleAuthService.getCurrentUserSync();
          if (token && firebaseEmail && googleUser && googleUser.email.toLowerCase() !== firebaseEmail) {
            await GoogleAuthService.signOut();
            token = null;
          }
          if (!token) {
            const result = await GoogleAuthService.signIn();
            if (!result.idToken) throw new Error('Google Sign-In returned no ID token.');
            if (firebaseEmail && result.user.email.toLowerCase() !== firebaseEmail) {
              await GoogleAuthService.signOut();
              throw new Error('Choose the Google account associated with your signed-in app account.');
            }
            token = await GoogleAuthService.getValidDriveAccessToken();
          }
          if (!token) throw new Error('Google Drive did not return an access token.');
          set({ driveNeedsReauth: false });
          await get().validateSavedFolders();
        } catch (e: unknown) {
          const err = e as { code?: string; message?: string };
          set({
            driveNeedsReauth: true,
            driveError: 'Google Drive authorization needs attention.',
          });
          console.warn('[WinPrint][Auth] reconnectGoogleDrive failed:', err?.code, err?.message);
        }
      },

      // â”€â”€ Drive initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      sourceFolderId: null,
      sourceFolderName: null,
      sourceFolderPath: null,
      sourceFolderValid: true,
      archiveFolderId: null,
      archiveFolderName: null,
      archiveFolderPath: null,
      archiveFolderValid: true,
      folders: [],
      csvFiles: [],
      archiveFiles: [],
      foldersLoading: false,
      csvLoading: false,
      driveError: null,
      driveNeedsReauth: false,
      driveAccessChecked: false,

      // â”€â”€ Drive actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      loadFolders: async (parentId = 'root') => {
        // No accessToken check needed â€” DriveClient fetches token on-demand.
        // We still require user to be signed in.
        if (!get().user) {
          set({ driveError: 'Not signed in.' });
          return;
        }
        set({ foldersLoading: true, driveError: null, driveNeedsReauth: false });
        try {
          const folders = await DriveService.listFolders(parentId);
          set({ folders, foldersLoading: false, driveAccessChecked: true, driveNeedsReauth: false });
        } catch (e: unknown) {
          const isDriveAuthError = e instanceof DriveAuthError;
          const err = e as { message?: string };
          set({
            foldersLoading: false,
            driveError: isDriveAuthError
              ? 'Google Drive authorization needs attention.'
              : (err?.message ?? 'Failed to load folders.'),
            driveNeedsReauth: isDriveAuthError,
            driveAccessChecked: isDriveAuthError ? true : get().driveAccessChecked,
          });
        }
      },

      selectFolder: async (folder: FolderSelection | DriveFile) => {
        const folderPath = 'path' in folder && folder.path ? folder.path : folder.name;
        set({
          sourceFolderId: folder.id,
          sourceFolderName: folder.name,
          sourceFolderPath: folderPath,
          sourceFolderValid: true,
          csvFiles: [],
          receipts: [],
          lastParsedFileId: null,
          csvError: null,
          driveError: null,
          driveNeedsReauth: false,
          generatedPdfPaths: {},
          generatingReceiptIndex: null,
          pdfError: null,
        });

        // Immediately update monitoring backend with new canonical folder ID
        try {
          await MonitoringService.updateMonitoredFolder(folder.id);
        } catch (e) {
          console.warn('[WinPrint] Could not notify monitoring of folder change:', e);
        }
      },

      selectArchiveFolder: (folder: FolderSelection | DriveFile) => {
        const folderPath = 'path' in folder && folder.path ? folder.path : folder.name;
        set({
          archiveFolderId: folder.id,
          archiveFolderName: folder.name,
          archiveFolderPath: folderPath,
          archiveFolderValid: true,
        });
      },

      validateSavedFolders: async () => {
        const { sourceFolderId, archiveFolderId, sourceFolderName, archiveFolderName, user } = get();
        // Only validate if user is authenticated (Drive token available on-demand)
        if (!user) return;

        if (sourceFolderId) {
          try {
            const meta = await DriveService.getFileMetadata(sourceFolderId);
            if (meta && meta.mimeType === 'application/vnd.google-apps.folder' && !meta.trashed) {
              if (meta.name && meta.name !== sourceFolderName) {
                set({ sourceFolderName: meta.name });
              }
              set({ sourceFolderValid: true, driveAccessChecked: true, driveNeedsReauth: false });
            } else {
              set({
                sourceFolderValid: false,
                driveError: 'The selected source folder no longer exists or was moved to trash.',
              });
            }
          } catch (e: unknown) {
            if (e instanceof DriveAuthError) {
              // Don't mark folder invalid on auth error â€” token will refresh
              set({ driveNeedsReauth: true, driveAccessChecked: true });
              return;
            }
            const err = e as { status?: number; statusCode?: number };
            const status = err?.status ?? err?.statusCode;
            if (status === 404 || status === 403) {
              set({
                sourceFolderValid: false,
                driveError: 'Access to the configured source folder was revoked or it was deleted.',
              });
            } else {
              // Network/temporary error â€” keep valid
              set({ sourceFolderValid: true });
            }
          }
        }

        if (archiveFolderId) {
          try {
            const meta = await DriveService.getFileMetadata(archiveFolderId);
            if (meta && meta.mimeType === 'application/vnd.google-apps.folder' && !meta.trashed) {
              if (meta.name && meta.name !== archiveFolderName) {
                set({ archiveFolderName: meta.name });
              }
              set({ archiveFolderValid: true, driveAccessChecked: true, driveNeedsReauth: false });
            } else {
              set({ archiveFolderValid: false });
            }
          } catch (e: unknown) {
            if (e instanceof DriveAuthError) {
              set({ driveNeedsReauth: true, driveAccessChecked: true });
              return;
            }
            // Temporary network failures do not invalidate a saved folder.
            set({ archiveFolderValid: true });
          }
        }
      },

      loadCsvFiles: async () => {
        const { sourceFolderId, user } = get();
        if (!user) {
          set({ driveError: 'Not signed in.' });
          return;
        }
        if (!sourceFolderId) {
          set({ driveError: 'No folder selected.' });
          return;
        }
        set({ csvLoading: true, driveError: null, driveNeedsReauth: false });
        try {
          const listed = (await DriveService.listCsvFiles(sourceFolderId)) ?? [];
          const progress = get().csvProgress;
          // The current Drive folder decides where a file appears. Only hide a
          // CSV archived moments ago (the listing can briefly lag the move); an
          // archived CSV that was moved back to Incoming must stay visible.
          const now = Date.now();
          const csvFiles = listed.filter(f => {
            const p = progress[f.id];
            return !(p?.archiveStatus === 'ARCHIVED' && p.archivedAt !== undefined &&
              now - p.archivedAt < ARCHIVE_LISTING_GRACE_MS);
          });
          set({ csvFiles, csvLoading: false, driveAccessChecked: true, driveNeedsReauth: false });
        } catch (e: unknown) {
          const isDriveAuthError = e instanceof DriveAuthError;
          const err = e as { message?: string };
          set({
            csvLoading: false,
            driveError: isDriveAuthError
              ? 'Google Drive authorization needs attention.'
              : (err?.message ?? 'Failed to list CSV files.'),
            driveNeedsReauth: isDriveAuthError,
            driveAccessChecked: isDriveAuthError ? true : get().driveAccessChecked,
          });
        }
      },

      loadArchiveFiles: async () => {
        const { archiveFolderId, user } = get();
        if (!user || !archiveFolderId) return;
        try {
          const archiveFiles = (await DriveService.listCsvFiles(archiveFolderId)) ?? [];
          set({ archiveFiles });
        } catch (e: unknown) {
          // Non-blocking: the Completed list is informational only.
          console.warn('[WinPrint][Drive] loadArchiveFiles failed:', e instanceof Error ? e.message : String(e));
        }
      },

      refreshDriveListings: async () => {
        await Promise.all([get().loadCsvFiles(), get().loadArchiveFiles()]);
      },

      // â”€â”€ CSV initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      receipts: [],
      parseLoading: false,
      csvError: null,
      lastParsedFileId: null,
      processingFileId: null,

      // â”€â”€ CSV actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      downloadAndParse: async (file: DriveFile) => {
        const { sourceFolderId, user } = get();
        if (!user) {
          set({ csvError: 'Not signed in.' });
          return false;
        }

        // 'root' is not a valid source folder for Drive archive moves. If no
        // Incoming folder has been configured, parse the CSV so receipts can
        // be queued and printed, but skip csvProgress setup and warn the user
        // that archive will not run until the folder is configured.
        const hasValidSourceFolder = Boolean(sourceFolderId) && sourceFolderId !== 'root';
        if (!hasValidSourceFolder) {
          console.warn(
            '[WinPrint][Queue] downloadAndParse: sourceFolderId is ' +
            `"${sourceFolderId ?? 'null'}" â€” archive accounting will not be recorded. ` +
            'Configure the Incoming folder in Settings > Drive before parsing CSVs that should be archived.',
          );
        }

        console.log(
          `[WinPrint][Queue] downloadAndParse: file=${file.id} ("${file.name}"), ` +
          `sourceFolderId=${sourceFolderId ?? 'null'}, hasValidSourceFolder=${hasValidSourceFolder}`,
        );
        set({ parseLoading: true, csvError: null, driveNeedsReauth: false });
        try {
          const result = await DriveService.downloadAndParseCsv(file);

          if (hasValidSourceFolder) {
            // Record durable archive accounting only when the real Incoming folder
            // ID is known. prepareCsvForQueue also guards against 'root', so this
            // check is redundant but adds defense in depth.
            get().prepareCsvForQueue(file.id, sourceFolderId!, result.receipts.length);
            console.log(
              `[WinPrint][Queue] downloadAndParse: parsed ${result.receipts.length} receipt(s) ` +
              `from ${file.id}, csvProgress recorded with sourceFolderId=${sourceFolderId}`,
            );
          } else {
            console.warn(
              `[WinPrint][Queue] downloadAndParse: parsed ${result.receipts.length} receipt(s) ` +
              `from ${file.id} WITHOUT archive accounting (no valid Incoming folder). ` +
              'Go to Settings > Drive, set the Incoming folder, then re-parse this CSV to enable archiving.',
            );
          }

          set(() => ({
            receipts: result.receipts,
            parseLoading: false,
            lastParsedFileId: file.id,
            driveAccessChecked: true,
            driveNeedsReauth: false,
            generatedPdfPaths: {},
            pdfError: null,
            // Surfaces a non-blocking warning to the CSV/Queue screens when the
            // Incoming folder has not been configured.
            csvError: hasValidSourceFolder
              ? null
              : 'No Incoming folder configured â€” receipts queued without archive tracking. ' +
                'Set the Incoming folder in Settings > Drive to enable automatic archiving.',
          }));
          return true;
        } catch (e: unknown) {
          const isDriveAuthError = e instanceof DriveAuthError;
          const err = e as { message?: string };
          console.error(`[WinPrint][Queue] downloadAndParse failed for ${file.id}:`, err?.message);
          set({
            parseLoading: false,
            csvError: isDriveAuthError
              ? 'Google Drive authorization needs attention.'
              : (err?.message ?? 'Failed to parse CSV.'),
            driveNeedsReauth: isDriveAuthError,
            driveAccessChecked: isDriveAuthError ? true : get().driveAccessChecked,
          });
          return false;
        }
      },

      processCsv: async (file: DriveFile) => {
        if (get().processingFileId || get().parseLoading) return null;
        if (get().csvProgress[file.id]?.archiveStatus === 'ARCHIVED') {
          set({ csvError: 'This CSV was already printed and moved to the Printed folder.' });
          return null;
        }
        set({ processingFileId: file.id });
        try {
          // Reuses the existing parse (which records archive accounting and
          // archives, without reprinting, a CSV whose receipts already printed).
          if (!(await get().downloadAndParse(file))) return null;
          const { receipts } = get();
          if (receipts.length === 0) {
            set({ csvError: `No receipts were found in "${file.name}".` });
            return null;
          }
          return get().enqueueReceipts(receipts);
        } finally {
          set({ processingFileId: null });
        }
      },

      clearReceipts: () => {
        set({
          receipts: [],
          lastParsedFileId: null,
          csvError: null,
          generatedPdfPaths: {},
          generatingReceiptIndex: null,
          pdfError: null,
        });
      },

      // â”€â”€ Receipt PDF initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      generatedPdfPaths: {},
      generatingReceiptIndex: null,
      pdfError: null,

      // â”€â”€ Receipt PDF actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      generateReceiptPdf: async (receiptIndex: number) => {
        const receipt = get().receipts[receiptIndex];
        if (!receipt) {
          set({ pdfError: 'The selected parsed transaction is no longer available.' });
          return null;
        }

        set({ generatingReceiptIndex: receiptIndex, pdfError: null });
        try {
          const { businessProfile, a4Template } = get();
          const path = await ReceiptPdfService.generateReceiptPdf(receipt, businessProfile, a4Template);
          const key = receiptIdentity(receipt);
          set(state => ({
            generatedPdfPaths: { ...state.generatedPdfPaths, [key]: path },
            generatingReceiptIndex: null,
          }));
          return path;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          set({
            generatingReceiptIndex: null,
            pdfError: message || 'Failed to generate the receipt PDF.',
          });
          return null;
        }
      },

      clearPdfError: () => set({ pdfError: null }),

      // â”€â”€ Printer initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      selectedPrinterType: 'office',
      selectedBluetoothDevice: null,
      pairedDevices: [],
      devicesLoading: false,
      printLoading: false,
      printerError: null,
      lastPrintResult: null,

      // â”€â”€ Printer actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      setPrinterType: (type: PrinterType) => {
        set({ selectedPrinterType: type, printerError: null, lastPrintResult: null });
      },

      setSelectedBluetoothDevice: (device: BluetoothDevice | null) => {
        set({ selectedBluetoothDevice: device, printerError: null });
      },

      loadPairedDevices: async () => {
        set({ devicesLoading: true, printerError: null });
        try {
          const thermalAdapter = PrinterService.getThermalAdapter();
          const devices = await thermalAdapter.getBondedDevices();
          set({ pairedDevices: devices, devicesLoading: false });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          set({ devicesLoading: false, printerError: message || 'Failed to load paired Bluetooth devices.' });
        }
      },

      connectBluetoothPrinter: async (device: BluetoothDevice) => {
        set({ printLoading: true, printerError: null });
        try {
          const thermalAdapter = PrinterService.getThermalAdapter();
          await thermalAdapter.connect(device.address);
          set({ selectedBluetoothDevice: device, printLoading: false });
          return true;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          set({ printLoading: false, printerError: message || 'Failed to connect to Bluetooth printer.' });
          return false;
        }
      },

      printReceipt: async (receipt: Receipt) => {
        const { selectedPrinterType, selectedBluetoothDevice, businessProfile, a4Template, thermalTemplate } = get();
        const identity = receiptIdentity(receipt);
        console.log(
          `[WinPrint][Print] printReceipt() â€” identity: ${identity}, ` +
          `printerType: ${selectedPrinterType}, driveFileId: ${receipt.sourceFile?.driveFileId ?? 'none'}`,
        );
        set({ printLoading: true, printerError: null });
        try {
          const adapter = PrinterService.getAdapter(selectedPrinterType);
          if (selectedPrinterType === 'thermal' && selectedBluetoothDevice) {
            try {
              await adapter.connect?.(selectedBluetoothDevice.address);
            } catch {
              // Attempt print anyway
            }
          }
          const template = selectedPrinterType === 'office' ? a4Template : thermalTemplate;
          const result = await adapter.print(receipt, businessProfile, template);
          console.log(
            `[WinPrint][Print] printReceipt() result â€” identity: ${identity}, ` +
            `success: ${result.success}${result.error ? `, error: ${result.error}` : ''}`,
          );
          set({
            lastPrintResult: result,
            printerError: result.success ? null : (result.error ?? 'Print failed.'),
          });
          return result;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(`[WinPrint][Print] printReceipt() threw â€” identity: ${identity}, error: ${message}`);
          const failResult = { success: false, error: message };
          set({
            lastPrintResult: failResult,
            printerError: message,
          });
          return failResult;
        } finally {
          // Always reset printLoading so the UI button cannot get permanently stuck.
          set({ printLoading: false });
        }
      },

      testPrintCurrentPrinter: async () => {
        const { selectedPrinterType, selectedBluetoothDevice } = get();
        set({ printLoading: true, printerError: null });
        try {
          const adapter = PrinterService.getAdapter(selectedPrinterType);
          if (selectedPrinterType === 'thermal' && selectedBluetoothDevice) {
            try {
              await adapter.connect?.(selectedBluetoothDevice.address);
            } catch {
              // Attempt print anyway
            }
          }
          const result = await adapter.testPrint();
          set({
            printLoading: false,
            lastPrintResult: result,
            printerError: result.success ? null : (result.error ?? 'Test print failed.'),
          });
          return result;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          const failResult = { success: false, error: message };
          set({
            printLoading: false,
            lastPrintResult: failResult,
            printerError: message,
          });
          return failResult;
        }
      },

      clearPrinterError: () => set({ printerError: null }),

      // â”€â”€ Queue & Archive initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      queue: [],
      csvProgress: {},
      reprintHistory: [],

      // â”€â”€ Queue & Archive actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      enqueueReceipt: (receipt: Receipt) => {
        const identity = receiptIdentity(receipt);
        const { queue, csvProgress } = get();
        const srcId = receipt.sourceFile?.driveFileId;
        if (srcId && csvProgress[srcId]?.archiveStatus === 'ARCHIVED') {
          return false; // CSV already printed + archived: never re-enqueue
        }
        const existing = queue.find(q => q.identity === identity);
        if (existing && (existing.status === 'QUEUED' || existing.status === 'PRINTING' || existing.status === 'PRINTED')) {
          return false; // Duplicate protection
        }

        const newItem: QueueItem = {
          identity,
          status: 'QUEUED',
          receipt,
          queuedAt: Date.now(),
        };

        const newQueue = [...queue.filter(q => q.identity !== identity), newItem];
        if (newQueue.length > 500) {
          // Drop oldest finished entries first so waiting receipts are not lost.
          let excess = newQueue.length - 500;
          for (let i = 0; i < newQueue.length && excess > 0;) {
            if (newQueue[i].status === 'PRINTED' || newQueue[i].status === 'CANCELLED') {
              newQueue.splice(i, 1);
              excess--;
            } else {
              i++;
            }
          }
          if (excess > 0) newQueue.splice(0, excess);
        }

        set({ queue: newQueue });
        return true;
      },

      enqueueReceipts: (receipts: Receipt[]) => {
        let added = 0;
        for (const receipt of receipts) {
          if (get().enqueueReceipt(receipt)) added++;
        }
        return { added, skipped: receipts.length - added, total: receipts.length };
      },

      prepareCsvForQueue: (driveFileId: string, sourceFolderId: string, expectedCount: number) => {
        // 'root' is never a valid Incoming folder for archive moves â€” it is only a
        // Drive API shorthand and cannot be used as a removeParents source.
        const isInvalidSourceFolder = !sourceFolderId || sourceFolderId === 'root';
        if (!driveFileId || isInvalidSourceFolder || !Number.isFinite(expectedCount) || expectedCount <= 0) {
          if (driveFileId && isInvalidSourceFolder) {
            console.warn(
              `[WinPrint][Queue] prepareCsvForQueue: invalid sourceFolderId="${sourceFolderId}" for ` +
              `driveFileId=${driveFileId}. CSV progress not recorded â€” archive will not trigger. ` +
              'Configure the Incoming folder in Drive Settings before parsing CSVs.',
            );
          }
          return;
        }
        const state = get();
        const existing = state.csvProgress[driveFileId];
        const printedInQueue = state.queue.filter(
          item => item.receipt.sourceFile?.driveFileId === driveFileId && item.status === 'PRINTED',
        ).length;
        const printedCount = Math.max(existing?.printedCount ?? 0, printedInQueue);
        const archiveStatus = existing?.archiveStatus ?? 'PENDING';

        set(current => ({
          csvProgress: {
            ...current.csvProgress,
            [driveFileId]: {
              ...existing,
              driveFileId,
              sourceFolderId,
              expectedCount,
              printedCount,
              archiveStatus,
            },
          },
        }));

        // A duplicate discovery can reconstruct progress after receipts were
        // already printed. Archive that file without enqueueing or printing it again.
        if (printedCount >= expectedCount && (archiveStatus === 'PENDING' || archiveStatus === 'ARCHIVING')) {
          void get().retryArchive(driveFileId);
        }
      },

      updateQueueItemStatus: async (identity: string, status: PrintStatus, error?: string) => {
        const { queue, csvProgress } = get();
        const itemIndex = queue.findIndex(q => q.identity === identity);
        if (itemIndex === -1) {
          console.warn(`[WinPrint][Queue] updateQueueItemStatus: item not found â€” identity: ${identity}, target: ${status}`);
          return;
        }

        const item = queue[itemIndex];
        if (status === 'PRINTING' && item.status !== 'QUEUED') {
          console.warn(
            `[WinPrint][Queue] updateQueueItemStatus: PRINTING rejected (not QUEUED) â€” ` +
            `identity: ${identity}, currentStatus: ${item.status}`,
          );
          return;
        }
        if ((status === 'PRINTED' || status === 'FAILED') && item.status !== 'PRINTING') {
          console.warn(
            `[WinPrint][Queue] updateQueueItemStatus: ${status} rejected (not PRINTING) â€” ` +
            `identity: ${identity}, currentStatus: ${item.status}`,
          );
          return;
        }
        if (status === 'CANCELLED') {
          // Cancellation must go through cancelQueueItem() for atomicity.
          return;
        }

        console.log(
          `[WinPrint][Queue] updateQueueItemStatus: ${item.status} â†’ ${status} â€” identity: ${identity}` +
          (error ? ` (error: ${error})` : ''),
        );

        const updatedItem = {
          ...item,
          status,
          error,
          completedAt: (status === 'PRINTED' || status === 'FAILED') ? Date.now() : item.completedAt
        };

        let newQueue = [...queue];
        newQueue[itemIndex] = updatedItem;

        const newCsvProgress = { ...csvProgress };
        let archiveFileId: string | null = null;

        if (status === 'PRINTED' && item.status !== 'PRINTED') {
          const driveFileId = item.receipt.sourceFile?.driveFileId;
          if (driveFileId) {
            const prog = newCsvProgress[driveFileId];
            if (prog) {
              const newPrintedCount = prog.printedCount + 1;
              newCsvProgress[driveFileId] = {
                ...prog,
                printedCount: newPrintedCount,
              };
              console.log(
                `[WinPrint][Queue] CSV progress â€” driveFileId: ${driveFileId}, ` +
                `printedCount: ${newPrintedCount}/${prog.expectedCount}, ` +
                `archiveStatus: ${prog.archiveStatus}, sourceFolderId: ${prog.sourceFolderId}`,
              );

              if (newPrintedCount >= prog.expectedCount && prog.archiveStatus === 'PENDING') {
                // Persist successful print accounting before performing the
                // network move, so an app restart can safely resume archiving.
                newCsvProgress[driveFileId].archiveStatus = 'ARCHIVING';
                archiveFileId = driveFileId;
                console.log(
                  `[WinPrint][Queue] All ${newPrintedCount} receipt(s) printed â€” ` +
                  `scheduling archive for driveFileId: ${driveFileId}`,
                );
              }
            } else {
              console.warn(
                `[WinPrint][Queue] PRINTED but no csvProgress entry for driveFileId: ${driveFileId} ` +
                `(identity: ${identity}). Archive will not trigger. ` +
                'Ensure prepareCsvForQueue() was called before enqueueReceipt().',
              );
            }
          } else {
            console.warn(
              `[WinPrint][Queue] PRINTED but receipt has no driveFileId (identity: ${identity}). ` +
              'Archive will not trigger â€” source file cannot be located.',
            );
          }
        }

        set({ queue: newQueue, csvProgress: newCsvProgress });
        if (archiveFileId) await get().retryArchive(archiveFileId);
      },

      retryFailedPrints: () => {
        const { queue } = get();
        const newQueue = queue.map(q => q.status === 'FAILED' ? { ...q, status: 'QUEUED' as PrintStatus, error: undefined } : q);
        set({ queue: newQueue });
      },

      cancelQueueItem: (identity: string) => {
        let cancelled = false;
        set(state => {
          const itemIndex = state.queue.findIndex(item => item.identity === identity);
          if (itemIndex < 0 || state.queue[itemIndex].status !== 'QUEUED') return state;
          const queue = [...state.queue];
          queue[itemIndex] = {
            ...queue[itemIndex],
            status: 'CANCELLED',
            completedAt: Date.now(),
            error: undefined,
          };
          cancelled = true;
          return {queue};
        });
        return cancelled;
      },
      retryArchive: async (driveFileId: string) => {
        const { csvProgress, archiveFolderId, user } = get();
        const prog = csvProgress[driveFileId];

        console.log(
          `[WinPrint][Archive] retryArchive() â€” driveFileId: ${driveFileId}, ` +
          `archiveStatus: ${prog?.archiveStatus ?? 'NO_ENTRY'}, ` +
          `printedCount: ${prog?.printedCount ?? 0}/${prog?.expectedCount ?? 0}, ` +
          `sourceFolderId: ${prog?.sourceFolderId ?? 'null'}, ` +
          `archiveFolderId: ${archiveFolderId ?? 'null (NOT CONFIGURED)'}`,
        );

        if (!prog || prog.archiveStatus === 'ARCHIVED' || prog.printedCount < prog.expectedCount) {
          console.log(`[WinPrint][Archive] retryArchive: not ready â€” skipping ${driveFileId}`);
          return;
        }
        if (prog.archiveStatus !== 'FAILED' && prog.archiveStatus !== 'ARCHIVING' && prog.archiveStatus !== 'PENDING') {
          console.log(`[WinPrint][Archive] retryArchive: archiveStatus=${prog.archiveStatus} â€” skipping ${driveFileId}`);
          return;
        }
        if (archiveMovesInFlight.has(driveFileId)) {
          console.log(`[WinPrint][Archive] retryArchive: already in flight â€” ${driveFileId}`);
          return;
        }

        if (!user) {
          const archiveError = 'Sign in again to archive this printed CSV.';
          console.warn(`[WinPrint][Archive] No user â€” archiveStatus set to FAILED for ${driveFileId}`);
          set(state => ({
            csvProgress: {
              ...state.csvProgress,
              [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'FAILED', archiveError },
            }
          }));
          return;
        }

        if (!archiveFolderId) {
          const archiveError = 'Select a Printed/archive folder in Drive settings, then retry the archive.';
          console.warn(
            `[WinPrint][Archive] archiveFolderId is null â€” cannot move ${driveFileId}. ` +
            'Set the archive folder in Settings > Drive, then tap Retry Archive.',
          );
          set(state => ({
            csvProgress: {
              ...state.csvProgress,
              [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'FAILED', archiveError },
            }
          }));
          return;
        }

        // 'root' and '' are both invalid source folders â€” 'root' is a Drive API
        // alias that cannot be used as a removeParents parameter; it would not
        // match the file's real parent, silently leaving the file un-moved.
        const isInvalidSource = !prog.sourceFolderId || prog.sourceFolderId === 'root';
        if (isInvalidSource) {
          const archiveError =
            'Cannot archive: the Incoming folder ID was not recorded when this CSV was parsed. ' +
            'Go to Settings > Drive, configure the Incoming folder, then re-parse the CSV.';
          console.warn(
            `[WinPrint][Archive] sourceFolderId="${prog.sourceFolderId}" is invalid for driveFileId: ${driveFileId}. ` +
            'Archive aborted â€” "root" and "" are not valid removeParents values for a Drive PATCH move.',
          );
          set(state => ({
            csvProgress: {
              ...state.csvProgress,
              [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'FAILED', archiveError },
            }
          }));
          return;
        }

        archiveMovesInFlight.add(driveFileId);
        set(state => ({
          csvProgress: {
            ...state.csvProgress,
            [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'ARCHIVING', archiveError: undefined }
          }
        }));

        console.log(
          `[WinPrint][Archive] Drive PATCH move â€” driveFileId: ${driveFileId}, ` +
          `from: ${prog.sourceFolderId} â†’ to: ${archiveFolderId}`,
        );

        try {
          await DriveService.moveFile(driveFileId, prog.sourceFolderId, archiveFolderId);
          console.log(`[WinPrint][Archive] Move succeeded â€” ${driveFileId} confirmed in Printed folder`);
          set(state => ({
            driveAccessChecked: true,
            driveNeedsReauth: false,
            csvProgress: {
              ...state.csvProgress,
              [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'ARCHIVED', archiveError: undefined, archivedAt: Date.now() }
            },
            // Completed: drop the CSV and its parsed receipts from active sections.
            // Printed history (queue) is kept for History and Reprint.
            csvFiles: state.csvFiles.filter(f => f.id !== driveFileId),
            ...(state.lastParsedFileId === driveFileId
              ? { receipts: [], lastParsedFileId: null, generatedPdfPaths: {}, pdfError: null }
              : {}),
          }));
          void get().refreshDriveListings();
        } catch (e: unknown) {
          const isDriveAuthError = e instanceof DriveAuthError;
          const msg = isDriveAuthError
            ? 'Archive failed: Google Drive authorization needs attention.'
            : (e instanceof Error ? e.message : String(e));
          console.error(
            `[WinPrint][Archive] Move FAILED â€” driveFileId: ${driveFileId}, ` +
            `error: ${msg}, isDriveAuthError: ${isDriveAuthError}`,
          );
          set(state => ({
            csvProgress: {
              ...state.csvProgress,
              [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'FAILED', archiveError: msg }
            },
            driveNeedsReauth: isDriveAuthError ? true : state.driveNeedsReauth,
            driveAccessChecked: isDriveAuthError ? true : state.driveAccessChecked,
          }));
        } finally {
          archiveMovesInFlight.delete(driveFileId);
        }
      },

      resumePendingArchives: async () => {
        const state = get();
        if (!state.user) return;
        const pending = Object.values(state.csvProgress).filter(progress =>
          progress.printedCount >= progress.expectedCount &&
          (progress.archiveStatus === 'ARCHIVING' || progress.archiveStatus === 'PENDING'),
        );
        for (const progress of pending) {
          await get().retryArchive(progress.driveFileId);
        }
      },

      clearHistory: () => {
        set({ queue: [], csvProgress: {}, reprintHistory: [] });
      },

      processQueue: async () => {
        if (queueProcessingInFlight) {
          console.log('[WinPrint][Queue] processQueue: already in flight, skipping');
          return;
        }
        queueProcessingInFlight = true;
        console.log('[WinPrint][Queue] processQueue: started');
        try {
          while (true) {
            const {queue, printReceipt, updateQueueItemStatus} = get();
            const nextItem = queue.find(item => item.status === 'QUEUED');
            if (!nextItem) {
              console.log('[WinPrint][Queue] processQueue: no QUEUED items remain, done');
              break;
            }

            console.log(
              `[WinPrint][Queue] processQueue: claiming item â€” identity: ${nextItem.identity}, ` +
              `driveFileId: ${nextItem.receipt.sourceFile?.driveFileId ?? 'none'}`,
            );

            // Atomically claim the item as PRINTING so a concurrent cancel
            // cannot race and start a second print of the same item.
            await updateQueueItemStatus(nextItem.identity, 'PRINTING');

            // Verify the transition succeeded. If not (item was concurrently cancelled),
            // skip it and look for the next QUEUED item.
            const claimedItem = get().queue.find(item => item.identity === nextItem.identity);
            if (claimedItem?.status !== 'PRINTING') {
              console.warn(
                `[WinPrint][Queue] processQueue: item ${nextItem.identity} was not claimed as PRINTING ` +
                `(current status: ${claimedItem?.status ?? 'not found'}), skipping`,
              );
              continue;
            }

            let result: PrintResult;
            try {
              result = await printReceipt(nextItem.receipt);
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              console.error(`[WinPrint][Queue] processQueue: printReceipt threw â€” ${nextItem.identity}: ${msg}`);
              result = {success: false, error: msg};
            }

            console.log(
              `[WinPrint][Queue] processQueue: print result â€” identity: ${nextItem.identity}, ` +
              `success: ${result.success}${result.error ? `, error: ${result.error}` : ''}`,
            );

            if (result.success) {
              await updateQueueItemStatus(nextItem.identity, 'PRINTED');
            } else {
              await updateQueueItemStatus(nextItem.identity, 'FAILED', result.error);
            }
          }
        } finally {
          queueProcessingInFlight = false;
          console.log('[WinPrint][Queue] processQueue: finished (flag released)');
        }
      },

      recoverInterruptedPrints: () => {
        // Only valid when nothing is printing in this app session.
        if (queueProcessingInFlight || get().printLoading) return 0;
        let recovered = 0;
        set(state => {
          const queue = state.queue.map(item => {
            if (item.status !== 'PRINTING') return item;
            recovered++;
            return { ...item, status: 'FAILED' as PrintStatus, error: INTERRUPTED_PRINT_ERROR, completedAt: Date.now() };
          });
          return recovered > 0 ? { queue } : state;
        });
        if (recovered > 0) {
          console.warn(`[WinPrint][Queue] recoverInterruptedPrints: ${recovered} interrupted receipt(s) marked FAILED`);
        }
        return recovered;
      },

      reprintReceipt: async (identity: string) => {
        const item = get().queue.find(entry => entry.identity === identity && entry.status === 'PRINTED');
        if (!item) return { success: false, error: 'This printed receipt is no longer available in history.' };
        if (reprintsInFlight.has(identity)) return { success: false, error: 'This receipt is already being reprinted.' };
        if (reprintsInFlight.size > 0 || get().printLoading || get().queue.some(entry => entry.status === 'PRINTING')) {
          return { success: false, error: 'The selected printer is busy. Try again when the current print finishes.' };
        }
        const receipt = item.receipt;
        if (!receipt.transactionNumber || !receipt.items?.length || !receipt.sourceRows?.length) {
          return { success: false, error: 'Saved receipt data is incomplete. Reprocess the original CSV before reprinting.' };
        }
        reprintsInFlight.add(identity);
        try {
          // Reprint uses the saved receipt directly. It does not enqueue a new
          // business transaction or change original print/archive accounting.
          const result = await get().printReceipt(receipt);
          set(state => ({
            reprintHistory: [...state.reprintHistory, {
              identity,
              attemptedAt: Date.now(),
              success: result.success,
              ...(result.error ? { error: result.error } : {}),
            }].slice(-500),
          }));
          return result;
        } finally {
          reprintsInFlight.delete(identity);
        }
      },

      // â”€â”€ Monitoring initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      monitoringEnabled: false,
      fcmToken: null,
      fcmRegistrationStatus: 'unregistered',
      serviceAccountEmail: null,
      lastDriveNotificationAt: null,
      lastReconciliationAt: null,
      lastMonitoringError: null,
      deferredFileIds: [],
      deferredLoadingId: null,
      deferredError: null,

      // â”€â”€ Monitoring actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      enableMonitoring: () => set({ monitoringEnabled: true }),
      disableMonitoring: () => set({ monitoringEnabled: false }),

      setFcmToken: (token: string) => set({ fcmToken: token }),

      setFcmRegistrationStatus: (status: FcmRegistrationStatus) =>
        set({ fcmRegistrationStatus: status }),

      setServiceAccountEmail: (email: string) => set({ serviceAccountEmail: email }),

      recordDriveNotification: () => set({ lastDriveNotificationAt: Date.now() }),

      recordReconciliation: () => set({ lastReconciliationAt: Date.now() }),

      setMonitoringError: (msg: string | null) => set({ lastMonitoringError: msg }),

      clearDeferredError: () => set({ deferredError: null }),

      addDeferredFileId: (entry: string) =>
        set(state => {
          const fileId = entry.split('::')[0];
          const existingIndex = state.deferredFileIds.findIndex(
            id => id === entry || id.split('::')[0] === fileId,
          );
          if (existingIndex >= 0) {
            const existingEntry = state.deferredFileIds[existingIndex];
            // If the incoming entry contains more detail (e.g. fileName), upgrade it
            if (entry.length > existingEntry.length) {
              const updated = [...state.deferredFileIds];
              updated[existingIndex] = entry;
              return { deferredFileIds: updated };
            }
            return state;
          }
          return { deferredFileIds: [...state.deferredFileIds, entry] };
        }),

      removeDeferredFileId: (entry: string) =>
        set(state => {
          const fileId = entry.split('::')[0];
          return {
            deferredFileIds: state.deferredFileIds.filter(
              id => id !== entry && id.split('::')[0] !== fileId,
            ),
          };
        }),

      enqueueDeferredFile: async (entry: string): Promise<boolean> => {
        const { sourceFolderId, removeDeferredFileId, user } = get();
        if (!user) {
          set({ deferredError: 'Cannot enqueue deferred file: Not signed in.' });
          return false;
        }

        const parts = entry.split('::');
        const fileId = parts[0];
        // parts[1] is the Incoming folder ID embedded in the FCM notification entry.
        // Fall back to the configured sourceFolderId only if the entry is legacy
        // (no embedded folder). Never use 'root' â€” it is not a valid archive source.
        const embeddedFolderId = parts[1] && parts[1] !== 'root' ? parts[1] : null;
        const folderId = embeddedFolderId || (sourceFolderId && sourceFolderId !== 'root' ? sourceFolderId : null);
        const fileName = parts[2];

        if (!fileId) {
          set({ deferredError: 'Invalid deferred file entry.' });
          return false;
        }

        if (!folderId) {
          console.warn(
            `[WinPrint][Queue] enqueueDeferredFile: no valid Incoming folder ID for entry "${entry}". ` +
            'Receipts will be queued but archive will not run. ' +
            'Configure the Incoming folder in Settings > Drive.',
          );
          // Proceed with enqueue so printing is not blocked, but warn.
          // prepareCsvForQueue will also guard against missing/root folderId.
        }

        set({ deferredLoadingId: entry, deferredError: null, driveNeedsReauth: false });
        try {
          // Direct file metadata lookup using fileId
          // Drive token obtained on-demand inside DriveClient
          let targetFile: DriveFile | undefined;
          try {
            targetFile = await DriveService.getFileMetadata(fileId);
          } catch (_) {
            // direct metadata fetch failed, try listing folder
          }

          if (!targetFile && folderId) {
            try {
              const csvFiles = await DriveService.listCsvFiles(folderId);
              targetFile = csvFiles.find(f => f.id === fileId);
            } catch (_) {
              // listing folder failed
            }
          }

          if (!targetFile) {
            targetFile = {
              id: fileId,
              name: fileName || `Winsoft Bill (${fileId.slice(0, 8)})`,
              mimeType: 'text/csv',
            };
          }

          // Download and parse CSV using existing Drive service pipeline
          const { receipts } = await DriveService.downloadAndParseCsv(targetFile);

          if (!receipts || receipts.length === 0) {
            throw new Error('The CSV contains no valid receipts.');
          }

          // prepareCsvForQueue guards against null/empty/root folderId internally.
          // Pass folderId ?? '' so TypeScript is satisfied; the guard rejects empty strings quietly.
          get().prepareCsvForQueue(fileId, folderId ?? '', receipts.length);
          const { added } = get().enqueueReceipts(receipts);

          // Successfully enqueued â€” remove from deferred list
          set({ driveAccessChecked: true, driveNeedsReauth: false });
          removeDeferredFileId(entry);
          set({
            deferredLoadingId: null,
            // Nothing was queued: say so instead of silently dropping the card.
            deferredError: added === 0
              ? `"${targetFile.name}" was already printed or is already in the queue. Nothing was added. ` +
                'To print a copy, use History > Reprint.'
              : null,
          });
          return true;
        } catch (e: unknown) {
          const isDriveAuthError = e instanceof DriveAuthError;
          const msg = isDriveAuthError
            ? 'Google Drive authorization needs attention.'
            : (e instanceof Error ? e.message : String(e));
          set({
            deferredLoadingId: null,
            deferredError: `Failed to enqueue "${fileName || fileId}": ${msg}`,
            driveNeedsReauth: isDriveAuthError,
            driveAccessChecked: isDriveAuthError ? true : get().driveAccessChecked,
          });
          return false;
        }
      },

      enqueueAllDeferredFiles: async (): Promise<void> => {
        const { deferredFileIds, enqueueDeferredFile } = get();
        for (const entry of [...deferredFileIds]) {
          await enqueueDeferredFile(entry);
        }
      },

      // â”€â”€ Hydration initial state & actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      _hasHydrated: false,
      setHasHydrated: (val: boolean) => set({ _hasHydrated: val }),
    }),
    {
      name: 'winprint-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Canonical Folder Configuration
        sourceFolderId: state.sourceFolderId,
        sourceFolderName: state.sourceFolderName,
        sourceFolderPath: state.sourceFolderPath,
        archiveFolderId: state.archiveFolderId,
        archiveFolderName: state.archiveFolderName,
        archiveFolderPath: state.archiveFolderPath,

        // Queue and processing
        queue: state.queue,
        csvProgress: state.csvProgress,
        reprintHistory: state.reprintHistory,

        // Monitoring state persisted across restarts
        monitoringEnabled: state.monitoringEnabled,
        fcmToken: state.fcmToken,
        fcmRegistrationStatus: state.fcmRegistrationStatus,
        serviceAccountEmail: state.serviceAccountEmail,
        lastDriveNotificationAt: state.lastDriveNotificationAt,
        lastReconciliationAt: state.lastReconciliationAt,
        lastMonitoringError: state.lastMonitoringError,
        deferredFileIds: state.deferredFileIds,

        // Onboarding position is resumable; step completion is always derived
        // from the real folder, profile, printer, and authorization state.
        onboardingStep: state.onboardingStep,
      }),
      onRehydrateStorage: () => (state) => {
        // A print cannot survive an app restart: a persisted PRINTING item
        // would otherwise be stuck forever (never printed, retried or cancelled).
        state?.recoverInterruptedPrints();
        state?.setHasHydrated(true);
      },
    }
  )
);

export function receiptIdentity(receipt: Receipt): string {
  return `${receipt.sourceFile?.driveFileId ?? 'local'}::${receipt.transactionType}::${receipt.transactionNumber}`;
}
