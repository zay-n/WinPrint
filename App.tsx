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

// Enable native screens for React Navigation performance
enableScreens();

export default function App() {
  const restoreSession = useAppStore(state => state.restoreSession);

  useEffect(() => {
    void restoreSession();
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
