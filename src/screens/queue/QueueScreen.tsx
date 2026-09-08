/**
 * Winsoft Print Station — Queue Screen
 *
 * Placeholder for the local print queue (Phase 7).
 * Shows the empty state with job status definitions.
 */

import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';

import EmptyState from '../../components/EmptyState';
import SectionHeader from '../../components/SectionHeader';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';

/** Receipt job statuses — defined here as forward-reference only.
 *  The actual queue logic is implemented in Phase 7. */
const JOB_STATUSES: Array<{
  label: string;
  color: string;
  icon: string;
  description: string;
}> = [
  {label: 'QUEUED', color: Colors.primary, icon: 'clock-outline', description: 'Waiting for printer'},
  {label: 'GENERATING', color: Colors.warning, icon: 'cog-outline', description: 'Building receipt PDF'},
  {label: 'PRINTING', color: Colors.active, icon: 'printer-outline', description: 'Sending to printer'},
  {label: 'PRINTED', color: Colors.active, icon: 'check-circle-outline', description: 'Successfully printed'},
  {label: 'FAILED', color: Colors.error, icon: 'alert-circle-outline', description: 'Action required'},
];

export default function QueueScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: Colors.warning}]}>0</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: Colors.active}]}>0</Text>
            <Text style={styles.summaryLabel}>Printed</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, {color: Colors.error}]}>0</Text>
            <Text style={styles.summaryLabel}>Failed</Text>
          </View>
        </View>

        {/* Empty state */}
        <EmptyState
          icon="printer-check"
          title="Queue is Empty"
          description="Receipts detected from Google Drive will appear here, ready for printing."
          style={styles.emptyState}
        />

        {/* Status legend */}
        <SectionHeader title="Job Statuses" style={styles.sectionHeader} />
        <View style={styles.statusCard}>
          {JOB_STATUSES.map((s, i) => (
            <React.Fragment key={s.label}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, {backgroundColor: s.color}]} />
                <Icon name={s.icon} size={16} color={s.color} />
                <Text style={[styles.statusLabel, {color: s.color}]}>{s.label}</Text>
                <Text style={styles.statusDesc}>{s.description}</Text>
              </View>
              {i < JOB_STATUSES.length - 1 && <View style={styles.statusDivider} />}
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

  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.xxs,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  summaryValue: {
    ...Typography.displayMedium,
    fontWeight: '700',
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  emptyState: {minHeight: 240},

  sectionHeader: {marginTop: Spacing.sm},

  statusCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusLabel: {
    ...Typography.captionMedium,
    fontWeight: '700',
    minWidth: 90,
  },
  statusDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  statusDivider: {height: 1, backgroundColor: Colors.border},

  bottomPad: {height: Spacing.xl},
});
