/**
 * DriveScreen.tsx — Google Drive connection and folder selection
 *
 * Phase 2–4: Allows the user to:
 *  1. Sign in with Google
 *  2. Browse and select the Winsoft CSV source folder and Archive folder
 *  3. Incoming CSV Files — select files and "Add to Print Queue"
 *  4. Completed — CSVs printed and moved to the Printed folder
 *
 * Drive only discovers and processes CSVs. Receipts are selected and printed
 * in the Print Queue tab; nothing is printed from here.
 *
 * State lives in useAppStore (Zustand).
 * State actions delegate to GoogleAuthService and DriveService.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
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
import Checkbox from '../../components/Checkbox';
import DriveFolderPickerModal from '../../components/DriveFolderPickerModal';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';
import type {BatchProcessResult, CsvProgress} from '../../store/useAppStore';
import {csvDisplayStatus, CSV_STATUS_LABEL} from '../../store/driveWorkflow';
import type {CsvDisplayStatus} from '../../store/driveWorkflow';
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

  const queue = useAppStore(s => s.queue);
  const csvProgress = useAppStore(s => s.csvProgress);
  const lastParsedFileId = useAppStore(s => s.lastParsedFileId);
  const archiveFiles = useAppStore(s => s.archiveFiles);
  const processCsvFiles = useAppStore(s => s.processCsvFiles);
  const batchProgress = useAppStore(s => s.batchProgress);
  const retryArchive = useAppStore(s => s.retryArchive);
  const processingFileId = useAppStore(s => s.processingFileId);
  const parseLoading = useAppStore(s => s.parseLoading);
  const csvError = useAppStore(s => s.csvError);

  const [pickerMode, setPickerMode] = useState<'source' | 'archive' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [refreshingFolder, setRefreshingFolder] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{name: string; error: string}[]>([]);

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

  // Refresh only detects files: reload the folder and count new CSVs. Nothing
  // is parsed, queued or printed. The Printed list is reloaded as well.
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
        ? `${discovered} new CSV file${discovered === 1 ? '' : 's'} found. Tick the files you want and tap Add to Print Queue. Nothing was queued or printed.`
        : 'No new CSV files. Nothing was queued or printed.');
    } catch (error) {
      Alert.alert('Refresh failed', error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshingFolder(false);
    }
  }, [csvLoading, loadArchiveFiles, loadCsvFiles, navigation, refreshingFolder]);

  const fileStatuses = useMemo(() => {
    const map: Record<string, CsvDisplayStatus> = {};
    csvFiles.forEach(f => {
      const status = csvDisplayStatus(f.id, queue, csvProgress, lastParsedFileId);
      // Drive says the file is in Incoming right now, so it is shown here even
      // if it was archived before (someone moved it back). Its printed history
      // is kept, so it is not offered for processing again.
      map[f.id] = status === 'COMPLETED' ? 'RETURNED' : status;
    });
    return map;
  }, [csvFiles, queue, csvProgress, lastParsedFileId]);
  const incomingFiles = csvFiles;
  // A file is listed in one section only: Incoming wins when Drive reports it there.
  const completedFiles = archiveFiles.filter(f => !csvFiles.some(c => c.id === f.id));
  const queuedCount = queue.filter(q => q.status === 'QUEUED').length;
  const waitingCount = incomingFiles.filter(
    f => fileStatuses[f.id] === 'NEW' || fileStatuses[f.id] === 'READY',
  ).length;
  const busy = Boolean(processingFileId) || parseLoading || Boolean(batchProgress);

  // Only files that still need processing can be selected.
  const selectableFiles = incomingFiles.filter(
    f => fileStatuses[f.id] === 'NEW' || fileStatuses[f.id] === 'READY',
  );
  const chosenFiles = selectableFiles.filter(f => selectedFiles.has(f.id));
  const allFilesSelected = selectableFiles.length > 0 && chosenFiles.length === selectableFiles.length;
  const toggleFile = (id: string) =>
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleAllFiles = () =>
    setSelectedFiles(allFilesSelected ? new Set() : new Set(selectableFiles.map(f => f.id)));

  // Smoothly reflow the page when cards appear, move between sections or
  // leave. Must be scheduled before React renders the change, so it listens to
  // the store directly instead of running in a post-render effect.
  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (
          state.csvFiles !== prev.csvFiles ||
          state.archiveFiles !== prev.archiveFiles ||
          state.queue !== prev.queue ||
          state.receipts !== prev.receipts
        ) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
      }),
    [],
  );

  const describeBatch = (result: BatchProcessResult) => {
    const files = `${result.processed} file${result.processed === 1 ? '' : 's'} processed`;
    const receipts = `${result.added} receipt${result.added === 1 ? '' : 's'} added to the print queue`;
    return (
      `${files}: ${receipts}. Open the Print Queue to print them.` +
      (result.skipped > 0 ? ` ${result.skipped} already queued or printed.` : '')
    );
  };

  // Add only the ticked CSVs to the print queue; every other file stays untouched in Incoming.
  const handleProcessSelected = async () => {
    if (busy) return;
    if (chosenFiles.length === 0) {
      Alert.alert('No files selected', 'Tick the CSV files you want to add to the print queue.');
      return;
    }
    setNotice(null);
    setFailures([]);
    const result = await processCsvFiles(chosenFiles);
    if (!result) return;
    setSelectedFiles(new Set());
    if (result.processed > 0) setNotice(describeBatch(result));
    setFailures(result.failed);
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
  const completedShown = showAllCompleted ? completedFiles : completedFiles.slice(0, 5);

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
          <FadeIn style={styles.noticeBanner}>
            <Icon name="check-circle-outline" size={18} color={Colors.active} />
            <Text style={styles.noticeText}>{notice}</Text>
            {queuedCount > 0 ? (
              <Pressable
                onPress={openQueue}
                style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Open Print Queue">
                <Text style={styles.secondaryBtnText}>Open Print Queue ({queuedCount})</Text>
              </Pressable>
            ) : null}
          </FadeIn>
        ) : null}

        {failures.length > 0 ? (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle-outline" size={16} color={Colors.error} />
            <View style={styles.flex}>
              <Text style={styles.errorText}>
                {failures.length} file{failures.length === 1 ? '' : 's'} could not be processed and stay in Incoming:
              </Text>
              {failures.map(f => (
                <Text key={f.name} style={styles.errorText}>• {f.name} — {f.error}</Text>
              ))}
            </View>
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
                  ? `${waitingCount} file${waitingCount === 1 ? '' : 's'} not added to the print queue yet`
                  : 'No files waiting'
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
            {selectableFiles.length > 0 ? (
              <View style={styles.selectionBar}>
                <Pressable onPress={toggleAllFiles} disabled={busy} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.linkText}>{allFilesSelected ? 'Deselect All' : 'Select All'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleProcessSelected()}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Add to Print Queue (${chosenFiles.length})`}
                  style={({pressed}) => [
                    styles.primaryBtn,
                    styles.selectionBtn,
                    (chosenFiles.length === 0 || busy) && styles.btnDisabled,
                    pressed && styles.pressed,
                  ]}>
                  {batchProgress ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={styles.primaryBtnText}>
                    {batchProgress
                      ? `Adding ${Math.min(batchProgress.done + 1, batchProgress.total)} of ${batchProgress.total}…`
                      : `Add to Print Queue (${chosenFiles.length})`}
                  </Text>
                </Pressable>
              </View>
            ) : null}
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
                  selectable={selectableFiles.some(f => f.id === file.id)}
                  selected={selectedFiles.has(file.id)}
                  onToggle={() => toggleFile(file.id)}
                  retrying={retryingId === file.id}
                  onRetryArchive={() => void handleRetryArchive(file.id)}
                />
              ))
            )}

            {/* ── 2. Completed ── */}
            {archiveFolderId ? (
              <>
                <SectionHeading
                  title="Completed"
                  subtitle={
                    completedFiles.length > 0
                      ? `${completedFiles.length} file${completedFiles.length === 1 ? '' : 's'} printed and moved to the Printed folder`
                      : 'Printed files will be listed here'
                  }
                />
                {completedFiles.length > 0 ? (
                  <View style={styles.card}>
                    {completedShown.map((f, i) => (
                      <View key={f.id} style={[styles.completedRow, i > 0 && styles.rowDivider]}>
                        <Icon name="file-check-outline" size={18} color={Colors.active} />
                        <Text style={styles.completedName} numberOfLines={1}>{f.name}</Text>
                        <Text style={styles.completedLabel}>Completed</Text>
                      </View>
                    ))}
                    {completedFiles.length > 5 ? (
                      <Pressable
                        onPress={() => setShowAllCompleted(v => !v)}
                        style={[styles.completedRow, styles.rowDivider]}>
                        <Text style={styles.linkText}>
                          {showAllCompleted ? 'Show fewer' : `Show all ${completedFiles.length}`}
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

const STATUS_COLOR: Record<CsvDisplayStatus, string> = {
  NEW: Colors.primaryLight,
  READY: Colors.primaryLight,
  QUEUED: Colors.warning,
  PRINTING: Colors.active,
  PRINT_FAILED: Colors.error,
  ARCHIVE_PENDING: Colors.warning,
  COMPLETED: Colors.active,
  RETURNED: Colors.textSecondary,
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

function StatusLine({
  status,
  label,
  active = status === 'PRINTING',
}: {
  status: CsvDisplayStatus;
  label: string;
  active?: boolean;
}) {
  return (
    <View style={styles.statusLine}>
      <StatusPip color={STATUS_COLOR[status]} active={active} />
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
  const counts = progress ? `${progress.printedCount} of ${progress.expectedCount} printed. ` : '';
  switch (status) {
    case 'NEW':
    case 'READY':
      return progress && progress.printedCount > 0
        ? `${counts}Tick it and tap Add to Print Queue to queue the rest.`
        : 'Not added to the print queue yet.';
    case 'QUEUED':
      return `${counts}Its receipts are waiting in the Print Queue.`;
    case 'PRINTING':
      return `${counts}Printing now.`;
    case 'PRINT_FAILED':
      return `${counts}A receipt failed to print. Retry it in the Print Queue.`;
    case 'ARCHIVE_PENDING':
      return progress?.archiveStatus === 'FAILED'
        ? 'All receipts printed, but the file could not be moved to the Printed folder.'
        : 'All receipts printed. Moving the file to the Printed folder…';
    case 'RETURNED':
      return (
        'This file was printed and archived earlier, then moved back to Incoming. ' +
        'Its receipts will not print again automatically. To print a copy, use History > Reprint.'
      );
    default:
      return '';
  }
}

/** Subtle entrance: fade in and rise a few pixels. */
function FadeIn({style, children}: {style?: object; children: React.ReactNode}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(progress, {toValue: 1, duration: 220, useNativeDriver: true});
    anim.start();
    return () => anim.stop();
  }, [progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{translateY: progress.interpolate({inputRange: [0, 1], outputRange: [8, 0]})}],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

/** Status dot that gently pulses while work is in progress. */
function StatusPip({color, active}: {color: string; active: boolean}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 0.3, duration: 600, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: 600, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  return <Animated.View style={[styles.statusPip, {backgroundColor: color, opacity: pulse}]} />;
}

function IncomingFileCard({
  file,
  status,
  progress,
  processing,
  disabled,
  selectable,
  selected,
  onToggle,
  retrying,
  onRetryArchive,
}: {
  file: DriveFile;
  status: CsvDisplayStatus;
  progress?: CsvProgress;
  processing: boolean;
  disabled: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  retrying: boolean;
  onRetryArchive: () => void;
}) {
  const receiptCount = progress && progress.expectedCount > 0
    ? `${progress.expectedCount} receipt${progress.expectedCount === 1 ? '' : 's'}`
    : '';
  const meta = [receiptCount, fileMeta(file)].filter(Boolean).join(' · ');
  const canRetryArchive = status === 'ARCHIVE_PENDING' && progress?.archiveStatus === 'FAILED';
  return (
    <FadeIn style={styles.card}>
      <View style={styles.fileHeader}>
        {selectable ? (
          <Checkbox checked={selected} onToggle={onToggle} disabled={disabled} label={`Select ${file.name}`} />
        ) : (
          <Icon name="file-document-outline" size={22} color={Colors.primaryLight} />
        )}
        <View style={styles.flex}>
          <Text style={styles.fileName} numberOfLines={2}>{file.name}</Text>
          {meta ? <Text style={styles.fileMeta}>{meta}</Text> : null}
        </View>
      </View>
      <View style={styles.cardBody}>
        <StatusLine
          status={status}
          label={processing ? 'Adding to print queue…' : CSV_STATUS_LABEL[status]}
          active={processing || status === 'PRINTING'}
        />
        <Text style={styles.statusDesc}>
          {processing ? 'Reading the file and adding its receipts to the print queue.' : fileStatusDescription(status, progress)}
        </Text>
        {canRetryArchive && progress?.archiveError ? (
          <Text style={styles.errorDetail}>{progress.archiveError}</Text>
        ) : null}
        {canRetryArchive ? (
          <RetryArchiveButton retrying={retrying} onPress={onRetryArchive} />
        ) : null}
      </View>
    </FadeIn>
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
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: 2,
  },
  selectionBtn: {marginTop: 0, flex: 1, maxWidth: 260},
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
