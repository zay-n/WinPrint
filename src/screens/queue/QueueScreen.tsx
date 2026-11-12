import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import Checkbox from '../../components/Checkbox';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../theme';
import { useAppStore } from '../../store/useAppStore';
import type { QueueItem } from '../../store/useAppStore';

export default function QueueScreen() {
  const queue = useAppStore(s => s.queue);
  const processQueue = useAppStore(s => s.processQueue);
  const retryFailedPrints = useAppStore(s => s.retryFailedPrints);
  const cancelQueueItem = useAppStore(s => s.cancelQueueItem);
  const printLoading = useAppStore(s => s.printLoading);
  const selectedPrinterType = useAppStore(s => s.selectedPrinterType);

  // Deferred bills state
  const deferredFileIds = useAppStore(s => s.deferredFileIds);
  const deferredLoadingId = useAppStore(s => s.deferredLoadingId);
  const deferredError = useAppStore(s => s.deferredError);
  const clearDeferredError = useAppStore(s => s.clearDeferredError);
  const enqueueDeferredFile = useAppStore(s => s.enqueueDeferredFile);
  const enqueueAllDeferredFiles = useAppStore(s => s.enqueueAllDeferredFiles);

  const activeQueue = queue.filter(q => q.status !== 'PRINTED' && q.status !== 'CANCELLED');
  const failedCount = activeQueue.filter(q => q.status === 'FAILED').length;
  const queuedCount = activeQueue.filter(q => q.status === 'QUEUED').length;
  const deferredCount = deferredFileIds.length;

  // ── Receipt selection (only receipts waiting to print can be selected) ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queuedIds = activeQueue.filter(q => q.status === 'QUEUED').map(q => q.identity);
  const selectedIds = queuedIds.filter(id => selected.has(id));
  const allSelected = queuedIds.length > 0 && selectedIds.length === queuedIds.length;
  // One print run at a time: no second job while anything is printing.
  const printBusy = printLoading || queue.some(q => q.status === 'PRINTING');

  const toggle = (identity: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(identity)) next.delete(identity); else next.add(identity);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(queuedIds));

  const plural = (n: number) => `${n} receipt${n === 1 ? '' : 's'}`;
  const printerLabel = selectedPrinterType === 'office' ? 'Office' : 'Thermal';

  const confirmPrint = (ids: string[], title: string) => {
    if (printBusy) return;
    if (ids.length === 0) {
      Alert.alert('No receipts selected', 'Tick the receipts you want to print, or use Print All.');
      return;
    }
    Alert.alert(title, `${plural(ids.length)} will be sent to the ${printerLabel} printer, one after another.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Print', onPress: () => {
          setSelected(new Set());
          void processQueue(ids);
        },
      },
    ]);
  };

  const printOne = (identity: string) => {
    if (printBusy) return;
    void processQueue([identity]);
  };

  const retryOne = (identity: string) => {
    if (printBusy) return;
    retryFailedPrints([identity]);
    void processQueue([identity]);
  };

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
              (selectedIds.length === 0 || printBusy) && styles.actionBtnDisabled,
              pressed && styles.actionBtnPressed,
            ]}
            disabled={printBusy}
            accessibilityRole="button"
            accessibilityLabel={`Print Selected (${selectedIds.length})`}
            onPress={() => confirmPrint(selectedIds, 'Print selected receipts?')}>
            {printBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon name="printer-outline" size={18} color="#fff" />
            )}
            <Text style={styles.actionBtnText}>
              {printBusy ? 'Printing…' : `Print Selected (${selectedIds.length})`}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.printAllBtn,
              (queuedCount === 0 || printBusy) && styles.outlineDisabled,
              pressed && styles.actionBtnPressed,
            ]}
            disabled={queuedCount === 0 || printBusy}
            accessibilityRole="button"
            accessibilityLabel={`Print All (${queuedCount})`}
            onPress={() => confirmPrint(queuedIds, 'Print all waiting receipts?')}>
            <Text style={styles.printAllText}>Print All ({queuedCount})</Text>
          </Pressable>
        </View>

        <View style={styles.selectionRow}>
          {queuedIds.length > 0 ? (
            <Pressable onPress={toggleAll} hitSlop={8} accessibilityRole="button">
              <Text style={styles.selectAllText}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
            </Pressable>
          ) : <View />}
          <Text style={styles.selectionCount}>
            {selectedIds.length} of {queuedIds.length} selected · {printerLabel} printer
          </Text>
          {failedCount > 0 && (
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && styles.actionBtnPressed]}
              accessibilityRole="button"
              onPress={() => retryFailedPrints()}>
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
        renderItem={({ item }) => (
          <QueueItemRow
            item={item}
            cancelQueueItem={cancelQueueItem}
            selected={selected.has(item.identity)}
            onToggle={() => toggle(item.identity)}
            onPrint={() => printOne(item.identity)}
            onRetry={() => retryOne(item.identity)}
            printBusy={printBusy}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="inbox-outline" size={48} color={Colors.inactive} />
            <Text style={styles.emptyTitle}>
              {deferredCount > 0 ? 'No active items in queue' : 'Queue is empty'}
            </Text>
            <Text style={styles.emptyDesc}>
              {deferredCount > 0
                ? 'Tap "Enqueue" on a deferred bill above to prepare it for printing.'
                : 'Tap Process CSV on the Drive tab to add receipts here.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function QueueItemRow({
  item, cancelQueueItem, selected, onToggle, onPrint, onRetry, printBusy,
}: {
  item: QueueItem;
  cancelQueueItem: (identity: string) => boolean;
  selected: boolean;
  onToggle: () => void;
  onPrint: () => void;
  onRetry: () => void;
  printBusy: boolean;
}) {
  const isQueued = item.status === 'QUEUED';
  const isFailed = item.status === 'FAILED';
  const isPrinting = item.status === 'PRINTING';
  const statusLabel = isFailed ? 'Print failed' : isPrinting ? 'Printing...' : 'Waiting to print';
  const statusColor = isFailed ? Colors.error : isPrinting ? Colors.active : Colors.textSecondary;

  return (
    <View style={[styles.itemCard, isFailed && styles.itemCardFailed, isPrinting && styles.itemCardPrinting]}>
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleRow}>
          {isQueued ? (
            <Checkbox
              checked={selected}
              onToggle={onToggle}
              label={`Select receipt ${item.receipt.transactionType} ${item.receipt.transactionNumber}`}
            />
          ) : (
            <Icon
              name={isFailed ? 'alert-circle-outline' : 'printer-outline'}
              size={18}
              color={isFailed ? Colors.error : Colors.active}
            />
          )}
          <Text style={styles.itemTitle}>
            {item.receipt.transactionType} {item.receipt.transactionNumber}
          </Text>
        </View>
        <Text style={[styles.itemStatus, { color: statusColor }]}>
          {statusLabel}
        </Text>
      </View>
      <Text style={styles.itemDetails}>
        Customer: {item.receipt.customer?.name || 'N/A'} {'\n'}
        Amount: {item.receipt.financials?.total ?? '—'}
      </Text>
      {item.error ? (
        <Text style={styles.itemError}>{item.error}</Text>
      ) : null}
      <Text style={styles.itemDate}>
        Queued at: {new Date(item.queuedAt).toLocaleTimeString()}
      </Text>
      {isQueued && (
        <View style={styles.rowActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel receipt ${item.receipt.transactionNumber}`}
            style={({ pressed }) => [styles.cancelQueueBtn, pressed && styles.actionBtnPressed]}
            onPress={() => Alert.alert(
              'Cancel queued receipt?',
              'This receipt will be removed from the print queue. Its source CSV will remain in Incoming.',
              [
                { text: 'Keep queued', style: 'cancel' },
                {
                  text: 'Cancel receipt', style: 'destructive', onPress: () => {
                    if (!cancelQueueItem(item.identity)) {
                      Alert.alert('Printing already started', 'Cancellation is unavailable after printing begins.');
                    }
                  }
                },
              ],
            )}>
            <Text style={styles.cancelQueueText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Print receipt ${item.receipt.transactionNumber}`}
            disabled={printBusy}
            style={({ pressed }) => [styles.rowPrintBtn, printBusy && styles.actionBtnDisabled, pressed && styles.actionBtnPressed]}
            onPress={onPrint}>
            <Icon name="printer-outline" size={16} color="#fff" />
            <Text style={styles.rowPrintText}>Print</Text>
          </Pressable>
        </View>
      )}
      {isFailed && (
        <View style={styles.rowActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry receipt ${item.receipt.transactionNumber}`}
            disabled={printBusy}
            style={({ pressed }) => [styles.rowPrintBtn, printBusy && styles.actionBtnDisabled, pressed && styles.actionBtnPressed]}
            onPress={onRetry}>
            <Icon name="printer-outline" size={16} color="#fff" />
            <Text style={styles.rowPrintText}>Retry</Text>
          </Pressable>
        </View>
      )}
      {isPrinting && <Text style={styles.itemError}>Printing has started; cancellation is unavailable.</Text>}
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
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  retryBtnText: {
    ...Typography.bodyMedium,
    color: Colors.error,
    fontWeight: '600',
  },
  printAllBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.primary}88`,
  },
  printAllText: { ...Typography.bodyMedium, color: Colors.primaryLight, fontWeight: '600' },
  outlineDisabled: { opacity: 0.4 },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  selectAllText: { ...Typography.captionMedium, color: Colors.primaryLight },
  selectionCount: { ...Typography.caption, color: Colors.textSecondary, flex: 1, textAlign: 'center' },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  rowPrintBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
  },
  rowPrintText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '600' },
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
  cancelQueueBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.borderLight },
  cancelQueueText: { ...Typography.bodyMedium, color: Colors.error, fontWeight: '600' },
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
