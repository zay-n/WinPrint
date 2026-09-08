/**
 * Winsoft Print Station — Settings Screen
 *
 * Grouped settings layout. All items are placeholders in Phase 1.
 * The groups reflect the final settings architecture so navigation
 * slots can be wired up in later phases.
 *
 * Groups:
 *  - Google Drive
 *  - Receipt Template
 *  - Printer
 *  - Monitoring
 *  - App
 */

import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import SectionHeader from '../../components/SectionHeader';
import SettingsRow from '../../components/SettingsRow';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Google Drive ─────────────────────────────────────────── */}
        <SectionHeader title="Google Drive" />
        <View style={styles.group}>
          <SettingsRow
            icon="account-circle-outline"
            iconColor={Colors.active}
            label="Google Account"
            detail="Not signed in"
            isFirst
          />
          <SettingsRow
            icon="folder-google-drive"
            iconColor="#4285F4"
            label="Source Folder"
            detail="Not configured"
          />
          <SettingsRow
            icon="folder-move-outline"
            iconColor="#4285F4"
            label="Printed Folder"
            detail="Not configured"
            isLast
          />
        </View>

        {/* ── Receipt Template ─────────────────────────────────────── */}
        <SectionHeader title="Receipt Template" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="office-building-outline"
            iconColor={Colors.primary}
            label="Business Information"
            detail="Not configured"
            isFirst
          />
          <SettingsRow
            icon="image-outline"
            iconColor={Colors.primary}
            label="Logo"
            detail="None"
          />
          <SettingsRow
            icon="format-list-checks"
            iconColor={Colors.primary}
            label="Receipt Fields"
            detail="Default"
          />
          <SettingsRow
            icon="ruler-square"
            iconColor={Colors.primary}
            label="Paper Size"
            detail="A4"
          />
          <SettingsRow
            icon="text-box-outline"
            iconColor={Colors.primary}
            label="Footer Text"
            detail="Not set"
            isLast
          />
        </View>

        {/* ── Printer ──────────────────────────────────────────────── */}
        <SectionHeader title="Printer" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="printer-settings-outline"
            iconColor={Colors.warning}
            label="Printer Type"
            detail="Not configured"
            isFirst
          />
          <SettingsRow
            icon="printer-outline"
            iconColor={Colors.warning}
            label="Selected Printer"
            detail="None"
          />
          <SettingsRow
            icon="cellphone-wireless"
            iconColor={Colors.warning}
            label="Connection Method"
            detail="—"
          />
          <SettingsRow
            icon="test-tube-outline"
            iconColor={Colors.warning}
            label="Test Print"
            isLast
          />
        </View>

        {/* ── Monitoring ───────────────────────────────────────────── */}
        <SectionHeader title="Monitoring" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="radar"
            iconColor={Colors.active}
            label="Background Monitoring"
            detail="Disabled"
            isFirst
          />
          <SettingsRow
            icon="printer-pos-outline"
            iconColor={Colors.active}
            label="Auto-Print"
            detail="Off"
          />
          <SettingsRow
            icon="bell-outline"
            iconColor={Colors.active}
            label="Notifications"
            detail="Not configured"
            isLast
          />
        </View>

        {/* ── App ──────────────────────────────────────────────────── */}
        <SectionHeader title="App" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="information-outline"
            iconColor={Colors.textSecondary}
            label="About"
            detail="v0.1.0"
            isFirst
          />
          <SettingsRow
            icon="file-document-outline"
            iconColor={Colors.textSecondary}
            label="Logs"
            isLast
          />
        </View>

        {/* Build info */}
        <Text style={styles.buildInfo}>
          Winsoft Print Station · Phase 1 · Build 1
        </Text>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  scroll: {flex: 1},
  content: {
    padding: Spacing.base,
    paddingTop: Spacing.md,
  },

  sectionGap: {
    marginTop: Spacing.xl,
  },

  group: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadow.sm,
    marginTop: Spacing.xs,
  },

  buildInfo: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },

  bottomPad: {height: Spacing.xl},
});
