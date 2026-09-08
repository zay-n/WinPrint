/**
 * Winsoft Print Station — Root App Navigator
 *
 * Bottom-tab root with a native stack nested in each tab.
 * Tab icons use the bundled MaterialCommunityIcons font (dependency-free).
 */

import React from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import Icon from '../components/Icon';

import {Colors, Spacing, BorderRadius} from '../theme';
import {
  RootTabParamList,
  DashboardStackParamList,
  DriveStackParamList,
  QueueStackParamList,
  HistoryStackParamList,
  SettingsStackParamList,
} from './types';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import DriveScreen from '../screens/drive/DriveScreen';
import QueueScreen from '../screens/queue/QueueScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

// ─── Stack navigators (one per tab — ready for future nested screens) ─────────

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const DriveStack = createNativeStackNavigator<DriveStackParamList>();
const QueueStack = createNativeStackNavigator<QueueStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={stackScreenOptions}>
      <DashboardStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{headerShown: false}}
      />
    </DashboardStack.Navigator>
  );
}

function DriveNavigator() {
  return (
    <DriveStack.Navigator screenOptions={stackScreenOptions}>
      <DriveStack.Screen
        name="DriveHome"
        component={DriveScreen}
        options={{
          title: 'Google Drive',
          ...headerOptions,
        }}
      />
    </DriveStack.Navigator>
  );
}

function QueueNavigator() {
  return (
    <QueueStack.Navigator screenOptions={stackScreenOptions}>
      <QueueStack.Screen
        name="QueueHome"
        component={QueueScreen}
        options={{
          title: 'Print Queue',
          ...headerOptions,
        }}
      />
    </QueueStack.Navigator>
  );
}

function HistoryNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={stackScreenOptions}>
      <HistoryStack.Screen
        name="HistoryHome"
        component={HistoryScreen}
        options={{
          title: 'History',
          ...headerOptions,
        }}
      />
    </HistoryStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions}>
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          ...headerOptions,
        }}
      />
    </SettingsStack.Navigator>
  );
}

// ─── Root tab navigator ───────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<RootTabParamList>();

type TabIconProps = {
  name: string;
  focused: boolean;
  size: number;
};

function TabIcon({name, focused, size}: TabIconProps) {
  return (
    <View
      style={[
        styles.tabIconWrap,
        focused && styles.tabIconWrapActive,
      ]}>
      <Icon
        name={name}
        size={size}
        color={focused ? Colors.tabActive : Colors.tabInactive}
      />
    </View>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
      }}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardNavigator}
        options={{
          title: 'Home',
          tabBarIcon: ({focused, size}) => (
            <TabIcon name={focused ? 'view-dashboard' : 'view-dashboard-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Drive"
        component={DriveNavigator}
        options={{
          title: 'Drive',
          tabBarIcon: ({focused, size}) => (
            <TabIcon name={focused ? 'cloud' : 'cloud-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Queue"
        component={QueueNavigator}
        options={{
          title: 'Queue',
          tabBarIcon: ({focused, size}) => (
            <TabIcon name={focused ? 'printer' : 'printer-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryNavigator}
        options={{
          title: 'History',
          tabBarIcon: ({focused, size}) => (
            <TabIcon name={focused ? 'history' : 'history'} focused={focused} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          title: 'Settings',
          tabBarIcon: ({focused, size}) => (
            <TabIcon name={focused ? 'cog' : 'cog-outline'} focused={focused} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Shared style options ─────────────────────────────────────────────────────

const stackScreenOptions = {
  contentStyle: {backgroundColor: Colors.background},
};

const headerOptions = {
  headerStyle: {backgroundColor: Colors.surface},
  headerTintColor: Colors.textPrimary,
  headerShadowVisible: false,
  headerTitleStyle: {
    color: Colors.textPrimary,
    fontWeight: '600' as const,
    fontSize: 17,
  },
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBackground,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'android' ? 60 : 80,
    paddingBottom: Platform.OS === 'android' ? 8 : 20,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: -2,
  },
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  tabIconWrapActive: {
    backgroundColor: `${Colors.primary}22`,
  },
});
