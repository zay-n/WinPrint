/**
 * DriveScreen.tsx — Google Drive connection and folder selection
 *
 * Phase 2–4: Allows the user to:
 *  1. Sign in with Google
 *  2. Browse and select the Winsoft CSV source folder and Archive folder
 *  3. View CSV files in the selected folder
 *  4. Parse CSV files and enqueue transactions
 *
 * State lives in useAppStore (Zustand).
 * State actions delegate to GoogleAuthService and DriveService.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';
import type {DriveFile} from '../../services/drive/DriveClient';
import type {DriveScreenProps} from '../../navigation/types';

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function DriveScreen({navigation}: DriveScreenProps) {
  const user = useAppStore(s => s.user);
  const signInLoading = useAppStore(s => s.signInLoading);
  const signInError = useAppStore(s => s.signInError);
  const signIn = useAppStore(s => s.signIn);
  const signOut = useAppStore(s => s.signOut);

  const folders = useAppStore(s => s.folders);
  const foldersLoading = useAppStore(s => s.foldersLoading);
  const csvFiles = useAppStore(s => s.csvFiles);
  const csvLoading = useAppStore(s => s.csvLoading);
  const sourceFolderId = useAppStore(s => s.sourceFolderId);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);
  const archiveFolderId = useAppStore(s => s.archiveFolderId);
  const archiveFolderName = useAppStore(s => s.archiveFolderName);
  const driveError = useAppStore(s => s.driveError);
  const loadFolders = useAppStore(s => s.loadFolders);
  const selectFolder = useAppStore(s => s.selectFolder);
  const selectArchiveFolder = useAppStore(s => s.selectArchiveFolder);
  const loadCsvFiles = useAppStore(s => s.loadCsvFiles);

  const downloadAndParse = useAppStore(s => s.downloadAndParse);
  const receipts = useAppStore(s => s.receipts);
  const enqueueReceipt = useAppStore(s => s.enqueueReceipt);
  const parseLoading = useAppStore(s => s.parseLoading);
  const csvError = useAppStore(s => s.csvError);

  const [pickerMode, setPickerMode] = useState<'source' | 'archive' | null>(null);

  // Load root folders when user signs in
  useEffect(() => {
    if (user) {
      setPickerMode('source');
      loadFolders('root');
    }
  }, [user, loadFolders]);

  // Load CSV files when a folder is selected
  useEffect(() => {
    if (sourceFolderId) {
      loadCsvFiles();
    }
  }, [sourceFolderId, loadCsvFiles]);

  const handleFolderSelect = useCallback(
    (folder: DriveFile) => {
      if (pickerMode === 'archive') {
        selectArchiveFolder(folder);
      } else {
        selectFolder(folder);
      }
      setPickerMode(null);
    },
    [pickerMode, selectFolder, selectArchiveFolder],
  );

  const handleDownload = useCallback(
    (file: DriveFile) => {
      downloadAndParse(file);
    },
    [downloadAndParse],
  );

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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

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
            <Text style={styles.errorText}>{csvError}</Text>
          </View>
        ) : null}

        {/* Source Folder selection */}
        <SectionLabel title="Select Source Folder" />
        {sourceFolderName ? (
          <View style={styles.selectedFolder}>
            <Icon name="folder-google-drive" size={20} color="#4285F4" />
            <Text style={styles.selectedFolderName} numberOfLines={1}>
              {sourceFolderName}
            </Text>
            <Pressable
              onPress={() => { setPickerMode('source'); loadFolders('root'); }}
              style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
            </Pressable>
          </View>
        ) : (
           <Pressable onPress={() => { setPickerMode('source'); loadFolders('root'); }} style={styles.changeBtnFull}>
              <Text style={styles.changeBtnText}>Select Source Folder</Text>
           </Pressable>
        )}

        {/* Archive Folder selection */}
        <SectionLabel title="Select Archive Folder (Printed)" />
        {archiveFolderName ? (
          <View style={styles.selectedFolder}>
            <Icon name="folder-google-drive" size={20} color={Colors.active} />
            <Text style={styles.selectedFolderName} numberOfLines={1}>
              {archiveFolderName}
            </Text>
            <Pressable
              onPress={() => { setPickerMode('archive'); loadFolders('root'); }}
              style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
            </Pressable>
          </View>
        ) : (
           <Pressable onPress={() => { setPickerMode('archive'); loadFolders('root'); }} style={styles.changeBtnFull}>
              <Text style={styles.changeBtnText}>Select Archive Folder</Text>
           </Pressable>
        )}

        {pickerMode && foldersLoading ? (
          <ActivityIndicator
            color={Colors.primary}
            style={styles.loader}
          />
        ) : pickerMode ? (
          <View style={styles.folderPickerList}>
            <Text style={styles.pickerHeader}>
              Selecting {pickerMode === 'archive' ? 'Archive' : 'Source'} Folder...
            </Text>
            <FlatList
              data={folders}
              keyExtractor={f => f.id}
              renderItem={({item}) => (
                <FolderRow
                  folder={item}
                  selected={
                    pickerMode === 'archive'
                      ? item.id === archiveFolderId
                      : item.id === sourceFolderId
                  }
                  onPress={() => handleFolderSelect(item)}
                />
              )}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyMsg}>No folders found at Drive root.</Text>
              }
              ItemSeparatorComponent={() => (
                <View style={styles.separator} />
              )}
            />
          </View>
        ) : null}

        {/* CSV files */}
        {sourceFolderId ? (
          <>
            <SectionLabel
              title="CSV Files in Folder"
              action={
                <Pressable onPress={loadCsvFiles}>
                  <Icon name="refresh" size={18} color={Colors.primary} />
                </Pressable>
              }
            />
            {csvLoading ? (
              <ActivityIndicator color={Colors.primary} style={styles.loader} />
            ) : (
              <FlatList
                data={csvFiles}
                keyExtractor={f => f.id}
                renderItem={({item}) => (
                  <CsvFileRow
                    file={item}
                    loading={parseLoading}
                    onDownload={() => handleDownload(item)}
                  />
                )}
                scrollEnabled={false}
                ListEmptyComponent={
                  <Text style={styles.emptyMsg}>
                    No CSV files in this folder.
                  </Text>
                }
                ItemSeparatorComponent={() => (
                  <View style={styles.separator} />
                )}
              />
            )}
          </>
        ) : null}

        {/* Parse results summary */}
        {receipts.length > 0 ? (
          <>
            <SectionLabel title="Parsed Data" />
            <View style={styles.receiptSummaryCard}>
              <View style={styles.receiptSummaryHeader}>
                <Text style={styles.receiptSummaryCount}>
                  {receipts.length} transaction{receipts.length !== 1 ? 's' : ''}
                </Text>
                <Pressable
                  style={styles.enqueueBtn}
                  onPress={() => receipts.forEach(r => enqueueReceipt(r))}>
                  <Text style={styles.enqueueBtnText}>Enqueue All</Text>
                </Pressable>
              </View>
              {receipts.map((r, receiptIndex) => (
                <Pressable
                  key={`${r.sourceFile?.driveFileId}::${r.transactionType}::${r.transactionNumber}`}
                  style={({pressed}) => [styles.receiptRow, pressed && styles.receiptRowPressed]}
                  onPress={() => navigation.navigate('TransactionDetail', {receiptIndex})}
                  accessibilityLabel={`View transaction ${r.transactionType} ${r.transactionNumber}`}>
                  <Icon name="receipt" size={16} color={Colors.primary} />
                  <Text style={styles.receiptRowText}>
                    {r.transactionType} {r.transactionNumber} — {r.items.length} item{r.items.length !== 1 ? 's' : ''}
                    {r.customer.name ? ` — ${r.customer.name}` : ''}
                  </Text>
                  <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {action}
    </View>
  );
}

function FolderRow({
  folder,
  selected,
  onPress,
}: {
  folder: DriveFile;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({pressed}) => [
        styles.listRow,
        selected && styles.listRowSelected,
        pressed && styles.listRowPressed,
      ]}
      onPress={onPress}
      accessibilityLabel={`Select folder ${folder.name}`}>
      <Icon
        name="folder-google-drive"
        size={20}
        color={selected ? Colors.primary : Colors.textSecondary}
      />
      <Text
        style={[styles.listRowText, selected && styles.listRowTextSelected]}
        numberOfLines={1}>
        {folder.name}
      </Text>
      {selected && (
        <Icon name="check-circle" size={18} color={Colors.active} />
      )}
    </Pressable>
  );
}

function CsvFileRow({
  file,
  loading,
  onDownload,
}: {
  file: DriveFile;
  loading: boolean;
  onDownload: () => void;
}) {
  return (
    <View style={styles.listRow}>
      <Icon name="file-delimited-outline" size={20} color={Colors.textSecondary} />
      <Text style={styles.listRowText} numberOfLines={1}>
        {file.name}
      </Text>
      <Pressable
        style={({pressed}) => [
          styles.parseBtn,
          pressed && styles.parseBtnPressed,
        ]}
        onPress={onDownload}
        disabled={loading}
        accessibilityLabel={`Parse ${file.name}`}>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.parseBtnText}>Parse</Text>
        )}
      </Pressable>
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

  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxs,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  selectedFolder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: `${Colors.primary}14`,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  selectedFolderName: {
    ...Typography.body,
    color: Colors.primaryLight,
    flex: 1,
  },
  changeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
  },
  changeBtnFull: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
    alignItems: 'center',
    backgroundColor: `${Colors.primary}14`,
  },
  changeBtnText: {
    ...Typography.caption,
    color: Colors.primaryLight,
  },

  folderPickerList: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerHeader: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listRowSelected: {
    backgroundColor: `${Colors.primary}12`,
    borderColor: `${Colors.primary}44`,
  },
  listRowPressed: {opacity: 0.8},
  listRowText: {
    ...Typography.body,
    color: Colors.textSecondary,
    flex: 1,
  },
  listRowTextSelected: {
    color: Colors.primaryLight,
  },

  separator: {height: Spacing.xs},

  parseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    minWidth: 56,
    alignItems: 'center',
  },
  parseBtnPressed: {opacity: 0.8},
  parseBtnText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '600',
  },

  loader: {marginVertical: Spacing.md},
  emptyMsg: {
    ...Typography.body,
    color: Colors.textTertiary,
    textAlign: 'center',
    padding: Spacing.base,
  },

  receiptSummaryCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  receiptSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptSummaryCount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  enqueueBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  enqueueBtnText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '600',
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  receiptRowPressed: {opacity: 0.75},
  receiptRowText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },

  bottomPad: {height: Spacing.xl},
});
