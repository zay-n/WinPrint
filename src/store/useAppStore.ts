/**
 * useAppStore.ts — Zustand application state
 *
 * Manages slices for Auth, Drive, CSV, PDF, Printer, Queue, and Monitoring.
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {GoogleUser, AuthResult} from '../services/auth/GoogleAuthService';
import * as GoogleAuthService from '../services/auth/GoogleAuthService';
import type {UserProfile, Customer} from '../services/auth/FirebaseAuthService';
import * as FirebaseAuthService from '../services/auth/FirebaseAuthService';
import * as DriveService from '../services/drive/DriveService';
import type {DriveFile} from '../services/drive/DriveClient';
import type {Receipt} from '../models/Receipt';
import type {BusinessProfile, A4Template, ThermalTemplate} from '../models/Profile';
import {DEFAULT_BUSINESS_PROFILE, DEFAULT_A4_TEMPLATE, DEFAULT_THERMAL_TEMPLATE} from '../models/Profile';
import * as ReceiptPdfService from '../services/pdf/ReceiptPdfService';
import type {
  PrinterType,
  BluetoothDevice,
  PrintResult,
} from '../services/printer/PrinterAdapter';
import {PrinterService} from '../services/printer/PrinterService';
import * as MonitoringService from '../services/monitoring/MonitoringService';

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

interface AuthState {
  user: GoogleUser | null;
  authProfile: UserProfile | null;
  customer: Customer | null;
  accessToken: string | null;
  signInLoading: boolean;
  restoreSessionLoading: boolean;
  signInError: string | null;
}

interface AuthActions {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
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
  foldersLoading: boolean;
  csvLoading: boolean;
  driveError: string | null;
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
}

interface CsvActions {
  downloadAndParse: (file: DriveFile) => Promise<void>;
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

export type PrintStatus = 'QUEUED' | 'PRINTING' | 'PRINTED' | 'FAILED';

export interface QueueItem {
  identity: string;
  status: PrintStatus;
  receipt: Receipt;
  queuedAt: number;
  completedAt?: number;
  error?: string;
}

export interface CsvProgress {
  driveFileId: string;
  sourceFolderId: string;
  expectedCount: number;
  printedCount: number;
  archiveStatus: 'PENDING' | 'ARCHIVED' | 'FAILED';
  archiveError?: string;
}

interface QueueState {
  queue: QueueItem[];
  csvProgress: Record<string, CsvProgress>;
}

interface QueueActions {
  enqueueReceipt: (receipt: Receipt) => void;
  updateQueueItemStatus: (identity: string, status: PrintStatus, error?: string) => Promise<void>;
  retryFailedPrints: () => void;
  retryArchive: (driveFileId: string) => Promise<void>;
  clearHistory: () => void;
  processQueue: () => Promise<void>;
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
  HydrationState &
  HydrationActions;


export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Profile initial state ───────────────────────────────────────────────
      businessProfile: DEFAULT_BUSINESS_PROFILE,
      a4Template: DEFAULT_A4_TEMPLATE,
      thermalTemplate: DEFAULT_THERMAL_TEMPLATE,

      // ── Profile actions ─────────────────────────────────────────────────────
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

      // ── Auth initial state ──────────────────────────────────────────────────
      user: null,
      authProfile: null,
      customer: null,
      accessToken: null,
      signInLoading: false,
      restoreSessionLoading: false,
      signInError: null,

      // ── Auth actions ────────────────────────────────────────────────────────

      signIn: async () => {
        set({signInLoading: true, signInError: null});
        try {
          // ── STAGE 1: Google Sign-In ────────────────────────────────────────
          console.log('[WinPrint][SignIn] STAGE 1: Starting Google Sign-In');
          let result: AuthResult;
          try {
            result = await GoogleAuthService.signIn();
            console.log('[WinPrint][SignIn] STAGE 1 OK: Google account selected');
            console.log('[WinPrint][SignIn]   user.email:', result.user.email);
            console.log('[WinPrint][SignIn]   has idToken:', !!result.idToken);
            console.log('[WinPrint][SignIn]   has accessToken:', !!result.accessToken);
            if (!result.idToken) {
              console.error('[WinPrint][SignIn] ERROR: idToken is null/undefined after Google Sign-In');
              throw new Error('Google Sign-In returned no ID token. Cannot authenticate with Firebase.');
            }
          } catch (googleErr: unknown) {
            const ge = googleErr as {code?: string; message?: string};
            console.error('[WinPrint][SignIn] STAGE 1 FAILED: Google Sign-In error');
            console.error('[WinPrint][SignIn]   code:', ge?.code);
            console.error('[WinPrint][SignIn]   message:', ge?.message);
            // Don't log further if cancelled (expected user action)
            if (ge?.code === 'CANCELLED' || ge?.code === 'SIGN_IN_CANCELLED') {
              console.log('[WinPrint][SignIn]   → User cancelled account picker (not an error)');
              set({signInLoading: false, signInError: null});
              return;
            }
            throw googleErr;
          }

          // ── STAGE 2: Firebase signInWithCredential ─────────────────────────
          console.log('[WinPrint][SignIn] STAGE 2: Firebase signInWithCredential');
          let uid: string;
          try {
            uid = await FirebaseAuthService.signInWithGoogleToken(result.idToken);
            console.log('[WinPrint][SignIn] STAGE 2 OK: Firebase UID obtained');
            console.log('[WinPrint][SignIn]   uid length:', uid?.length);
          } catch (firebaseErr: unknown) {
            const fe = firebaseErr as {code?: string; message?: string; nativeErrorMessage?: string};
            console.error('[WinPrint][SignIn] STAGE 2 FAILED: Firebase credential error');
            console.error('[WinPrint][SignIn]   code:', fe?.code);
            console.error('[WinPrint][SignIn]   message:', fe?.message);
            console.error('[WinPrint][SignIn]   nativeErrorMessage:', fe?.nativeErrorMessage);
            throw firebaseErr;
          }

          // ── STAGE 3: Firestore user profile ───────────────────────────────
          console.log('[WinPrint][SignIn] STAGE 3: Fetching Firestore user profile');
          let authProfile: FirebaseAuthService.UserProfile | null;
          try {
            authProfile = await FirebaseAuthService.fetchUserProfile(uid, result.user.email, result.user.name ?? undefined);
            console.log('[WinPrint][SignIn] STAGE 3 OK');
            console.log('[WinPrint][SignIn]   status:', authProfile?.status);
            console.log('[WinPrint][SignIn]   role:', authProfile?.role);
            console.log('[WinPrint][SignIn]   businessId:', authProfile?.businessId ?? '(none)');
          } catch (profileErr: unknown) {
            const pe = profileErr as {code?: string; message?: string};
            console.error('[WinPrint][SignIn] STAGE 3 FAILED: Firestore profile fetch error');
            console.error('[WinPrint][SignIn]   code:', pe?.code);
            console.error('[WinPrint][SignIn]   message:', pe?.message);
            throw profileErr;
          }

          // ── STAGE 4: Customer lookup (conditional) ─────────────────────────
          let customer: FirebaseAuthService.Customer | null = null;
          if (authProfile?.status === 'active' && authProfile.businessId) {
            console.log('[WinPrint][SignIn] STAGE 4: Fetching customer for businessId:', authProfile.businessId);
            try {
              customer = await FirebaseAuthService.fetchCustomer(authProfile.businessId);
              console.log('[WinPrint][SignIn] STAGE 4 OK: customer.status:', customer?.status);
            } catch (customerErr: unknown) {
              const ce = customerErr as {code?: string; message?: string};
              console.error('[WinPrint][SignIn] STAGE 4 FAILED: Customer fetch error');
              console.error('[WinPrint][SignIn]   code:', ce?.code);
              console.error('[WinPrint][SignIn]   message:', ce?.message);
              // Non-fatal — allow sign-in to complete, user will see businessPending or businessSuspended state
              console.warn('[WinPrint][SignIn]   → Continuing with null customer');
            }
          } else {
            console.log('[WinPrint][SignIn] STAGE 4: Skipped (status:', authProfile?.status, '/ businessId:', authProfile?.businessId ?? 'none)');
          }

          console.log('[WinPrint][SignIn] SUCCESS: All stages complete');
          set({
            user: result.user,
            authProfile,
            customer,
            accessToken: result.accessToken,
            signInLoading: false,
            signInError: null,
          });

          // Automatically ensure device is registered for monitoring if Incoming folder is set
          if (get().sourceFolderId) {
            void MonitoringService.ensureRegistered();
          }
        } catch (e: unknown) {
          const err = e as {code?: string; message?: string; nativeErrorMessage?: string};
          console.error('[WinPrint][SignIn] UNHANDLED ERROR in signIn()');
          console.error('[WinPrint][SignIn]   code:', err?.code);
          console.error('[WinPrint][SignIn]   message:', err?.message);
          console.error('[WinPrint][SignIn]   nativeErrorMessage:', err?.nativeErrorMessage);
          set({
            signInLoading: false,
            signInError: err?.message ?? 'Sign-in failed.',
          });
        }
      },

      signOut: async () => {
        try {
          await FirebaseAuthService.signOutFirebase();
          await GoogleAuthService.signOut();
        } catch {
          // Best effort — clear state regardless
        }
        MonitoringService.disconnect();
        set({
          user: null,
          authProfile: null,
          customer: null,
          accessToken: null,
          // Note: Canonical folder preferences (sourceFolderId, archiveFolderId)
          // are preserved across sessions so re-signing in does not wipe them.
          folders: [],
          csvFiles: [],
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
        set({restoreSessionLoading: true, signInError: null});
        try {
          const result = await GoogleAuthService.getCurrentUser();
          if (result) {
            const uid = await FirebaseAuthService.signInWithGoogleToken(result.idToken);
            const authProfile = await FirebaseAuthService.fetchUserProfile(uid, result.user.email, result.user.name ?? undefined);
            let customer: FirebaseAuthService.Customer | null = null;
            if (authProfile?.status === 'active' && authProfile.businessId) {
              customer = await FirebaseAuthService.fetchCustomer(authProfile.businessId);
            }
            set({user: result.user, authProfile, customer, accessToken: result.accessToken});
          }
        } catch (e: unknown) {
          const err = e as {message?: string};
          set({ signInError: err?.message ?? 'Failed to verify account.' });
        } finally {
          set({restoreSessionLoading: false});
        }
      },

      // ── Drive initial state ─────────────────────────────────────────────────
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
      foldersLoading: false,
      csvLoading: false,
      driveError: null,

      // ── Drive actions ───────────────────────────────────────────────────────

      loadFolders: async (parentId = 'root') => {
        const {accessToken} = get();
        if (!accessToken) {
          set({driveError: 'Not signed in.'});
          return;
        }
        set({foldersLoading: true, driveError: null});
        try {
          const folders = await DriveService.listFolders(accessToken, parentId);
          set({folders, foldersLoading: false});
        } catch (e: unknown) {
          const err = e as {message?: string};
          set({
            foldersLoading: false,
            driveError: err?.message ?? 'Failed to load folders.',
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
        const {accessToken, sourceFolderId, archiveFolderId, sourceFolderName, archiveFolderName} = get();
        if (!accessToken) return;

        if (sourceFolderId) {
          try {
            const meta = await DriveService.getFileMetadata(accessToken, sourceFolderId);
            if (meta && meta.mimeType === 'application/vnd.google-apps.folder' && !meta.trashed) {
              if (meta.name && meta.name !== sourceFolderName) {
                set({sourceFolderName: meta.name});
              }
              set({sourceFolderValid: true});
            } else {
              set({
                sourceFolderValid: false,
                driveError: 'The selected source folder no longer exists or was moved to trash.',
              });
            }
          } catch (e: any) {
            const status = e?.status ?? e?.statusCode;
            if (status === 404 || status === 403) {
              set({
                sourceFolderValid: false,
                driveError: 'Access to the configured source folder was revoked or it was deleted.',
              });
            } else {
              // Network/temporary error — keep valid
              set({sourceFolderValid: true});
            }
          }
        }

        if (archiveFolderId) {
          try {
            const meta = await DriveService.getFileMetadata(accessToken, archiveFolderId);
            if (meta && meta.mimeType === 'application/vnd.google-apps.folder' && !meta.trashed) {
              if (meta.name && meta.name !== archiveFolderName) {
                set({archiveFolderName: meta.name});
              }
              set({archiveFolderValid: true});
            } else {
              set({archiveFolderValid: false});
            }
          } catch {
            set({archiveFolderValid: true});
          }
        }
      },

      loadCsvFiles: async () => {
        const {accessToken, sourceFolderId} = get();
        if (!accessToken || !sourceFolderId) {
          set({driveError: 'No folder selected.'});
          return;
        }
        set({csvLoading: true, driveError: null});
        try {
          const csvFiles = await DriveService.listCsvFiles(accessToken, sourceFolderId);
          set({csvFiles, csvLoading: false});
        } catch (e: unknown) {
          const err = e as {message?: string};
          set({
            csvLoading: false,
            driveError: err?.message ?? 'Failed to list CSV files.',
          });
        }
      },

      // ── CSV initial state ───────────────────────────────────────────────────
      receipts: [],
      parseLoading: false,
      csvError: null,
      lastParsedFileId: null,

      // ── CSV actions ─────────────────────────────────────────────────────────

      downloadAndParse: async (file: DriveFile) => {
        const {accessToken, sourceFolderId} = get();
        if (!accessToken) {
          set({csvError: 'Not signed in.'});
          return;
        }
        set({parseLoading: true, csvError: null});
        try {
          const result = await DriveService.downloadAndParseCsv(accessToken, file);
          set((state) => {
            const currentProgress = state.csvProgress[file.id];
            let newProgress = currentProgress;
            if (!currentProgress) {
              newProgress = {
                driveFileId: file.id,
                sourceFolderId: sourceFolderId || 'root',
                expectedCount: result.receipts.length,
                printedCount: 0,
                archiveStatus: 'PENDING',
              };
            }
            return {
              receipts: result.receipts,
              parseLoading: false,
              lastParsedFileId: file.id,
              generatedPdfPaths: {},
              pdfError: null,
              csvProgress: {
                ...state.csvProgress,
                [file.id]: newProgress,
              },
            };
          });
        } catch (e: unknown) {
          const err = e as {message?: string};
          set({
            parseLoading: false,
            csvError: err?.message ?? 'Failed to parse CSV.',
          });
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

      // ── Receipt PDF initial state ───────────────────────────────────────────
      generatedPdfPaths: {},
      generatingReceiptIndex: null,
      pdfError: null,

      // ── Receipt PDF actions ─────────────────────────────────────────────────

      generateReceiptPdf: async (receiptIndex: number) => {
        const receipt = get().receipts[receiptIndex];
        if (!receipt) {
          set({pdfError: 'The selected parsed transaction is no longer available.'});
          return null;
        }

        set({generatingReceiptIndex: receiptIndex, pdfError: null});
        try {
          const {businessProfile, a4Template} = get();
          const path = await ReceiptPdfService.generateReceiptPdf(receipt, businessProfile, a4Template);
          const key = receiptIdentity(receipt);
          set(state => ({
            generatedPdfPaths: {...state.generatedPdfPaths, [key]: path},
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

      clearPdfError: () => set({pdfError: null}),

      // ── Printer initial state ───────────────────────────────────────────────
      selectedPrinterType: 'office',
      selectedBluetoothDevice: null,
      pairedDevices: [],
      devicesLoading: false,
      printLoading: false,
      printerError: null,
      lastPrintResult: null,

      // ── Printer actions ─────────────────────────────────────────────────────

      setPrinterType: (type: PrinterType) => {
        set({selectedPrinterType: type, printerError: null, lastPrintResult: null});
      },

      setSelectedBluetoothDevice: (device: BluetoothDevice | null) => {
        set({selectedBluetoothDevice: device, printerError: null});
      },

      loadPairedDevices: async () => {
        set({devicesLoading: true, printerError: null});
        try {
          const thermalAdapter = PrinterService.getThermalAdapter();
          const devices = await thermalAdapter.getBondedDevices();
          set({pairedDevices: devices, devicesLoading: false});
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          set({devicesLoading: false, printerError: message || 'Failed to load paired Bluetooth devices.'});
        }
      },

      connectBluetoothPrinter: async (device: BluetoothDevice) => {
        set({printLoading: true, printerError: null});
        try {
          const thermalAdapter = PrinterService.getThermalAdapter();
          await thermalAdapter.connect(device.address);
          set({selectedBluetoothDevice: device, printLoading: false});
          return true;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          set({printLoading: false, printerError: message || 'Failed to connect to Bluetooth printer.'});
          return false;
        }
      },

      printReceipt: async (receipt: Receipt) => {
        const {selectedPrinterType, selectedBluetoothDevice, businessProfile, a4Template, thermalTemplate} = get();
        set({printLoading: true, printerError: null});
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
          set({
            printLoading: false,
            lastPrintResult: result,
            printerError: result.success ? null : (result.error ?? 'Print failed.'),
          });
          return result;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          const failResult = {success: false, error: message};
          set({
            printLoading: false,
            lastPrintResult: failResult,
            printerError: message,
          });
          return failResult;
        }
      },

      testPrintCurrentPrinter: async () => {
        const {selectedPrinterType, selectedBluetoothDevice} = get();
        set({printLoading: true, printerError: null});
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
          const failResult = {success: false, error: message};
          set({
            printLoading: false,
            lastPrintResult: failResult,
            printerError: message,
          });
          return failResult;
        }
      },

      clearPrinterError: () => set({printerError: null}),

      // ── Queue & Archive initial state ───────────────────────────────────────
      queue: [],
      csvProgress: {},

      // ── Queue & Archive actions ─────────────────────────────────────────────

      enqueueReceipt: (receipt: Receipt) => {
        const identity = receiptIdentity(receipt);
        const { queue } = get();
        const existing = queue.find(q => q.identity === identity);
        if (existing && (existing.status === 'QUEUED' || existing.status === 'PRINTING' || existing.status === 'PRINTED')) {
          return; // Duplicate protection
        }
        
        const newItem: QueueItem = {
          identity,
          status: 'QUEUED',
          receipt,
          queuedAt: Date.now(),
        };

        const newQueue = [...queue.filter(q => q.identity !== identity), newItem];
        if (newQueue.length > 500) {
          newQueue.splice(0, newQueue.length - 500);
        }

        set({ queue: newQueue });
      },

      updateQueueItemStatus: async (identity: string, status: PrintStatus, error?: string) => {
        const { queue, csvProgress, accessToken, archiveFolderId } = get();
        const itemIndex = queue.findIndex(q => q.identity === identity);
        if (itemIndex === -1) return;

        const item = queue[itemIndex];
        const updatedItem = { 
          ...item, 
          status, 
          error, 
          completedAt: (status === 'PRINTED' || status === 'FAILED') ? Date.now() : item.completedAt 
        };
        
        let newQueue = [...queue];
        newQueue[itemIndex] = updatedItem;

        let newCsvProgress = { ...csvProgress };

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

              if (newPrintedCount >= prog.expectedCount && prog.archiveStatus === 'PENDING') {
                if (accessToken && archiveFolderId) {
                  try {
                    await DriveService.moveFile(accessToken, driveFileId, prog.sourceFolderId, archiveFolderId);
                    newCsvProgress[driveFileId].archiveStatus = 'ARCHIVED';
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    newCsvProgress[driveFileId].archiveStatus = 'FAILED';
                    newCsvProgress[driveFileId].archiveError = msg;
                  }
                } else {
                   newCsvProgress[driveFileId].archiveStatus = 'FAILED';
                   newCsvProgress[driveFileId].archiveError = 'Archive skipped: Not signed in or no archive folder selected.';
                }
              }
            }
          }
        }

        set({ queue: newQueue, csvProgress: newCsvProgress });
      },

      retryFailedPrints: () => {
         const { queue } = get();
         const newQueue = queue.map(q => q.status === 'FAILED' ? { ...q, status: 'QUEUED' as PrintStatus, error: undefined } : q);
         set({ queue: newQueue });
      },

      retryArchive: async (driveFileId: string) => {
         const { csvProgress, accessToken, archiveFolderId } = get();
         const prog = csvProgress[driveFileId];
         if (!prog || prog.archiveStatus !== 'FAILED') return;

         if (!accessToken || !archiveFolderId) {
            set({
               csvProgress: {
                 ...csvProgress,
                 [driveFileId]: { ...prog, archiveError: 'Not signed in or no archive folder selected.' }
               }
            });
            return;
         }

         // Mark as pending while retrying
         set({
            csvProgress: {
               ...csvProgress,
               [driveFileId]: { ...prog, archiveStatus: 'PENDING', archiveError: undefined }
            }
         });

         try {
            await DriveService.moveFile(accessToken, driveFileId, prog.sourceFolderId, archiveFolderId);
            set(state => ({
               csvProgress: {
                 ...state.csvProgress,
                 [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'ARCHIVED', archiveError: undefined }
               }
            }));
         } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            set(state => ({
               csvProgress: {
                 ...state.csvProgress,
                 [driveFileId]: { ...state.csvProgress[driveFileId], archiveStatus: 'FAILED', archiveError: msg }
               }
            }));
         }
      },

      clearHistory: () => {
         set({ queue: [], csvProgress: {} });
      },

      processQueue: async () => {
        // Sequential processing loop
        while (true) {
          const { queue, printReceipt, updateQueueItemStatus } = get();
          const nextItem = queue.find(q => q.status === 'QUEUED');
          if (!nextItem) break;

          await updateQueueItemStatus(nextItem.identity, 'PRINTING');
          const result = await printReceipt(nextItem.receipt);

          if (result.success) {
            await updateQueueItemStatus(nextItem.identity, 'PRINTED');
          } else {
            await updateQueueItemStatus(nextItem.identity, 'FAILED', result.error);
          }
        }
      },

      // ── Monitoring initial state ─────────────────────────────────────────────
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

      // ── Monitoring actions ───────────────────────────────────────────────────

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
        const { accessToken, sourceFolderId, enqueueReceipt, removeDeferredFileId } = get();
        if (!accessToken) {
          set({ deferredError: 'Cannot enqueue deferred file: Not signed in to Google Drive.' });
          return false;
        }

        const parts = entry.split('::');
        const fileId = parts[0];
        const folderId = parts[1] || sourceFolderId || 'root';
        const fileName = parts[2];

        if (!fileId) {
          set({ deferredError: 'Invalid deferred file entry.' });
          return false;
        }

        set({ deferredLoadingId: entry, deferredError: null });
        try {
          // Direct file metadata lookup using fileId
          let targetFile: DriveFile | undefined;
          try {
            targetFile = await DriveService.getFileMetadata(accessToken, fileId);
          } catch (_) {
            // direct metadata fetch failed, try listing folder
          }

          if (!targetFile && folderId) {
            try {
              const csvFiles = await DriveService.listCsvFiles(accessToken, folderId);
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
          const { receipts } = await DriveService.downloadAndParseCsv(accessToken, targetFile);

          if (!receipts || receipts.length === 0) {
            throw new Error('The CSV contains no valid receipts.');
          }

          // Enqueue receipts using existing duplicate-protection logic
          for (const receipt of receipts) {
            enqueueReceipt(receipt);
          }

          // Update csvProgress for auto-archive tracking
          set(state => {
            const currentProg = state.csvProgress[fileId];
            if (!currentProg) {
              return {
                csvProgress: {
                  ...state.csvProgress,
                  [fileId]: {
                    driveFileId: fileId,
                    sourceFolderId: folderId,
                    expectedCount: receipts.length,
                    printedCount: 0,
                    archiveStatus: 'PENDING',
                  },
                },
              };
            }
            return {};
          });

          // Successfully enqueued — remove from deferred list
          removeDeferredFileId(entry);
          set({ deferredLoadingId: null, deferredError: null });
          return true;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          set({
            deferredLoadingId: null,
            deferredError: `Failed to enqueue "${fileName || fileId}": ${msg}`,
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

      // ── Hydration initial state & actions ───────────────────────────────────
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

        // Monitoring state persisted across restarts
        monitoringEnabled: state.monitoringEnabled,
        fcmToken: state.fcmToken,
        fcmRegistrationStatus: state.fcmRegistrationStatus,
        serviceAccountEmail: state.serviceAccountEmail,
        lastDriveNotificationAt: state.lastDriveNotificationAt,
        lastReconciliationAt: state.lastReconciliationAt,
        lastMonitoringError: state.lastMonitoringError,
        deferredFileIds: state.deferredFileIds,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function receiptIdentity(receipt: Receipt): string {
  return `${receipt.sourceFile?.driveFileId ?? 'local'}::${receipt.transactionType}::${receipt.transactionNumber}`;
}
