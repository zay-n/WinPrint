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
import {useAppStore} from './src/store/useAppStore';
import * as MonitoringService from './src/services/monitoring/MonitoringService';
import {BACKEND_BASE_URL} from './src/config/backend';

// Enable native screens for React Navigation performance
enableScreens();

export default function App() {
  const restoreSession = useAppStore(state => state.restoreSession);

  useEffect(() => {
    const boot = async () => {
      // Restore persisted session first so that accessToken and sourceFolderId
      // are available in the store before MonitoringService reads them.
      await restoreSession();

      // Wire the Zustand store into MonitoringService.
      // getState() is called lazily inside each accessor so the service always
      // reads the current (post-restore) values rather than the stale closure.
      const store = useAppStore.getState;
      await MonitoringService.initialize(
        {
          getAccessToken: () => store().accessToken,
          getSourceFolderId: () => store().sourceFolderId,
          getFcmRegistrationStatus: () => store().fcmRegistrationStatus,
          getCachedFcmToken: () => store().fcmToken,
          enqueueReceipt: r => store().enqueueReceipt(r),
          processQueue: () => store().processQueue(),
          setFcmToken: t => store().setFcmToken(t),
          setFcmRegistrationStatus: s => store().setFcmRegistrationStatus(s),
          setServiceAccountEmail: e => store().setServiceAccountEmail(e),
          recordDriveNotification: () => store().recordDriveNotification(),
          recordReconciliation: () => store().recordReconciliation(),
          setMonitoringError: msg => store().setMonitoringError(msg),
          addDeferredFileId: entry => store().addDeferredFileId(entry),
          removeDeferredFileId: entry => store().removeDeferredFileId(entry),
          getDeferredFileIds: () => store().deferredFileIds,
        },
        BACKEND_BASE_URL,
      );
    };

    void boot();
  }, [restoreSession]);

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
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
