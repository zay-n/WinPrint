/**
 * Winsoft Print Station
 *
 * Root application component.
 * Wraps the entire tree with required providers and mounts AppNavigator.
 */

import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {enableScreens} from 'react-native-screens';

import AppNavigator from './src/navigation/AppNavigator';
import AuthGate from './src/components/AuthGate';
import {useAppStore} from './src/store/useAppStore';
import * as MonitoringService from './src/services/monitoring/MonitoringService';
import {BACKEND_BASE_URL} from './src/config/backend';

// Enable native screens for React Navigation performance
enableScreens();

export default function App() {
  const restoreSession = useAppStore(state => state.restoreSession);
  const validateSavedFolders = useAppStore(state => state.validateSavedFolders);

  useEffect(() => {
    const boot = async () => {
      // Restore persisted session first so that accessToken and sourceFolderId
      // are available in the store before MonitoringService reads them.
      await restoreSession();

      // Validate saved Drive folders in the background if signed in
      const currentToken = useAppStore.getState().accessToken;
      if (currentToken) {
        void validateSavedFolders();
      }

      // Initialize MonitoringService so event listeners are active
      await MonitoringService.initialize(
        {
          getAccessToken: () => useAppStore.getState().accessToken,
          getSourceFolderId: () => useAppStore.getState().sourceFolderId,
          getSourceFolderName: () => useAppStore.getState().sourceFolderName,
          getFcmRegistrationStatus: () => useAppStore.getState().fcmRegistrationStatus,
          getCachedFcmToken: () => useAppStore.getState().fcmToken,
          getUserId: () => useAppStore.getState().authProfile?.uid ?? useAppStore.getState().user?.id ?? null,
          getUserEmail: () => useAppStore.getState().user?.email ?? useAppStore.getState().authProfile?.email ?? null,
          getBusinessId: () => useAppStore.getState().authProfile?.businessId ?? null,
          enqueueReceipt: r => useAppStore.getState().enqueueReceipt(r),
          processQueue: () => useAppStore.getState().processQueue(),
          setFcmToken: t => useAppStore.getState().setFcmToken(t),
          setFcmRegistrationStatus: s => useAppStore.getState().setFcmRegistrationStatus(s),
          setServiceAccountEmail: e => useAppStore.getState().setServiceAccountEmail(e),
          recordDriveNotification: () => useAppStore.getState().recordDriveNotification(),
          recordReconciliation: () => useAppStore.getState().recordReconciliation(),
          setMonitoringError: msg => useAppStore.getState().setMonitoringError(msg),
          addDeferredFileId: entry => useAppStore.getState().addDeferredFileId(entry),
          removeDeferredFileId: entry => useAppStore.getState().removeDeferredFileId(entry),
          getDeferredFileIds: () => useAppStore.getState().deferredFileIds,
        },
        BACKEND_BASE_URL,
      );

      // If user is already authenticated with an incoming folder, automatically register
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
