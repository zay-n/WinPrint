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

  const activeQueue = queue.filter(q => q.status !== 'PRINTED');
  const failedCount = activeQueue.filter(q => q.status === 'FAILED').length;
  const queuedCount = activeQueue.filter(q => q.status === 'QUEUED').length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerArea}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Queued</Text>
            <Text style={styles.statValue}>{queuedCount}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Failed</Text>
            <Text style={[styles.statValue, failedCount > 0 && { color: Colors.error }]}>{failedCount}</Text>
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
        renderItem={({ item }) => <QueueItemRow item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Icon name="inbox-outline" size={48} color={Colors.inactive} />
            <Text style={styles.emptyTitle}>Queue is empty</Text>
            <Text style={styles.emptyDesc}>
              Parse a CSV and enqueue transactions to print.
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
        <Text style={[styles.itemStatus, isFailed && styles.itemStatusFailed, isPrinting && styles.itemStatusPrinting]}>
          {item.status}
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
});
