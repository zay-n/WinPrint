/**
 * Transaction Details for a stored (queued or printed) receipt.
 *
 * Reads the persisted queue item by identity. Viewing is strictly read-only:
 * nothing is parsed, enqueued, printed or archived by opening this screen.
 * Reprint is a separate, explicit action that goes through the existing
 * reprintReceipt workflow (same as the History list), so its busy-printer
 * and duplicate protections apply and queue/archive state is untouched.
 */

import React, {useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import {useAppStore} from '../../store/useAppStore';
import {RECEIPT_STATUS_LABEL} from '../../store/driveWorkflow';
import {BorderRadius, Colors, Shadow, Spacing, Typography} from '../../theme';
import {
  DetailSection,
  KeyValueRows,
  ReceiptDetails,
  TransactionHeader,
} from '../drive/TransactionDetailScreen';

type Props = {route: {params: {identity: string}}};

const formatTime = (ms?: number) => (ms ? new Date(ms).toLocaleString() : undefined);

export default function ReceiptDetailScreen({route}: Props) {
  const item = useAppStore(s => s.queue.find(q => q.identity === route.params.identity));
  const archive = useAppStore(s => {
    const fileId = item?.receipt?.sourceFile?.driveFileId;
    return fileId ? s.csvProgress[fileId] : undefined;
  });
  const reprintReceipt = useAppStore(s => s.reprintReceipt);
  const attempts = useAppStore(s => s.reprintHistory).filter(a => a.identity === route.params.identity);
  const [printLoading, setPrintLoading] = useState(false);
  const [reprintMessage, setReprintMessage] = useState<{ok: boolean; text: string} | null>(null);

  if (!item || !item.receipt) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.missing}>
          <Icon name="receipt" size={32} color={Colors.inactive} />
          <Text style={styles.missingTitle}>Details unavailable</Text>
          <Text style={styles.missingText}>
            This record is no longer stored on this device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const {receipt} = item;
  const printed = item.status === 'PRINTED';

  const reprint = async () => {
    setReprintMessage(null);
    setPrintLoading(true);
    try {
      const result = await reprintReceipt(item.identity);
      setReprintMessage(
        result.success
          ? {ok: true, text: 'The saved receipt was sent to the selected printer.'}
          : {ok: false, text: result.error || 'The printer could not print this receipt.'},
      );
    } finally {
      setPrintLoading(false);
    }
  };

  const confirmReprint = () =>
    Alert.alert(
      'Reprint receipt?',
      `${receipt.transactionType} ${receipt.transactionNumber}${receipt.customer?.name ? ` for ${receipt.customer.name}` : ''}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Reprint', onPress: () => void reprint()},
      ],
    );

  const archiveLabel = archive
    ? archive.archiveStatus === 'ARCHIVED'
      ? 'Moved to Printed folder'
      : archive.archiveStatus === 'FAILED'
        ? 'Not moved yet (archive pending)'
        : archive.printedCount >= archive.expectedCount
          ? 'Moving to Printed folder'
          : 'In Incoming folder'
    : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TransactionHeader receipt={receipt} eyebrow="TRANSACTION DETAILS" />

        {printed ? (
          <Pressable
            onPress={confirmReprint}
            disabled={printLoading}
            style={({pressed}) => [styles.reprintBtn, (pressed || printLoading) && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Reprint receipt">
            {printLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Icon name="printer-outline" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.reprintText}>{printLoading ? 'Reprinting…' : 'Reprint'}</Text>
          </Pressable>
        ) : null}

        {reprintMessage ? (
          <View style={[styles.notice, !reprintMessage.ok && styles.noticeError]}>
            <Icon
              name={reprintMessage.ok ? 'check-circle-outline' : 'alert-circle-outline'}
              size={18}
              color={reprintMessage.ok ? Colors.active : Colors.error}
            />
            <Text style={[styles.noticeText, !reprintMessage.ok && styles.noticeTextError]}>
              {reprintMessage.text}
            </Text>
          </View>
        ) : null}

        <DetailSection title="Print Status">
          <KeyValueRows
            rows={[
              ['Status', RECEIPT_STATUS_LABEL[item.status] ?? item.status],
              ['Printed', printed ? formatTime(item.completedAt) : undefined],
              ['Added to Queue', formatTime(item.queuedAt)],
              ['Print Error', item.status === 'FAILED' ? item.error : undefined],
              ['Reprints', attempts.length > 0 ? String(attempts.length) : undefined],
              [
                'Latest Reprint',
                attempts.length > 0
                  ? `${attempts[attempts.length - 1].success ? 'Succeeded' : 'Failed'} · ${formatTime(attempts[attempts.length - 1].attemptedAt)}`
                  : undefined,
              ],
              ['CSV File', archiveLabel],
            ]}
          />
        </DetailSection>

        <ReceiptDetails receipt={receipt} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxl},
  reprintBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadow.sm,
  },
  reprintText: {...Typography.bodyMedium, color: '#FFFFFF', fontWeight: '600'},
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: `${Colors.active}18`,
    borderColor: `${Colors.active}55`, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  noticeError: {backgroundColor: Colors.errorDim, borderColor: `${Colors.error}55`},
  noticeText: {...Typography.caption, color: Colors.active, flex: 1},
  noticeTextError: {color: Colors.error},
  pressed: {opacity: 0.75},
  missing: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl, gap: Spacing.sm},
  missingTitle: {...Typography.title, color: Colors.textPrimary, marginTop: Spacing.sm},
  missingText: {...Typography.body, color: Colors.textSecondary, textAlign: 'center'},
});
