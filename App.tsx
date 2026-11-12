/**
 * Winsoft Print Station
 *
 * Root application component.
 * Wraps the entire tree with required providers and mounts AppNavigator.
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import AppNavigator from './src/navigation/AppNavigator';
import AuthGate from './src/components/AuthGate';
import { useAppStore } from './src/store/useAppStore';
import * as MonitoringService from './src/services/monitoring/MonitoringService';
import { BACKEND_BASE_URL } from './src/config/backend';

// Enable native screens for React Navigation performance
enableScreens();

export default function App() {
  const restoreSession = useAppStore(state => state.restoreSession);
  const validateSavedFolders = useAppStore(state => state.validateSavedFolders);

  useEffect(() => {
    const monitoringStore = {
      getSourceFolderId: () => useAppStore.getState().sourceFolderId,
      getSourceFolderName: () => useAppStore.getState().sourceFolderName,
      getFcmRegistrationStatus: () => useAppStore.getState().fcmRegistrationStatus,
      getCachedFcmToken: () => useAppStore.getState().fcmToken,
      getUserId: () => useAppStore.getState().authProfile?.uid ?? null,
      getUserEmail: () => useAppStore.getState().user?.email ?? useAppStore.getState().authProfile?.email ?? null,
      getBusinessId: () => useAppStore.getState().authProfile?.businessId ?? null,
      enqueueReceipt: (r: import('./src/models/Receipt').Receipt) => useAppStore.getState().enqueueReceipt(r),
      prepareCsvForQueue: (fileId: string, folderId: string, count: number) =>
        useAppStore.getState().prepareCsvForQueue(fileId, folderId, count),
      isCsvKnown: (fileId: string) => {
        const state = useAppStore.getState();
        const progress = state.csvProgress[fileId];
        return state.queue.some(item => item.receipt.sourceFile?.driveFileId === fileId) ||
          !!progress && progress.printedCount >= progress.expectedCount && progress.expectedCount > 0;
      },
      processQueue: (driveFileId?: string) => {
        const state = useAppStore.getState();
        return state.processQueue(
          driveFileId
            ? state.queue
              .filter(item => item.receipt.sourceFile?.driveFileId === driveFileId)
              .map(item => item.identity)
            : undefined,
        );
      },
      setIncomingFiles: (files: import('./src/services/drive/DriveClient').DriveFile[]) => useAppStore.getState().setCsvFiles(files),
      setFcmToken: (t: string) => useAppStore.getState().setFcmToken(t),
      setFcmRegistrationStatus: (s: import('./src/store/useAppStore').FcmRegistrationStatus) => useAppStore.getState().setFcmRegistrationStatus(s),
      setServiceAccountEmail: (e: string) => useAppStore.getState().setServiceAccountEmail(e),
      recordDriveNotification: () => useAppStore.getState().recordDriveNotification(),
      recordReconciliation: () => useAppStore.getState().recordReconciliation(),
      setMonitoringError: (msg: string | null) => useAppStore.getState().setMonitoringError(msg),
      setDriveNeedsReauth: (needsReauth: boolean) => useAppStore.setState({ driveNeedsReauth: needsReauth, ...(needsReauth ? { driveAccessChecked: true } : {}) }),
      setDriveAccessAvailable: () => useAppStore.setState({ driveAccessChecked: true, driveNeedsReauth: false }),
      addDeferredFileId: (entry: string) => useAppStore.getState().addDeferredFileId(entry),
      removeDeferredFileId: (entry: string) => useAppStore.getState().removeDeferredFileId(entry),
      getDeferredFileIds: () => useAppStore.getState().deferredFileIds,
    };

    const boot = async () => {
      // Do not start auth restoration until persisted folder configuration has
      // been hydrated. Firebase Auth remains authoritative for sign-in state.
      if (!useAppStore.persist.hasHydrated()) {
        await new Promise<void>(resolve => {
          useAppStore.persist.onFinishHydration(() => resolve());
        });
      }
      await restoreSession();

      // Resume files whose receipts were all printed but whose Drive move was
      // interrupted by process termination. This never reprints receipts.
      if (useAppStore.getState().user) {
        void useAppStore.getState().resumePendingArchives();
      }

      // Validate saved Drive folders using an on-demand Drive token.
      if (useAppStore.getState().user) {
        void validateSavedFolders();
      }

      await MonitoringService.initialize(monitoringStore, BACKEND_BASE_URL);

      // If a signed-in user already has an Incoming folder, ensure push registration.
      const currentStore = useAppStore.getState();
      if (currentStore.user && currentStore.sourceFolderId) {
        void MonitoringService.ensureRegistered();
      }
    };

    void boot();
  }, [restoreSession, validateSavedFolders]);

  return (
    <SafeAreaProvider>
      {/*
       * barStyle="light-content" gives white icons/text in the status bar.
       * In RN 0.87 (New Architecture / Fabric) the static imperative methods
       * setBackgroundColor / setTranslucent do not exist — status bar
       * appearance is controlled declaratively via this component.
       */}
      <StatusBar barStyle="light-content" />
      <NavigationContainer>
        <AuthGate>
          <AppNavigator />
        </AuthGate>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
