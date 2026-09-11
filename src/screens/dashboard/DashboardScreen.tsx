/**
 * Winsoft Print Station — Dashboard Screen
 *
 * The home screen of the application. Shows a summary of:
 * - Monitoring status (Phase 8)
 * - Drive connection status (Phase 2–3)
 * - Printer status (Phase 9–10)
 * - Pending / printed-today metrics (Phase 7+)
 * - Last receipt (Phase 7+)
 *
 * In Phase 1 all values are placeholders in inactive/neutral state.
 */

import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { DashboardScreenProps } from '../../navigation/types';
import Icon from '../../components/Icon';

import StatusCard from '../../components/StatusCard';
import MetricCard from '../../components/MetricCard';
import SectionHeader from '../../components/SectionHeader';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';

export default function DashboardScreen() {
  const user = useAppStore(s => s.user);
  const accessToken = useAppStore(s => s.accessToken);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);
  const queue = useAppStore(s => s.queue);
  const driveConnected = Boolean(user && accessToken);
  const navigation = useNavigation<DashboardScreenProps['navigation']>();

  const pendingCount = queue.filter(q => q.status === 'QUEUED' || q.status === 'PRINTING').length;
  const printedItems = queue.filter(q => q.status === 'PRINTED');
  const printedCount = printedItems.length;
  const failedCount = queue.filter(q => q.status === 'FAILED').length;
  const lastReceipt = printedCount > 0 ? printedItems[printedItems.length - 1] : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.brandIconWrap}>
              <Icon name="printer-wireless" size={24} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.appTitle}>Winsoft Print Station</Text>
              <Text style={styles.appSubtitle}>Automated Receipt Printing</Text>
            </View>
          </View>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v0.1</Text>
          </View>
        </View>

        {/* ── System Status ─────────────────────────────────────────── */}
        <SectionHeader title="System Status" style={styles.sectionHeader} />

        <View style={styles.statusRow}>
          <StatusCard
            icon="radar"
            title="Monitoring"
            value="Inactive"
            subLabel="Not started"
            variant="inactive"
            style={styles.statusCardThird}
          />
          <StatusCard
            icon="google-drive"
            title="Drive"
            value={driveConnected ? 'Connected' : 'Not connected'}
            subLabel={
              driveConnected
                ? (sourceFolderName ?? 'No folder selected')
                : 'Sign in required'
            }
            variant={driveConnected ? 'active' : 'inactive'}
            style={styles.statusCardThird}
          />
          <StatusCard
            icon="printer"
            title="Printer"
            value="Not configured"
            subLabel="Setup required"
            variant="inactive"
            style={styles.statusCardThird}
          />
        </View>

        {/* ── Metrics ───────────────────────────────────────────────── */}
        <SectionHeader title="Today's Activity" style={styles.sectionHeader} />

        <View style={styles.metricsRow}>
          <Pressable style={styles.metricWrapper} onPress={() => navigation.navigate('Queue')}>
            <MetricCard
              icon="clock-outline"
              label="Pending"
              value={pendingCount.toString()}
              accent={Colors.warning}
            />
          </Pressable>
          <Pressable style={styles.metricWrapper} onPress={() => navigation.navigate('History')}>
            <MetricCard
              icon="check-circle-outline"
              label="Printed"
              value={printedCount.toString()}
              accent={Colors.active}
            />
          </Pressable>
          <Pressable style={styles.metricWrapper} onPress={() => navigation.navigate('Queue')}>
            <MetricCard
              icon="alert-circle-outline"
              label="Failed"
              value={failedCount.toString()}
              accent={Colors.error}
            />
          </Pressable>
        </View>

        {/* ── Last Receipt ──────────────────────────────────────────── */}
        <SectionHeader title="Last Receipt" style={styles.sectionHeader} />

        <Pressable 
          style={({pressed}) => [styles.lastReceiptCard, pressed && { opacity: 0.8 }]}
          onPress={() => navigation.navigate('History')}>
          <Icon
            name="receipt"
            size={28}
            color={lastReceipt ? Colors.active : Colors.inactive}
            style={styles.lastReceiptIcon}
          />
          <View style={styles.lastReceiptContent}>
            <Text style={[styles.lastReceiptPlaceholder, lastReceipt && { color: Colors.textPrimary }]}>
              {lastReceipt ? `${lastReceipt.receipt.transactionType} ${lastReceipt.receipt.transactionNumber}` : 'No receipts printed yet'}
            </Text>
            <Text style={styles.lastReceiptSub}>
              {lastReceipt ? `Customer: ${lastReceipt.receipt.customer.name || 'N/A'}\nPrinted at: ${new Date(lastReceipt.completedAt || 0).toLocaleString()}` : 'Printed receipts will appear here'}
            </Text>
          </View>
        </Pressable>

        {/* ── Setup Prompt ──────────────────────────────────────────── */}
        <SectionHeader title="Setup Required" style={styles.sectionHeader} />

        <View style={styles.setupCard}>
          <View style={styles.setupStep}>
            <View style={[styles.stepBadge, styles.stepBadgeTodo]}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <View style={styles.setupStepContent}>
              <Text style={styles.setupStepTitle}>Connect Google Drive</Text>
              <Text style={styles.setupStepDesc}>
                Sign in and select your Winsoft CSV folder
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
          </View>

          <View style={styles.stepDivider} />

          <View style={styles.setupStep}>
            <View style={[styles.stepBadge, styles.stepBadgeTodo]}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <View style={styles.setupStepContent}>
              <Text style={styles.setupStepTitle}>Configure Receipt Template</Text>
              <Text style={styles.setupStepDesc}>
                Set business details and receipt layout
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
          </View>

          <View style={styles.stepDivider} />

          <View style={styles.setupStep}>
            <View style={[styles.stepBadge, styles.stepBadgeTodo]}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <View style={styles.setupStepContent}>
              <Text style={styles.setupStepTitle}>Configure Printer</Text>
              <Text style={styles.setupStepDesc}>
                Select office or thermal printer
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
          </View>

          <View style={styles.stepDivider} />

          <View style={styles.setupStep}>
            <View style={[styles.stepBadge, styles.stepBadgeTodo]}>
              <Text style={styles.stepBadgeText}>4</Text>
            </View>
            <View style={styles.setupStepContent}>
              <Text style={styles.setupStepTitle}>Enable Monitoring</Text>
              <Text style={styles.setupStepDesc}>
                Start automatic CSV detection
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  brandIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
  },
  appTitle: {
    ...Typography.title,
    color: Colors.textPrimary,
  },
  appSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  versionBadge: {
    backgroundColor: `${Colors.primary}22`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
  },
  versionText: {
    ...Typography.label,
    color: Colors.primaryLight,
  },

  // Section headers
  sectionHeader: {
    marginTop: Spacing.sm,
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusCardThird: {
    flex: 1,
    flexDirection: 'column',
    gap: Spacing.xs,
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricWrapper: {
    flex: 1,
  },

  // Last Receipt
  lastReceiptCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  lastReceiptIcon: {
    opacity: 0.5,
  },
  lastReceiptContent: {
    flex: 1,
  },
  lastReceiptPlaceholder: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  lastReceiptSub: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Setup steps
  setupCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  setupStep: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    gap: Spacing.md,
  },
  stepDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.base + 36 + Spacing.md,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepBadgeTodo: {
    backgroundColor: Colors.inactiveDim,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepBadgeDone: {
    backgroundColor: Colors.activeDim,
    borderWidth: 1,
    borderColor: Colors.active,
  },
  stepBadgeText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  setupStepContent: {
    flex: 1,
    gap: 2,
  },
  setupStepTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  setupStepDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },

  bottomPad: {
    height: Spacing.xl,
  },
});
