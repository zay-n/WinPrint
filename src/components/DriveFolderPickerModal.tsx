/**
 * DriveFolderPickerModal.tsx — Nested Google Drive folder picker
 *
 * Provides hierarchical folder navigation:
 *  - Starts at Drive root ("My Drive")
 *  - Displays folders inside current location
 *  - Tapping a folder navigates deeper into it
 *  - Back button pops one level up
 *  - Breadcrumb path displays current location
 *  - "Select This Folder" selects the currently active folder
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from './Icon';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../theme';
import * as DriveService from '../services/drive/DriveService';
import type {DriveFile} from '../services/drive/DriveClient';

interface FolderStackItem {
  id: string;
  name: string;
}

export interface SelectedFolderResult {
  id: string;
  name: string;
  path: string;
}

interface DriveFolderPickerModalProps {
  visible: boolean;
  title: string;
  accessToken: string | null;
  initialFolderId?: string | null;
  initialFolderName?: string | null;
  onSelect: (folder: SelectedFolderResult) => void;
  onClose: () => void;
}

export default function DriveFolderPickerModal({
  visible,
  title,
  accessToken,
  initialFolderId,
  initialFolderName,
  onSelect,
  onClose,
}: DriveFolderPickerModalProps) {
  const [folderStack, setFolderStack] = useState<FolderStackItem[]>([
    {id: 'root', name: 'My Drive'},
  ]);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = folderStack[folderStack.length - 1];
  const canGoBack = folderStack.length > 1;

  // Fetch children whenever current folder changes or modal opens
  const fetchFolders = useCallback(async (parentId: string) => {
    if (!accessToken) {
      setError('Not signed in to Google Drive.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await DriveService.listFolders(accessToken, parentId);
      setFolders(items);
    } catch (e: unknown) {
      const err = e as {message?: string};
      setError(err?.message ?? 'Failed to load folders.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  // Reset or initialize stack when modal becomes visible
  useEffect(() => {
    if (visible) {
      // Default to root
      setFolderStack([{id: 'root', name: 'My Drive'}]);
      void fetchFolders('root');
    }
  }, [visible, fetchFolders]);

  const handleNavigateInto = useCallback((folder: DriveFile) => {
    setFolderStack(prev => {
      const next = [...prev, {id: folder.id, name: folder.name}];
      return next;
    });
    void fetchFolders(folder.id);
  }, [fetchFolders]);

  const handleGoBack = useCallback(() => {
    if (folderStack.length <= 1) return;
    const nextStack = folderStack.slice(0, folderStack.length - 1);
    setFolderStack(nextStack);
    const parent = nextStack[nextStack.length - 1];
    void fetchFolders(parent.id);
  }, [folderStack, fetchFolders]);

  const handleSelectCurrentFolder = useCallback(() => {
    const fullPath = folderStack.map(f => f.name).join(' / ');
    onSelect({
      id: currentFolder.id,
      name: currentFolder.name,
      path: fullPath,
    });
    onClose();
  }, [folderStack, currentFolder, onSelect, onClose]);

  const breadcrumbText = folderStack.map(f => f.name).join(' › ');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {canGoBack ? (
              <TouchableOpacity
                onPress={handleGoBack}
                style={styles.backButton}
                accessibilityLabel="Go back one folder level">
                <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.backPlaceholder} />
            )}
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Cancel folder picker">
              <Icon name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Breadcrumb Path Bar */}
          <View style={styles.breadcrumbBar}>
            <Icon name="folder-outline" size={16} color={Colors.primary} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.breadcrumbContent}>
              <Text style={styles.breadcrumbText} numberOfLines={1}>
                {breadcrumbText}
              </Text>
            </ScrollView>
          </View>
        </View>

        {/* Current Folder Subtitle */}
        <View style={styles.currentFolderInfo}>
          <Text style={styles.currentFolderLabel}>CURRENT FOLDER:</Text>
          <Text style={styles.currentFolderName} numberOfLines={1}>
            {currentFolder.name}
          </Text>
        </View>

        {/* Folder List / Content */}
        <View style={styles.listContainer}>
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading folders…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContainer}>
              <Icon name="alert-circle-outline" size={36} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => fetchFolders(currentFolder.id)}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={folders}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.folderRow}
                  activeOpacity={0.7}
                  onPress={() => handleNavigateInto(item)}>
                  <View style={styles.folderIconContainer}>
                    <Icon name="folder" size={24} color="#4285F4" />
                  </View>
                  <View style={styles.folderRowContent}>
                    <Text style={styles.folderRowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.folderRowSub}>Tap to open folder</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Icon name="folder-open-outline" size={40} color={Colors.textSecondary} />
                  <Text style={styles.emptyTitle}>No Subfolders</Text>
                  <Text style={styles.emptySubtitle}>
                    This folder has no subfolders. You can select it using the button below.
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {/* Bottom Actions Bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.selectBtn,
              currentFolder.id === 'root' && styles.selectBtnRoot,
            ]}
            onPress={handleSelectCurrentFolder}>
            <Icon name="check" size={18} color="#fff" />
            <Text style={styles.selectBtnText} numberOfLines={1}>
              Select This Folder
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPlaceholder: {
    width: 40,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...Typography.title,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    marginTop: 4,
    gap: 6,
  },
  breadcrumbContent: {
    flexGrow: 1,
  },
  breadcrumbText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  currentFolderInfo: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  currentFolderLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  currentFolderName: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginTop: 2,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: Spacing.xs,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  folderIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  folderRowContent: {
    flex: 1,
  },
  folderRowName: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  folderRowSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 68,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    ...Typography.bodyMedium,
    color: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    marginTop: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.title,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.md,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  selectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  selectBtnRoot: {
    backgroundColor: Colors.primary,
  },
  selectBtnText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '700',
  },
});
