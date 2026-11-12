/**
 * DriveScreen.tsx — Google Drive connection and folder selection
 *
 * Phase 2–4: Allows the user to:
 *  1. Sign in with Google
 *  2. Browse and select the Winsoft CSV source folder and Archive folder
 *  3. Incoming CSV Files — one-step "Process CSV" (download, parse, enqueue)
 *  4. Receipts Ready to Print — live status of extracted receipts
 *  5. Completed — CSVs printed and moved to the Printed folder
 *
 * State lives in useAppStore (Zustand).
 * State actions delegate to GoogleAuthService and DriveService.
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import DriveFolderPickerModal from '../../components/DriveFolderPickerModal';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';
import type {CsvProgress, EnqueueResult} from '../../store/useAppStore';
import {
  buildReceiptGroups,
  csvDisplayStatus,
  CSV_STATUS_LABEL,
  RECEIPT_STATUS_LABEL,
} from '../../store/driveWorkflow';
import type {CsvDisplayStatus, ReceiptGroup, ReceiptRow, ReceiptRowStatus} from '../../store/driveWorkflow';
import type {DriveFile} from '../../services/drive/DriveClient';
import type {DriveScreenProps} from '../../navigation/types';
import * as MonitoringService from '../../services/monitoring/MonitoringService';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function DriveScreen({navigation}: DriveScreenProps) {
  const user = useAppStore(s => s.user);
  const signInLoading = useAppStore(s => s.signInLoading);
  const signInError = useAppStore(s => s.signInError);
  const signIn = useAppStore(s => s.signIn);
  const signOut = useAppStore(s => s.signOut);

  const csvFiles = useAppStore(s => s.csvFiles);
  const csvLoading = useAppStore(s => s.csvLoading);
  const sourceFolderId = useAppStore(s => s.sourceFolderId);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);
  const sourceFolderPath = useAppStore(s => s.sourceFolderPath);
  const archiveFolderId = useAppStore(s => s.archiveFolderId);
  const archiveFolderName = useAppStore(s => s.archiveFolderName);
  const archiveFolderPath = useAppStore(s => s.archiveFolderPath);
  const driveError = useAppStore(s => s.driveError);
  const selectFolder = useAppStore(s => s.selectFolder);
  const selectArchiveFolder = useAppStore(s => s.selectArchiveFolder);
  const loadCsvFiles = useAppStore(s => s.loadCsvFiles);
  const loadArchiveFiles = useAppStore(s => s.loadArchiveFiles);
  const lastReconciliationAt = useAppStore(s => s.lastReconciliationAt);

  const receipts = useAppStore(s => s.receipts);
  const queue = useAppStore(s => s.queue);
  const csvProgress = useAppStore(s => s.csvProgress);
  const lastParsedFileId = useAppStore(s => s.lastParsedFileId);
  const archiveFiles = useAppStore(s => s.archiveFiles);
  const processCsv = useAppStore(s => s.processCsv);
  const enqueueReceipts = useAppStore(s => s.enqueueReceipts);
  const retryArchive = useAppStore(s => s.retryArchive);
  const processingFileId = useAppStore(s => s.processingFileId);
  const parseLoading = useAppStore(s => s.parseLoading);
  const csvError = useAppStore(s => s.csvError);

  const [pickerMode, setPickerMode] = useState<'source' | 'archive' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [refreshingFolder, setRefreshingFolder] = useState(false);

  // Automatically load CSV files when a source folder is configured
  useEffect(() => {
    if (user && sourceFolderId) {
      void loadCsvFiles();
    }
  }, [user, sourceFolderId, loadCsvFiles]);

  useEffect(() => {
    if (user && archiveFolderId) {
      void loadArchiveFiles();
    }
  }, [user, archiveFolderId, loadArchiveFiles]);

  // Existing refresh behaviour: reload the folder, then let monitoring queue
  // any new CSVs (nothing is printed). The Printed list is reloaded as well.
  const handleRefreshFolder = useCallback(async () => {
    if (refreshingFolder || csvLoading) return;
    setRefreshingFolder(true);
    try {
      await loadCsvFiles();
      const driveState = useAppStore.getState();
      if (driveState.driveNeedsReauth) {
        Alert.alert('Reconnect Google Drive', 'Google Drive authorization needs attention.', [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Settings', onPress: () => navigation.navigate('Settings')},
        ]);
        return;
      }
      if (driveState.driveError) throw new Error(driveState.driveError);
      const discovered = await MonitoringService.runReconciliation();
      const state = useAppStore.getState();
      if (state.driveNeedsReauth) {
        Alert.alert('Reconnect Google Drive', 'Google Drive authorization needs attention.', [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Settings', onPress: () => navigation.navigate('Settings')},
        ]);
        return;
      }
      if (state.lastMonitoringError) throw new Error(state.lastMonitoringError);
      void loadArchiveFiles();
      Alert.alert('Folder refreshed', discovered
        ? `${discovered} new receipt${discovered === 1 ? '' : 's'} added to the print queue. Nothing was printed.`
        : 'The Incoming folder is up to date. Nothing was printed.');
    } catch (error) {
      Alert.alert('Refresh failed', error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshingFolder(false);
    }
  }, [csvLoading, loadArchiveFiles, loadCsvFiles, navigation, refreshingFolder]);

  const groups = useMemo(
    () => buildReceiptGroups(queue, csvProgress, receipts, lastParsedFileId),
    [queue, csvProgress, receipts, lastParsedFileId],
  );
  const activeReceiptCount = groups.reduce(
    (n, g) => n + g.rows.filter(r => r.status !== 'PRINTED' && r.status !== 'CANCELLED').length,
    0,
  );
  const fileStatuses = useMemo(() => {
    const map: Record<string, CsvDisplayStatus> = {};
    csvFiles.forEach(f => {
      map[f.id] = csvDisplayStatus(f.id, queue, csvProgress, lastParsedFileId);
    });
    return map;
  }, [csvFiles, queue, csvProgress, lastParsedFileId]);
  // Completed CSVs never appear as incoming, even on a stale listing.
  const incomingFiles = csvFiles.filter(f => fileStatuses[f.id] !== 'COMPLETED');
  const waitingCount = incomingFiles.filter(
    f => fileStatuses[f.id] === 'NEW' || fileStatuses[f.id] === 'READY',
  ).length;
  const busy = Boolean(processingFileId) || parseLoading;

  const describeResult = (result: EnqueueResult) => {
    const plural = (n: number) => `${n} receipt${n === 1 ? '' : 's'}`;
    if (result.added === 0) {
      return `No new receipts added — all ${plural(result.total)} were already queued or printed.`;
    }
    return (
      `${plural(result.added)} added to the print queue.` +
      (result.skipped > 0 ? ` ${result.skipped} already queued or printed.` : '')
    );
  };

  const handleProcess = async (file: DriveFile) => {
    if (busy) return;
    setNotice(null);
    const result = await processCsv(file);
    if (result) setNotice(describeResult(result));
  };

  const handleAddToQueue = (group: ReceiptGroup) => {
    setNotice(describeResult(enqueueReceipts(group.notQueued)));
  };

  const handleRetryArchive = async (fileId: string) => {
    if (retryingId) return;
    setRetryingId(fileId);
    try {
      await retryArchive(fileId);
    } finally {
      setRetryingId(null);
    }
  };

  const openQueue = () => navigation.navigate('Queue');

  const openReceipt = (row: ReceiptRow) => {
    if (row.inQueue) {
      navigation.navigate('QueuedReceipt', {identity: row.identity});
    } else if (row.parsedIndex !== undefined) {
      navigation.navigate('TransactionDetail', {receiptIndex: row.parsedIndex});
    }
  };

  // ── Not signed in ─────────────────────────────────────────────────────────

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.statusBanner}>
            <View style={[styles.statusDot, styles.statusDotInactive]} />
            <View style={styles.statusBannerContent}>
              <Text style={styles.statusBannerTitle}>Not Connected</Text>
              <Text style={styles.statusBannerDesc}>
                Sign in with Google to connect Drive
              </Text>
            </View>
          </View>

          {signInError ? (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{signInError}</Text>
            </View>
          ) : null}

          <Pressable
            style={({pressed}) => [
              styles.signInButton,
              pressed && styles.signInButtonPressed,
            ]}
            onPress={signIn}
            disabled={signInLoading}
            accessibilityLabel="Sign in with Google">
            {signInLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="google" size={20} color="#fff" />
                <Text style={styles.signInButtonText}>Sign in with Google</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Signed in ─────────────────────────────────────────────────────────────

  const foldersReady = Boolean(sourceFolderId && archiveFolderId);
  const foldersCard = (
    <>
      <SectionHeading title="Drive Folders" />
      <View style={styles.card}>
        <FolderLine
          label="Incoming"
          name={sourceFolderName}
          path={sourceFolderPath}
          onPress={() => setPickerMode('source')}
        />
        <View style={styles.divider} />
        <FolderLine
          label="Printed"
          name={archiveFolderName}
          path={archiveFolderPath}
          onPress={() => setPickerMode('archive')}
        />
      </View>
    </>
  );
  const completedShown = showAllCompleted ? archiveFiles : archiveFiles.slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          sourceFolderId ? (
            <RefreshControl
              refreshing={refreshingFolder}
              onRefresh={() => void handleRefreshFolder()}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          ) : undefined
        }>

        {/* Connection status */}
        <View style={styles.statusBanner}>
          <View style={[styles.statusDot, styles.statusDotActive]} />
          <View style={styles.statusBannerContent}>
            <Text style={styles.statusBannerTitle}>Connected</Text>
            <Text style={styles.statusBannerDesc} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <Pressable onPress={signOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        {driveError ? (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={styles.errorText}>{driveError}</Text>
          </View>
        ) : null}

        {csvError ? (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle-outline" size={16} color={Colors.error} />
            <Text style={styles.errorText}>Could not process the CSV. {csvError}</Text>
          </View>
        ) : null}

        {notice ? (
          <View style={styles.noticeBanner}>
            <Icon name="check-circle-outline" size={18} color={Colors.active} />
            <Text style={styles.noticeText}>{notice}</Text>
            <Pressable
              onPress={openQueue}
              style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}
              accessibilityLabel="Open Print Queue">
              <Text style={styles.secondaryBtnText}>Open Print Queue</Text>
            </Pressable>
          </View>
        ) : null}

        {!foldersReady ? foldersCard : null}

        {sourceFolderId ? (
          <>
            {/* ── 1. Incoming CSV Files ── */}
            <SectionHeading
              title="Incoming CSV Files"
              subtitle={
                waitingCount > 0
                  ? `${waitingCount} file${waitingCount === 1 ? '' : 's'} waiting to be processed`
                  : 'No files waiting to be processed'
              }
              action={
                <Pressable
                  onPress={() => void handleRefreshFolder()}
                  disabled={refreshingFolder || csvLoading}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh Incoming folder">
                  {refreshingFolder || csvLoading ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.linkText}>Refresh</Text>
                  )}
                </Pressable>
              }
            />
            <Text style={styles.lastChecked}>
              Last checked: {lastReconciliationAt ? new Date(lastReconciliationAt).toLocaleString() : 'Not checked yet'}
            </Text>
            {csvLoading && incomingFiles.length === 0 ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.emptyText}>Checking for new files…</Text>
              </View>
            ) : incomingFiles.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="cloud-download-outline" size={28} color={Colors.inactive} />
                <Text style={styles.emptyTitle}>No incoming files</Text>
                <Text style={styles.emptyText}>
                  New CSV files in your Incoming folder will appear here.
                </Text>
              </View>
            ) : (
              incomingFiles.map(file => (
                <IncomingFileCard
                  key={file.id}
                  file={file}
                  status={fileStatuses[file.id]}
                  progress={csvProgress[file.id]}
                  processing={processingFileId === file.id}
                  disabled={busy}
                  retrying={retryingId === file.id}
                  onProcess={() => void handleProcess(file)}
                  onRetryArchive={() => void handleRetryArchive(file.id)}
                />
              ))
            )}

            {/* ── 2. Receipts Ready to Print ── */}
            <SectionHeading
              title="Receipts Ready to Print"
              subtitle={
                groups.length > 0
                  ? `${activeReceiptCount} receipt${activeReceiptCount === 1 ? '' : 's'} to print from ${groups.length} file${groups.length === 1 ? '' : 's'}`
                  : 'Nothing waiting to print'
              }
            />
            {groups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="receipt" size={28} color={Colors.inactive} />
                <Text style={styles.emptyText}>
                  Tap Process CSV on an incoming file. Its receipts will show here until they are printed.
                </Text>
              </View>
            ) : (
              groups.map(group => (
                <ReceiptGroupCard
                  key={group.fileId}
                  group={group}
                  retrying={retryingId === group.fileId}
                  onAddToQueue={() => handleAddToQueue(group)}
                  onOpenQueue={openQueue}
                  onRetryArchive={() => void handleRetryArchive(group.fileId)}
                  onOpenReceipt={openReceipt}
                />
              ))
            )}

            {/* ── 3. Completed ── */}
            {archiveFolderId ? (
              <>
                <SectionHeading
                  title="Completed"
                  subtitle={
                    archiveFiles.length > 0
                      ? `${archiveFiles.length} file${archiveFiles.length === 1 ? '' : 's'} printed and moved to the Printed folder`
                      : 'Printed files will be listed here'
                  }
                />
                {archiveFiles.length > 0 ? (
                  <View style={styles.card}>
                    {completedShown.map((f, i) => (
                      <View key={f.id} style={[styles.completedRow, i > 0 && styles.rowDivider]}>
                        <Icon name="file-check-outline" size={18} color={Colors.active} />
                        <Text style={styles.completedName} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.completedLabel}>Completed</Text>
                      </View>
                    ))}
                    {archiveFiles.length > 5 ? (
                      <Pressable
                        onPress={() => setShowAllCompleted(v => !v)}
                        style={[styles.completedRow, styles.rowDivider]}>
                        <Text style={styles.linkText}>
                          {showAllCompleted ? 'Show fewer' : `Show all ${archiveFiles.length}`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {foldersReady ? foldersCard : null}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── Nested Google Drive Folder Picker Modal ── */}
      <DriveFolderPickerModal
        visible={pickerMode !== null}
        title={pickerMode === 'archive' ? 'Select Printed Folder' : 'Select Incoming Folder'}
        initialFolderId={pickerMode === 'archive' ? archiveFolderId : sourceFolderId}
        initialFolderName={pickerMode === 'archive' ? archiveFolderName : sourceFolderName}
        onSelect={folder => {
          if (pickerMode === 'archive') {
            selectArchiveFolder(folder);
          } else {
            void selectFolder(folder);
          }
        }}
        onClose={() => setPickerMode(null)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<CsvDisplayStatus | ReceiptRowStatus, string> = {
  NEW: Colors.primaryLight,
  READY: Colors.primaryLight,
  QUEUED: Colors.warning,
  PRINTING: Colors.active,
  PRINT_FAILED: Colors.error,
  FAILED: Colors.error,
  CANCELLED: Colors.textTertiary,
  ARCHIVE_PENDING: Colors.warning,
  COMPLETED: Colors.active,
  PRINTED: Colors.active,
};

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function FolderLine({
  label,
  name,
  path,
  onPress,
}: {
  label: string;
  name: string | null;
  path: string | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.folderLine}>
      <Icon name="folder-google-drive" size={20} color={name ? Colors.primaryLight : Colors.inactive} />
      <View style={styles.flex}>
        <Text style={styles.folderLabel}>{label} folder</Text>
        <Text style={styles.folderName} numberOfLines={1}>
          {name ? path || name : 'Not selected'}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}
        accessibilityLabel={`${name ? 'Change' : 'Select'} ${label} folder`}>
        <Text style={styles.secondaryBtnText}>{name ? 'Change' : 'Select'}</Text>
      </Pressable>
    </View>
  );
}

function StatusLine({status, label}: {status: CsvDisplayStatus | ReceiptRowStatus; label: string}) {
  return (
    <View style={styles.statusLine}>
      <View style={[styles.statusPip, {backgroundColor: STATUS_COLOR[status]}]} />
      <Text style={[styles.statusLabel, {color: STATUS_COLOR[status]}]}>{label}</Text>
    </View>
  );
}

function fileMeta(file: DriveFile): string {
  const parts: string[] = [];
  if (file.modifiedTime) {
    const d = new Date(file.modifiedTime);
    if (!isNaN(d.getTime())) {
      parts.push(d.toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}));
    }
  }
  const bytes = Number(file.size);
  if (file.size && !isNaN(bytes)) {
    parts.push(bytes < 1024 ? `${bytes} B` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  }
  return parts.join(' · ');
}

function fileStatusDescription(status: CsvDisplayStatus, progress?: CsvProgress): string {
  const counts = progress ? `${progress.printedCount} of ${progress.expectedCount} receipts printed. ` : '';
  switch (status) {
    case 'NEW':
      return progress && progress.printedCount > 0
        ? `${counts}Tap Process CSV to queue the remaining receipts.`
        : 'Tap Process CSV to send its receipts to the print queue.';
    case 'READY':
      return 'Some receipts are not in the print queue yet. Tap Process CSV to add them.';
    case 'QUEUED':
      return `${counts}Waiting in the print queue.`;
    case 'PRINTING':
      return `${counts}Printing now.`;
    case 'PRINT_FAILED':
      return `${counts}A receipt failed to print. Retry it from the Print Queue.`;
    case 'ARCHIVE_PENDING':
      return progress?.archiveStatus === 'FAILED'
        ? 'All receipts printed, but the file could not be moved to the Printed folder.'
        : 'All receipts printed. Moving the file to the Printed folder…';
    default:
      return '';
  }
}

function IncomingFileCard({
  file,
  status,
  progress,
  processing,
  disabled,
  retrying,
  onProcess,
  onRetryArchive,
}: {
  file: DriveFile;
  status: CsvDisplayStatus;
  progress?: CsvProgress;
  processing: boolean;
  disabled: boolean;
  retrying: boolean;
  onProcess: () => void;
  onRetryArchive: () => void;
}) {
  const meta = fileMeta(file);
  const canProcess = status === 'NEW' || status === 'READY';
  const canRetryArchive = status === 'ARCHIVE_PENDING' && progress?.archiveStatus === 'FAILED';
  return (
    <View style={styles.card}>
      <View style={styles.fileHeader}>
        <Icon name="file-document-outline" size={22} color={Colors.primaryLight} />
        <View style={styles.flex}>
          <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
          {meta ? <Text style={styles.fileMeta}>{meta}</Text> : null}
        </View>
      </View>
      <View style={styles.cardBody}>
        <StatusLine status={status} label={processing ? 'Processing…' : CSV_STATUS_LABEL[status]} />
        <Text style={styles.statusDesc}>
          {processing ? 'Reading the file and adding its receipts to the print queue.' : fileStatusDescription(status, progress)}
        </Text>
        {canRetryArchive && progress?.archiveError ? (
          <Text style={styles.errorDetail}>{progress.archiveError}</Text>
        ) : null}
        {canProcess ? (
          <Pressable
            style={({pressed}) => [styles.primaryBtn, disabled && styles.btnDisabled, pressed && styles.pressed]}
            onPress={onProcess}
            disabled={disabled}
            accessibilityLabel={`Process CSV ${file.name}`}>
            {processing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="printer-outline" size={18} color="#fff" />
            )}
            <Text style={styles.primaryBtnText}>{processing ? 'Processing…' : 'Process CSV'}</Text>
          </Pressable>
        ) : null}
        {canRetryArchive ? (
          <RetryArchiveButton retrying={retrying} onPress={onRetryArchive} />
        ) : null}
      </View>
    </View>
  );
}

function RetryArchiveButton({retrying, onPress}: {retrying: boolean; onPress: () => void}) {
  return (
    <Pressable
      style={({pressed}) => [styles.outlineBtn, retrying && styles.btnDisabled, pressed && styles.pressed]}
      onPress={onPress}
      disabled={retrying}
      accessibilityLabel="Retry moving file to Printed folder">
      {retrying ? (
        <ActivityIndicator size="small" color={Colors.warning} />
      ) : (
        <Icon name="folder-move-outline" size={18} color={Colors.warning} />
      )}
      <Text style={styles.outlineBtnText}>{retrying ? 'Moving file…' : 'Retry Move to Printed'}</Text>
    </Pressable>
  );
}

function groupDescription(group: ReceiptGroup): string {
  switch (group.status) {
    case 'READY':
      return 'Not in the print queue yet.';
    case 'QUEUED':
      return 'Waiting in the print queue. Open the Print Queue to start printing.';
    case 'PRINTING':
      return 'Printing now.';
    case 'PRINT_FAILED':
      return 'A receipt failed to print. Retry it from the Print Queue.';
    case 'ARCHIVE_PENDING':
      return group.archiveFailed
        ? 'All printed. The file still needs to be moved to the Printed folder.'
        : 'All printed. Moving the file to the Printed folder…';
    default:
      return '';
  }
}

function ReceiptGroupCard({
  group,
  retrying,
  onAddToQueue,
  onOpenQueue,
  onRetryArchive,
  onOpenReceipt,
}: {
  group: ReceiptGroup;
  retrying: boolean;
  onAddToQueue: () => void;
  onOpenQueue: () => void;
  onRetryArchive: () => void;
  onOpenReceipt: (row: ReceiptRow) => void;
}) {
  const count = group.rows.length;
  const showQueueLink = group.status === 'QUEUED' || group.status === 'PRINT_FAILED';
  return (
    <View style={styles.card}>
      <View style={styles.fileHeader}>
        <Icon name="layers-outline" size={22} color={Colors.primaryLight} />
        <View style={styles.flex}>
          <Text style={styles.fileName} numberOfLines={1}>{group.fileName ?? 'CSV file'}</Text>
          <Text style={styles.fileMeta}>
            {count} receipt{count === 1 ? '' : 's'} extracted
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <StatusLine status={group.status} label={CSV_STATUS_LABEL[group.status]} />
        <Text style={styles.statusDesc}>{groupDescription(group)}</Text>
      </View>

      {group.rows.map(row => {
        const r = row.receipt;
        const sub = [r.date, r.customer?.name].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={row.identity}
            style={({pressed}) => [styles.receiptRow, styles.rowDivider, pressed && styles.pressed]}
            onPress={() => onOpenReceipt(row)}
            accessibilityLabel={`View ${r.transactionType} ${r.transactionNumber}, ${RECEIPT_STATUS_LABEL[row.status]}`}>
            <View style={styles.flex}>
              <View style={styles.receiptTitleRow}>
                <Text style={styles.receiptTitle} numberOfLines={1}>
                  {r.transactionType} {r.transactionNumber}
                </Text>
                {r.financials?.total !== undefined ? (
                  <Text style={styles.receiptTotal}>{r.financials.total}</Text>
                ) : null}
              </View>
              {sub ? <Text style={styles.fileMeta} numberOfLines={1}>{sub}</Text> : null}
              <StatusLine status={row.status} label={RECEIPT_STATUS_LABEL[row.status]} />
              {row.status === 'FAILED' && row.error ? (
                <Text style={styles.errorDetail} numberOfLines={2}>{row.error}</Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
          </Pressable>
        );
      })}

      {group.notQueued.length > 0 || showQueueLink || group.archiveFailed ? (
        <View style={[styles.cardBody, styles.rowDivider]}>
          {group.notQueued.length > 0 ? (
            <Pressable
              style={({pressed}) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={onAddToQueue}
              accessibilityLabel="Add all to Print Queue">
              <Text style={styles.primaryBtnText}>
                Add {group.notQueued.length} to Print Queue
              </Text>
            </Pressable>
          ) : null}
          {showQueueLink ? (
            <Pressable
              style={({pressed}) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={onOpenQueue}
              accessibilityLabel="Open Print Queue">
              <Icon name="printer-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Open Print Queue</Text>
            </Pressable>
          ) : null}
          {group.status === 'ARCHIVE_PENDING' && group.archiveFailed ? (
            <RetryArchiveButton retrying={retrying} onPress={onRetryArchive} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    flexShrink: 0,
  },
  statusDotActive: {backgroundColor: Colors.active},
  statusDotInactive: {backgroundColor: Colors.inactive},
  statusBannerContent: {flex: 1},
  statusBannerTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  statusBannerDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  signOutBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signOutText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },

  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    ...Shadow.md,
  },
  signInButtonPressed: {
    opacity: 0.85,
  },
  signInButtonText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: Platform.OS === 'ios' ? '600' : '700',
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: `${Colors.error}18`,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.error}44`,
    padding: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },

  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    backgroundColor: `${Colors.active}18`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.active}55`,
    padding: Spacing.md,
  },
  noticeText: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    flex: 1,
    minWidth: 160,
  },

  flex: {flex: 1},
  pressed: {opacity: 0.75},
  divider: {height: 1, backgroundColor: Colors.border},
  rowDivider: {borderTopWidth: 1, borderTopColor: Colors.border},

  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  linkText: {
    ...Typography.captionMedium,
    color: Colors.primaryLight,
  },
  lastChecked: {
    ...Typography.caption,
    color: Colors.textTertiary,
    paddingHorizontal: 2,
  },

  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardBody: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  emptyTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  emptyText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  folderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  folderLabel: {
    ...Typography.label,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  folderName: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    marginTop: 2,
  },

  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  fileName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  fileMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  statusPip: {width: 8, height: 8, borderRadius: 4},
  statusLabel: {
    ...Typography.captionMedium,
    fontWeight: '700',
  },
  statusDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  errorDetail: {
    ...Typography.caption,
    color: Colors.error,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  primaryBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '700',
  },
  btnDisabled: {opacity: 0.5},
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.warning}88`,
    backgroundColor: Colors.warningDim,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  outlineBtnText: {
    ...Typography.bodyMedium,
    color: Colors.warning,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.primary}66`,
  },
  secondaryBtnText: {
    ...Typography.captionMedium,
    color: Colors.primaryLight,
  },

  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  receiptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  receiptTitle: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  receiptTotal: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
  },

  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  completedName: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  completedLabel: {
    ...Typography.captionMedium,
    color: Colors.active,
  },

  bottomPad: {height: Spacing.xl},
});
