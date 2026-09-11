import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../theme';
import { useAppStore } from '../../store/useAppStore';
import type { QueueItem, CsvProgress } from '../../store/useAppStore';

export default function HistoryScreen() {
  const queue = useAppStore(s => s.queue);
  const csvProgress = useAppStore(s => s.csvProgress);
  const retryArchive = useAppStore(s => s.retryArchive);
  const clearHistory = useAppStore(s => s.clearHistory);

  const [tab, setTab] = useState<'receipts' | 'archives'>('receipts');

  const printedItems = queue.filter(q => q.status === 'PRINTED').reverse();
  
  const csvProgressList = Object.values(csvProgress).sort((a, b) => {
    // Show failed first, then pending, then archived
    const getOrder = (s: string) => s === 'FAILED' ? 0 : s === 'PENDING' ? 1 : 2;
    return getOrder(a.archiveStatus) - getOrder(b.archiveStatus);
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerArea}>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, tab === 'receipts' && styles.tabBtnActive]}
            onPress={() => setTab('receipts')}>
            <Text style={[styles.tabText, tab === 'receipts' && styles.tabTextActive]}>
              Printed ({printedItems.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === 'archives' && styles.tabBtnActive]}
            onPress={() => setTab('archives')}>
            <Text style={[styles.tabText, tab === 'archives' && styles.tabTextActive]}>
              Archives ({csvProgressList.length})
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
          onPress={clearHistory}>
          <Icon name="delete-outline" size={18} color={Colors.error} />
          <Text style={styles.clearBtnText}>Clear History</Text>
        </Pressable>
      </View>

      {tab === 'receipts' ? (
        <FlatList
          data={printedItems}
          keyExtractor={item => item.identity}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <HistoryItemRow item={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="history" size={48} color={Colors.inactive} />
              <Text style={styles.emptyTitle}>No printed history</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={csvProgressList}
          keyExtractor={item => item.driveFileId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ArchiveProgressRow item={item} onRetry={() => retryArchive(item.driveFileId)} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="folder-outline" size={48} color={Colors.inactive} />
              <Text style={styles.emptyTitle}>No archive history</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function HistoryItemRow({ item }: { item: QueueItem }) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleRow}>
          <Icon name="check-circle" size={18} color={Colors.active} />
          <Text style={styles.itemTitle}>
            {item.receipt.transactionType} {item.receipt.transactionNumber}
          </Text>
        </View>
      </View>
      <Text style={styles.itemDetails}>
        Customer: {item.receipt.customer.name || 'N/A'} {'\n'}
        Amount: {item.receipt.financials.total}
      </Text>
      <Text style={styles.itemDate}>
        Printed at: {item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Unknown'}
      </Text>
    </View>
  );
}

function ArchiveProgressRow({ item, onRetry }: { item: CsvProgress; onRetry: () => void }) {
  const isFailed = item.archiveStatus === 'FAILED';
  const isPending = item.archiveStatus === 'PENDING';

  return (
    <View style={[styles.itemCard, isFailed && styles.itemCardFailed]}>
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleRow}>
          <Icon
            name={isFailed ? 'alert-circle' : isPending ? 'clock-outline' : 'check-circle'}
            size={18}
            color={isFailed ? Colors.error : isPending ? Colors.textSecondary : Colors.active}
          />
          <Text style={styles.itemTitle} numberOfLines={1}>
            Drive File: {item.driveFileId.slice(0, 8)}...
          </Text>
        </View>
        <Text style={[styles.itemStatus, isFailed && styles.itemStatusFailed, !isFailed && !isPending && styles.itemStatusSuccess]}>
          {item.archiveStatus}
        </Text>
      </View>
      <Text style={styles.itemDetails}>
        Printed: {item.printedCount} / {item.expectedCount} transactions
      </Text>
      
      {isFailed && item.archiveError && (
        <Text style={styles.itemError}>{item.archiveError}</Text>
      )}

      {isFailed && (
        <Pressable
          style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          onPress={onRetry}>
          <Icon name="refresh" size={16} color={Colors.error} />
          <Text style={styles.retryBtnText}>Retry Archive</Text>
        </Pressable>
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm - 2,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.errorDim,
    backgroundColor: `${Colors.error}11`,
  },
  clearBtnText: {
    ...Typography.captionMedium,
    color: Colors.error,
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
    flex: 1,
  },
  itemTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
  },
  itemStatus: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  itemStatusFailed: {
    color: Colors.error,
  },
  itemStatusSuccess: {
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
    marginBottom: Spacing.sm,
  },
  itemDate: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: Spacing.xs,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: `${Colors.error}55`,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },
  retryBtnText: {
    ...Typography.captionMedium,
    color: Colors.error,
  },
  pressed: {
    opacity: 0.75,
  },
});
