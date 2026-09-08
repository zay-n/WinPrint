/**
 * Winsoft Print Station — Navigation Type Definitions
 *
 * Defines the param lists for each navigator so screens get
 * fully-typed route props and navigation calls throughout the app.
 */

import type {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import type {CompositeScreenProps} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

// ─── Root Tab Navigator ───────────────────────────────────────────────────────

export type RootTabParamList = {
  Dashboard: undefined;
  Drive: undefined;
  Queue: undefined;
  History: undefined;
  Settings: undefined;
};

// ─── Per-tab stack navigators (placeholders for future nested screens) ────────

export type DashboardStackParamList = {
  DashboardHome: undefined;
};

export type DriveStackParamList = {
  DriveHome: undefined;
};

export type QueueStackParamList = {
  QueueHome: undefined;
};

export type HistoryStackParamList = {
  HistoryHome: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
};

// ─── Composite screen props helpers ──────────────────────────────────────────

export type DashboardScreenProps = CompositeScreenProps<
  NativeStackScreenProps<DashboardStackParamList, 'DashboardHome'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type DriveScreenProps = CompositeScreenProps<
  NativeStackScreenProps<DriveStackParamList, 'DriveHome'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type QueueScreenProps = CompositeScreenProps<
  NativeStackScreenProps<QueueStackParamList, 'QueueHome'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type HistoryScreenProps = CompositeScreenProps<
  NativeStackScreenProps<HistoryStackParamList, 'HistoryHome'>,
  BottomTabScreenProps<RootTabParamList>
>;

export type SettingsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>,
  BottomTabScreenProps<RootTabParamList>
>;

// ─── Global navigation type augmentation ─────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootTabParamList {}
  }
}
