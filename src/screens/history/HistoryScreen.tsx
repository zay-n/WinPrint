/**
 * Winsoft Print Station — History Screen
 *
 * Placeholder for print history (Phase 12).
 * Shows the empty state with filter placeholder and upcoming feature summary.
 */

import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';

import EmptyState from '../../components/EmptyState';
import SectionHeader from '../../components/SectionHeader';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';

export default function HistoryScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Filter bar (placeholder) */}
        <View style={styles.filterBar}>
          {(['All', 'Printed', 'Failed', 'Archived'] as const).map((f, i) => (
            <View
              key={f}
              style={[
                styles.filterChip,
                i === 0 && styles.filterChipActive,
              ]}>
              <Text
                style={[
                  styles.filterText,
                  i === 0 && styles.filterTextActive,
                ]}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        {/* Empty state */}
        <EmptyState
          icon="history"
          title="No History Yet"
          description="Successfully printed receipts will be recorded here with timestamps, transaction numbers, and archive status."
          style={styles.emptyState}
        />

        {/* What will be here */}
        <SectionHeader title="Coming in Phase 12" style={styles.sectionHeader} />
        <View style={styles.previewCard}>
          {[
            {icon: 'receipt-outline', text: 'Full print history with timestamps'},
            {icon: 'identifier', text: 'Transaction numbers and types'},
            {icon: 'file-check-outline', text: 'Archive and PDF status tracking'},
            {icon: 'alert-circle-outline', text: 'Error history with retry options'},
            {icon: 'magnify', text: 'Search and filter history'},
          ].map((item, i, arr) => (
            <React.Fragment key={item.text}>
              <View style={styles.previewRow}>
                <Icon name={item.icon} size={18} color={Colors.primary} />
                <Text style={styles.previewText}>{item.text}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.previewDivider} />}
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

  filterBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: `${Colors.primary}22`,
    borderColor: Colors.primary,
  },
  filterText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.primaryLight,
  },

  emptyState: {minHeight: 260},

  sectionHeader: {marginTop: Spacing.sm},

  previewCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  previewDivider: {height: 1, backgroundColor: Colors.border, marginLeft: Spacing.base + 18 + Spacing.md},
  previewText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },

  bottomPad: {height: Spacing.xl},
});
