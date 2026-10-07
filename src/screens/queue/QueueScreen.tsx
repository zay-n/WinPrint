import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../theme';
import { useAppStore } from '../../store/useAppStore';
import type { QueueItem } from '../../store/useAppStore';

export default function QueueScreen() {
  const queue = useAppStore(s => s.queue);
  const processQueue = useAppStore(s => s.processQueue);
  const retryFailedPrints = useAppStore(s => s.retryFailedPrints);
  const printLoading = useAppStore(s => s.printLoading);
  const selectedPrinterType = useAppStore(s => s.selectedPrinterType);

  // Deferred bills state
  const deferredFileIds = useAppStore(s => s.deferredFileIds);
  const deferredLoadingId = useAppStore(s => s.deferredLoadingId);
  const deferredError = useAppStore(s => s.deferredError);
  const clearDeferredError = useAppStore(s => s.clearDeferredError);
  const enqueueDeferredFile = useAppStore(s => s.enqueueDeferredFile);
  const enqueueAllDeferredFiles = useAppStore(s => s.enqueueAllDeferredFiles);

  const activeQueue = queue.filter(q => q.status !== 'PRINTED');
  const failedCount = activeQueue.filter(q => q.status === 'FAILED').length;
  const queuedCount = activeQueue.filter(q => q.status === 'QUEUED').length;
  const deferredCount = deferredFileIds.length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerArea}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Waiting</Text>
            <Text style={styles.statValue}>{queuedCount}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Pending Action</Text>
            <Text style={[styles.statValue, deferredCount > 0 && { color: Colors.warning }]}>
              {deferredCount}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Failed</Text>
            <Text style={[styles.statValue, failedCount > 0 && { color: Colors.error }]}>
              {failedCount}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              (queuedCount === 0 || printLoading) && styles.actionBtnDisabled,
              pressed && styles.actionBtnPressed,
            ]}
            disabled={queuedCount === 0 || printLoading}
            onPress={processQueue}>
            {printLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon name="printer-outline" size={18} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>
              Process Queue ({selectedPrinterType === 'office' ? 'Office' : 'Thermal'})
            </Text>
          </Pressable>

          {failedCount > 0 && (
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && styles.actionBtnPressed]}
              onPress={retryFailedPrints}>
              <Icon name="refresh" size={18} color={Colors.error} />
              <Text style={styles.retryBtnText}>Retry Failed</Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={activeQueue.slice().reverse()}
        keyExtractor={item => item.identity}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          deferredCount > 0 ? (
            <View style={styles.deferredSection}>
              <View style={styles.deferredSectionHeader}>
                <View style={styles.deferredHeaderTitleRow}>
                  <Icon name="clock-outline" size={18} color={Colors.warning} />
                  <Text style={styles.deferredSectionTitle}>
                    Bills Waiting for Action ({deferredCount})
                  </Text>
                </View>
                {deferredCount > 1 && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.enqueueAllBtn,
                      Boolean(deferredLoadingId) && styles.actionBtnDisabled,
                      pressed && styles.actionBtnPressed,
                    ]}
                    disabled={Boolean(deferredLoadingId)}
                    onPress={enqueueAllDeferredFiles}>
                    <Text style={styles.enqueueAllBtnText}>Enqueue All</Text>
                  </Pressable>
                )}
              </View>

              {deferredError ? (
                <View style={styles.deferredErrorBanner}>
                  <Icon name="alert-circle" size={16} color={Colors.error} />
                  <Text style={styles.deferredErrorText}>{deferredError}</Text>
                  <Pressable onPress={clearDeferredError} hitSlop={8}>
                    <Icon name="close" size={16} color={Colors.error} />
                  </Pressable>
                </View>
              ) : null}

              {deferredFileIds.map(entry => {
                const parts = entry.split('::');
                const fileId = parts[0];
                const fileName = parts[2];
                const isEnqueuing = deferredLoadingId === entry;

                return (
                  <View key={entry} style={styles.deferredCard}>
                    <View style={styles.deferredCardContent}>
                      <View style={styles.deferredCardHeader}>
                        <Text style={styles.deferredCardTitle} numberOfLines={1}>
                          {fileName || 'Winsoft Bill CSV'}
                        </Text>
                        <View style={styles.deferredBadge}>
                          <Text style={styles.deferredBadgeText}>WAITING</Text>
                        </View>
                      </View>
                      <Text style={styles.deferredCardSubtitle} numberOfLines={1}>
                        Saved for later — tap Enqueue to print
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.enqueueBtn,
                        isEnqueuing && styles.actionBtnDisabled,
                        pressed && styles.actionBtnPressed,
                      ]}
                      disabled={Boolean(deferredLoadingId)}
                      onPress={() => void enqueueDeferredFile(entry)}>
                      {isEnqueuing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Icon name="tray-arrow-down" size={16} color="#fff" />
                      )}
                      <Text style={styles.enqueueBtnText}>
                        {isEnqueuing ? 'Enqueuing...' : 'Enqueue'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}

              {activeQueue.length > 0 && (
                <View style={styles.activeQueueSubheader}>
                  <Text style={styles.activeQueueSubheaderText}>
                    Active Print Queue ({activeQueue.length})
                  </Text>
                </View>
              )}
            </View>
          ) : undefined
        }
        renderItem={({ item }) => <QueueItemRow item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="inbox-outline" size={48} color={Colors.inactive} />
            <Text style={styles.emptyTitle}>
              {deferredCount > 0 ? 'No active items in queue' : 'Queue is empty'}
            </Text>
            <Text style={styles.emptyDesc}>
              {deferredCount > 0
                ? 'Tap "Enqueue" on a deferred bill above to prepare it for printing.'
                : 'Parse a CSV and enqueue transactions to print.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function QueueItemRow({ item }: { item: QueueItem }) {
  const isFailed = item.status === 'FAILED';
  const isPrinting = item.status === 'PRINTING';
  const statusLabel = isFailed ? 'Print failed' : isPrinting ? 'Printing...' : 'Waiting to print';
  const statusColor = isFailed ? Colors.error : isPrinting ? Colors.active : Colors.textSecondary;

  return (
    <View style={[styles.itemCard, isFailed && styles.itemCardFailed, isPrinting && styles.itemCardPrinting]}>
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleRow}>
          <Icon
            name={isFailed ? 'alert-circle' : isPrinting ? 'printer-sync' : 'clock-outline'}
            size={18}
            color={isFailed ? Colors.error : isPrinting ? Colors.active : Colors.textSecondary}
          />
          <Text style={styles.itemTitle}>
            {item.receipt.transactionType} {item.receipt.transactionNumber}
          </Text>
        </View>
        <Text style={[styles.itemStatus, {color: statusColor}]}>
          {statusLabel}
        </Text>
      </View>
      <Text style={styles.itemDetails}>
        Customer: {item.receipt.customer.name || 'N/A'} {'\n'}
        Amount: {item.receipt.financials.total}
      </Text>
      {item.error ? (
        <Text style={styles.itemError}>{item.error}</Text>
      ) : null}
      <Text style={styles.itemDate}>
        Queued at: {new Date(item.queuedAt).toLocaleTimeString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerArea: {
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  statLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  statValue: {
    ...Typography.title,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    ...Shadow.sm,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.inactive,
  },
  actionBtnPressed: {
    opacity: 0.8,
  },
  actionBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '600',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.errorDim,
    borderWidth: 1,
    borderColor: `${Colors.error}55`,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  retryBtnText: {
    ...Typography.bodyMedium,
    color: Colors.error,
    fontWeight: '600',
  },
  listContent: {
    padding: Spacing.base,
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl,
    gap: Spacing.sm,
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
  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  itemCardFailed: {
    borderColor: `${Colors.error}55`,
    backgroundColor: Colors.errorDim,
  },
  itemCardPrinting: {
    borderColor: `${Colors.active}55`,
    backgroundColor: `${Colors.active}11`,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  itemTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  itemStatus: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  itemStatusFailed: {
    color: Colors.error,
  },
  itemStatusPrinting: {
    color: Colors.active,
  },
  itemDetails: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  itemError: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  itemDate: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: Spacing.xs,
  },
  deferredSection: {
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  deferredSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  deferredHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  deferredSectionTitle: {
    ...Typography.bodyMedium,
    color: Colors.warning,
    fontWeight: '700',
  },
  enqueueAllBtn: {
    backgroundColor: Colors.warningDim,
    borderWidth: 1,
    borderColor: `${Colors.warning}66`,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  enqueueAllBtnText: {
    ...Typography.captionMedium,
    color: Colors.warning,
    fontWeight: '600',
  },
  deferredErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.errorDim,
    borderWidth: 1,
    borderColor: `${Colors.error}55`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  deferredErrorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  deferredCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.warning}44`,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  deferredCardContent: {
    flex: 1,
    gap: 2,
  },
  deferredCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  deferredCardTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  deferredBadge: {
    backgroundColor: Colors.warningDim,
    borderWidth: 1,
    borderColor: `${Colors.warning}66`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  deferredBadgeText: {
    ...Typography.caption,
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  deferredCardSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 11,
  },
  enqueueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  enqueueBtnText: {
    ...Typography.captionMedium,
    color: '#fff',
    fontWeight: '600',
  },
  activeQueueSubheader: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.xs,
  },
  activeQueueSubheaderText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
});
