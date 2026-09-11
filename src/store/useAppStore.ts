/**
 * useAppStore.ts — Zustand application state
 *
 * Manages slices for Auth, Drive, CSV, PDF, Printer, and Queue.
 */

import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {GoogleUser, AuthResult} from '../services/auth/GoogleAuthService';
import * as GoogleAuthService from '../services/auth/GoogleAuthService';
import * as DriveService from '../services/drive/DriveService';
import type {DriveFile} from '../services/drive/DriveClient';
import type {Receipt} from '../models/Receipt';
import * as ReceiptPdfService from '../services/pdf/ReceiptPdfService';
import type {
  PrinterType,
  BluetoothDevice,
  PrintResult,
} from '../services/printer/PrinterAdapter';
import {PrinterService} from '../services/printer/PrinterService';

// ---------------------------------------------------------------------------
// Auth slice
// ---------------------------------------------------------------------------

interface AuthState {
  user: GoogleUser | null;
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
  /** Selected archive folder ID */
  archiveFolderId: string | null;
  /** Display name of the archive folder */
  archiveFolderName: string | null;
  /** Folders visible to the user for selection */
  folders: DriveFile[];
  /** CSV files in the selected folder */
  csvFiles: DriveFile[];
  foldersLoading: boolean;
  csvLoading: boolean;
  driveError: string | null;
}

interface DriveActions {
  loadFolders: (parentId?: string) => Promise<void>;
  selectFolder: (folder: DriveFile) => void;
  selectArchiveFolder: (folder: DriveFile) => void;
  loadCsvFiles: () => Promise<void>;
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
// Combined store
// ---------------------------------------------------------------------------

type AppStore = AuthState &
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
  QueueActions;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ── Auth initial state ──────────────────────────────────────────────────
      user: null,
      accessToken: null,
      signInLoading: false,
      restoreSessionLoading: false,
      signInError: null,

      // ── Auth actions ────────────────────────────────────────────────────────

      signIn: async () => {
        set({signInLoading: true, signInError: null});
        try {
          const result: AuthResult = await GoogleAuthService.signIn();
          set({
            user: result.user,
            accessToken: result.accessToken,
            signInLoading: false,
            signInError: null,
          });
        } catch (e: unknown) {
          const err = e as {message?: string};
          set({
            signInLoading: false,
            signInError: err?.message ?? 'Sign-in failed.',
          });
        }
      },

      signOut: async () => {
        try {
          await GoogleAuthService.signOut();
        } catch {
          // Best effort — clear state regardless
        }
        set({
          user: null,
          accessToken: null,
          sourceFolderId: null,
          sourceFolderName: null,
          archiveFolderId: null,
          archiveFolderName: null,
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
        set({restoreSessionLoading: true});
        try {
          const result = await GoogleAuthService.getCurrentUser();
          if (result) {
            set({user: result.user, accessToken: result.accessToken});
          }
        } finally {
          set({restoreSessionLoading: false});
        }
      },

      // ── Drive initial state ─────────────────────────────────────────────────
      sourceFolderId: null,
      sourceFolderName: null,
      archiveFolderId: null,
      archiveFolderName: null,
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

      selectFolder: (folder: DriveFile) => {
        set({
          sourceFolderId: folder.id,
          sourceFolderName: folder.name,
          csvFiles: [],
          receipts: [],
          lastParsedFileId: null,
          csvError: null,
          generatedPdfPaths: {},
          generatingReceiptIndex: null,
          pdfError: null,
        });
      },

      selectArchiveFolder: (folder: DriveFile) => {
        set({
          archiveFolderId: folder.id,
          archiveFolderName: folder.name,
        });
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
          const path = await ReceiptPdfService.generateReceiptPdf(receipt);
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
          const result = await adapter.print(receipt);
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
      }
    }),
    {
      name: 'winprint-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        queue: state.queue,
        csvProgress: state.csvProgress,
      }),
    }
  )
);

export function receiptIdentity(receipt: Receipt): string {
  return `${receipt.sourceFile?.driveFileId ?? 'local'}::${receipt.transactionType}::${receipt.transactionNumber}`;
}
