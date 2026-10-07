/**
 * Winsoft Print Station — Dashboard Screen
 *
 * Production customer dashboard. Answers:
 *  1. Is Winsoft connected?
 *  2. Is monitoring working?
 *  3. Is my printer ready?
 *  4. Are there bills waiting?
 *  5. What happened recently?
 *
 * Uses real store data. No fabricated metrics.
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
import {useNavigation} from '@react-navigation/native';
import type {DashboardScreenProps} from '../../navigation/types';
import Icon from '../../components/Icon';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusDot({active}: {active: boolean}) {
  return (
    <View
      style={[
        styles.statusDot,
        {backgroundColor: active ? Colors.active : Colors.inactive},
      ]}
    />
  );
}

interface InfoCardProps {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  isActive: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

function InfoCard({icon, iconColor, title, subtitle, isActive, actionLabel, onAction}: InfoCardProps) {
  return (
    <View style={[styles.infoCard, !isActive && styles.infoCardInactive]}>
      <View style={[styles.infoCardIcon, {backgroundColor: `${iconColor}18`, borderColor: `${iconColor}30`}]}>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.infoCardBody}>
        <View style={styles.infoCardTitleRow}>
          <StatusDot active={isActive} />
          <Text style={styles.infoCardTitle}>{title}</Text>
        </View>
        <Text style={styles.infoCardSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={styles.infoCardAction} hitSlop={8}>
          <Text style={styles.infoCardActionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface MetricTileProps {
  icon: string;
  accentColor: string;
  label: string;
  value: string | number;
  onPress?: () => void;
}

function MetricTile({icon, accentColor, label, value, onPress}: MetricTileProps) {
  return (
    <Pressable
      style={({pressed}) => [styles.metricTile, pressed && styles.metricTilePressed]}
      onPress={onPress}>
      <View style={[styles.metricTileIcon, {backgroundColor: `${accentColor}18`}]}>
        <Icon name={icon} size={18} color={accentColor} />
      </View>
      <Text style={[styles.metricValue, {color: accentColor}]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const user = useAppStore(s => s.user);
  const authProfile = useAppStore(s => s.authProfile);
  const customer = useAppStore(s => s.customer);
  const accessToken = useAppStore(s => s.accessToken);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);
  const queue = useAppStore(s => s.queue);
  const deferredFileIds = useAppStore(s => s.deferredFileIds);
  const monitoringEnabled = useAppStore(s => s.monitoringEnabled);
  const selectedPrinterType = useAppStore(s => s.selectedPrinterType);
  const selectedBluetoothDevice = useAppStore(s => s.selectedBluetoothDevice);
  const lastDriveNotificationAt = useAppStore(s => s.lastDriveNotificationAt);

  const navigation = useNavigation<DashboardScreenProps['navigation']>();

  const driveConnected = Boolean(user && accessToken);
  const pendingCount = queue.filter(q => q.status === 'QUEUED' || q.status === 'PRINTING').length;
  const printedItems = queue.filter(q => q.status === 'PRINTED');
  const printedTodayCount = printedItems.filter(q => {
    const completed = q.completedAt ?? 0;
    const today = new Date();
    const completedDate = new Date(completed);
    return (
      completedDate.getFullYear() === today.getFullYear() &&
      completedDate.getMonth() === today.getMonth() &&
      completedDate.getDate() === today.getDate()
    );
  }).length;
  const failedCount = queue.filter(q => q.status === 'FAILED').length;
  const deferredCount = deferredFileIds.length;

  const recentItems = [...printedItems].reverse().slice(0, 5);
  const lastBillAt = lastDriveNotificationAt
    ? new Date(lastDriveNotificationAt).toLocaleString()
    : null;

  // Greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.name?.split(' ')[0] ?? 'there';
  const businessName = customer?.businessName ?? authProfile?.businessId ?? '';

  // Printer label
  const printerLabel =
    selectedPrinterType === 'office'
      ? 'Office Printer'
      : selectedPrinterType === 'thermal'
      ? selectedBluetoothDevice?.name ?? 'Thermal (not paired)'
      : 'Not configured';
  const printerReady =
    selectedPrinterType === 'office' ||
    (selectedPrinterType === 'thermal' && !!selectedBluetoothDevice);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatar}>
              <Icon name="printer-wireless" size={22} color={Colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.greetingText}>
                {greeting}, {displayName}
              </Text>
              {businessName ? (
                <Text style={styles.businessText} numberOfLines={1}>
                  {businessName}
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable
            style={({pressed}) => [styles.settingsBtn, pressed && {opacity: 0.7}]}
            onPress={() => navigation.navigate('Settings')}>
            <Icon name="cog-outline" size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* ── Monitoring Status ────────────────────────────────────────── */}
        <View style={[styles.monitoringCard, monitoringEnabled && styles.monitoringCardActive]}>
          <View style={styles.monitoringCardLeft}>
            <View style={[styles.monitoringIcon, monitoringEnabled && styles.monitoringIconActive]}>
              <Icon
                name={monitoringEnabled ? 'radar' : 'radar'}
                size={24}
                color={monitoringEnabled ? Colors.active : Colors.inactive}
              />
            </View>
            <View style={styles.monitoringBody}>
              <View style={styles.monitoringTitleRow}>
                <View style={[styles.liveIndicator, !monitoringEnabled && styles.liveIndicatorOff]} />
                <Text style={[styles.monitoringTitle, !monitoringEnabled && styles.monitoringTitleOff]}>
                  {monitoringEnabled ? 'Monitoring Active' : 'Monitoring Off'}
                </Text>
              </View>
              <Text style={styles.monitoringSubtitle}>
                {monitoringEnabled
                  ? lastBillAt
                    ? `Last bill: ${lastBillAt}`
                    : 'Winsoft is connected and ready to receive bills.'
                  : 'Enable monitoring in Settings to receive bills.'}
              </Text>
            </View>
          </View>
          {!monitoringEnabled && (
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              style={({pressed}) => [styles.monitoringActionBtn, pressed && {opacity: 0.7}]}>
              <Text style={styles.monitoringActionText}>Enable</Text>
            </Pressable>
          )}
        </View>

        {/* ── Connection Status ────────────────────────────────────────── */}
        <View style={styles.statusGrid}>
          <InfoCard
            icon="google-drive"
            iconColor="#4285F4"
            title="Drive"
            subtitle={driveConnected ? (sourceFolderName ?? 'No folder') : 'Not connected'}
            isActive={driveConnected}
            actionLabel={driveConnected ? undefined : 'Connect'}
            onAction={() => navigation.navigate('Drive')}
          />
          <InfoCard
            icon="printer"
            iconColor={printerReady ? Colors.active : Colors.textSecondary}
            title="Printer"
            subtitle={printerLabel}
            isActive={printerReady}
            actionLabel={printerReady ? undefined : 'Setup'}
            onAction={() => navigation.navigate('Settings')}
          />
        </View>

        {/* ── Deferred Bills Banner ────────────────────────────────────── */}
        {deferredCount > 0 && (
          <Pressable
            style={({pressed}) => [styles.deferredBanner, pressed && {opacity: 0.85}]}
            onPress={() => navigation.navigate('Queue')}>
            <View style={styles.deferredBannerLeft}>
              <Icon name="clock-alert-outline" size={22} color={Colors.warning} />
              <View style={styles.deferredBannerText}>
                <Text style={styles.deferredBannerTitle}>
                  {deferredCount} Bill{deferredCount !== 1 ? 's' : ''} Waiting for Your Action
                </Text>
                <Text style={styles.deferredBannerSub}>
                  You tapped "Later" — tap here to print them now.
                </Text>
              </View>
            </View>
            <Icon name="chevron-right" size={18} color={Colors.warning} />
          </Pressable>
        )}

        {/* ── Summary Metrics ──────────────────────────────────────────── */}
        <View style={styles.metricsRow}>
          <MetricTile
            icon="clock-outline"
            accentColor={pendingCount > 0 ? Colors.warning : Colors.textTertiary}
            label="Bills Waiting"
            value={pendingCount}
            onPress={() => navigation.navigate('Queue')}
          />
          <MetricTile
            icon="check-circle-outline"
            accentColor={Colors.active}
            label="Printed Today"
            value={printedTodayCount}
            onPress={() => navigation.navigate('History')}
          />
          {failedCount > 0 && (
            <MetricTile
              icon="alert-circle-outline"
              accentColor={Colors.error}
              label="Failed"
              value={failedCount}
              onPress={() => navigation.navigate('Queue')}
            />
          )}
        </View>

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <View style={styles.quickActionsRow}>
          <Pressable
            style={({pressed}) => [styles.quickAction, pressed && {opacity: 0.8}]}
            onPress={() => navigation.navigate('Queue')}>
            <View style={[styles.quickActionIcon, {backgroundColor: `${Colors.primary}18`}]}>
              <Icon name="printer-outline" size={22} color={Colors.primary} />
            </View>
            <Text style={styles.quickActionLabel}>Print Queue</Text>
            {pendingCount > 0 && (
              <View style={styles.quickActionBadge}>
                <Text style={styles.quickActionBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={({pressed}) => [styles.quickAction, pressed && {opacity: 0.8}]}
            onPress={() => navigation.navigate('History')}>
            <View style={[styles.quickActionIcon, {backgroundColor: `${Colors.active}18`}]}>
              <Icon name="history" size={22} color={Colors.active} />
            </View>
            <Text style={styles.quickActionLabel}>History</Text>
          </Pressable>

          <Pressable
            style={({pressed}) => [styles.quickAction, pressed && {opacity: 0.8}]}
            onPress={() => navigation.navigate('Drive')}>
            <View style={[styles.quickActionIcon, {backgroundColor: '#4285F418'}]}>
              <Icon name="google-drive" size={22} color="#4285F4" />
            </View>
            <Text style={styles.quickActionLabel}>Drive</Text>
          </Pressable>
        </View>

        {/* ── Recent Bills ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Bills</Text>
            {printedItems.length > 0 && (
              <Pressable onPress={() => navigation.navigate('History')} hitSlop={8}>
                <Text style={styles.sectionLink}>View all</Text>
              </Pressable>
            )}
          </View>

          {recentItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="receipt-outline" size={36} color={Colors.inactive} />
              <Text style={styles.emptyTitle}>No bills printed yet</Text>
              <Text style={styles.emptyDesc}>
                Printed receipts will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.recentList}>
              {recentItems.map((item, idx) => (
                <View
                  key={item.identity}
                  style={[
                    styles.recentRow,
                    idx < recentItems.length - 1 && styles.recentRowDivider,
                  ]}>
                  <View style={styles.recentRowLeft}>
                    <View style={styles.recentRowIconWrap}>
                      <Icon name="receipt" size={16} color={Colors.active} />
                    </View>
                    <View style={styles.recentRowBody}>
                      <Text style={styles.recentRowTitle} numberOfLines={1}>
                        {item.receipt.transactionType} {item.receipt.transactionNumber}
                      </Text>
                      <Text style={styles.recentRowSub} numberOfLines={1}>
                        {item.receipt.customer.name || 'N/A'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recentRowRight}>
                    <Text style={styles.recentRowAmount}>
                      {item.receipt.financials.total}
                    </Text>
                    <Text style={styles.recentRowTime}>
                      {item.completedAt
                        ? new Date(item.completedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
                        : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  greetingText: {
    ...Typography.headline,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  businessText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  settingsBtn: {
    padding: Spacing.sm,
  },

  // Monitoring card
  monitoringCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  monitoringCardActive: {
    borderColor: `${Colors.active}40`,
    backgroundColor: `${Colors.active}08`,
  },
  monitoringCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  monitoringIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.inactive}18`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  monitoringIconActive: {
    backgroundColor: `${Colors.active}18`,
  },
  monitoringBody: {
    flex: 1,
    gap: 4,
  },
  monitoringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.active,
  },
  liveIndicatorOff: {
    backgroundColor: Colors.inactive,
  },
  monitoringTitle: {
    ...Typography.bodyMedium,
    color: Colors.active,
    fontWeight: '700',
  },
  monitoringTitleOff: {
    color: Colors.textSecondary,
  },
  monitoringSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  monitoringActionBtn: {
    backgroundColor: `${Colors.primary}20`,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.primary}40`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  monitoringActionText: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontWeight: '700',
  },

  // Status grid
  statusGrid: {
    gap: Spacing.sm,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  infoCardInactive: {
    opacity: 0.85,
  },
  infoCardIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoCardBody: {
    flex: 1,
    gap: 3,
  },
  infoCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  infoCardTitle: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  infoCardAction: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
  },
  infoCardActionText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
  },

  // Deferred banner
  deferredBanner: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.warning}50`,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  deferredBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  deferredBannerText: {
    flex: 1,
    gap: 3,
  },
  deferredBannerTitle: {
    ...Typography.bodyMedium,
    color: Colors.warning,
    fontWeight: '700',
  },
  deferredBannerSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricTile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    ...Shadow.sm,
  },
  metricTilePressed: {
    opacity: 0.8,
  },
  metricTileIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  metricLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },

  // Quick actions
  quickActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.sm,
    position: 'relative',
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  quickActionBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.warning,
    borderRadius: BorderRadius.full,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionBadgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },

  // Section
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  sectionLink: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  emptyTitle: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  emptyDesc: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Recent bills
  recentList: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  recentRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  recentRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  recentRowIconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    backgroundColor: `${Colors.active}14`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recentRowBody: {
    flex: 1,
    gap: 3,
  },
  recentRowTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  recentRowSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  recentRowRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  recentRowAmount: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  recentRowTime: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontSize: 11,
  },

  bottomPad: {
    height: Spacing.xl,
  },
});
