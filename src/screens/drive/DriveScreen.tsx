/**
 * Winsoft Print Station — Drive Screen
 *
 * Placeholder for Google Drive integration (Phase 2–3).
 * Shows the not-connected state and a summary of what will be available.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';

import EmptyState from '../../components/EmptyState';
import SectionHeader from '../../components/SectionHeader';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';

export default function DriveScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Connection status banner */}
        <View style={styles.statusBanner}>
          <View style={styles.statusDot} />
          <View style={styles.statusBannerContent}>
            <Text style={styles.statusBannerTitle}>Not Connected</Text>
            <Text style={styles.statusBannerDesc}>
              Google Drive requires sign-in (Phase 2)
            </Text>
          </View>
          <Icon name="lock-outline" size={18} color={Colors.inactive} />
        </View>

        {/* Empty state */}
        <EmptyState
          icon="google-drive"
          title="Drive Not Connected"
          description="Sign in with your Google account to connect Drive and select your Winsoft CSV source folder."
          style={styles.emptyState}
        />

        {/* Feature preview */}
        <SectionHeader title="Coming in Phase 2–3" style={styles.sectionHeader} />
        <View style={styles.featureCard}>
          {[
            {icon: 'account-circle-outline', text: 'Google Sign-In'},
            {icon: 'folder-google-drive', text: 'CSV source folder selection'},
            {icon: 'file-find-outline', text: 'Automatic new-file detection'},
            {icon: 'cloud-download-outline', text: 'CSV download to device'},
            {icon: 'folder-move-outline', text: 'Move processed files to Printed'},
          ].map((item, i, arr) => (
            <React.Fragment key={item.text}>
              <View style={styles.featureRow}>
                <Icon name={item.icon} size={18} color={Colors.primary} />
                <Text style={styles.featureText}>{item.text}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.featureDivider} />}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  scroll: {flex: 1},
  content: {padding: Spacing.base, gap: Spacing.sm},

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.inactive,
    flexShrink: 0,
  },
  statusBannerContent: {flex: 1},
  statusBannerTitle: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  statusBannerDesc: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  emptyState: {minHeight: 260},

  sectionHeader: {marginTop: Spacing.sm},

  featureCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  featureDivider: {height: 1, backgroundColor: Colors.border, marginLeft: Spacing.base + 18 + Spacing.md},
  featureText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },

  bottomPad: {height: Spacing.xl},
});
