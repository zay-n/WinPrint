/** Shows images rendered from the generated local PDF, without altering it. */

import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Icon from '../../components/Icon';
import type {DriveStackParamList} from '../../navigation/types';
import {openPdfExternally, renderPdfPages} from '../../services/pdf/ReceiptPdfPreviewService';
import {BorderRadius, Colors, Shadow, Spacing, Typography} from '../../theme';

type Props = NativeStackScreenProps<DriveStackParamList, 'ReceiptPreview'>;

export default function ReceiptPreviewScreen({route}: Props) {
  const {pdfPath} = route.params;
  const [pageUris, setPageUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    renderPdfPages(pdfPath)
      .then(uris => {
        if (active) {
          setPageUris(uris);
        }
      })
      .catch((previewError: unknown) => {
        if (active) {
          setError(messageFor(previewError, 'Unable to render this PDF preview.'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [pdfPath]);

  const handleOpen = async () => {
    setOpening(true);
    try {
      await openPdfExternally(pdfPath);
    } catch (openError: unknown) {
      setError(messageFor(openError, 'Unable to open this PDF.'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Icon name="file-pdf-box" size={22} color={Colors.primaryLight} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Generated PDF</Text>
            <Text style={styles.infoText} numberOfLines={1}>{pdfPath.split('/').pop()}</Text>
          </View>
        </View>

        <Pressable
          onPress={handleOpen}
          disabled={opening}
          style={({pressed}) => [styles.openButton, (pressed || opening) && styles.pressed]}
          accessibilityLabel="Open PDF in a compatible app">
          {opening ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="open-in-new" size={19} color="#FFFFFF" />}
          <Text style={styles.openButtonText}>{opening ? 'Opening PDF…' : 'Open PDF'}</Text>
        </Pressable>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Rendering receipt preview…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Icon name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {pageUris.map((uri, index) => (
          <View key={uri} style={styles.pageCard}>
            <Text style={styles.pageLabel}>Page {index + 1}</Text>
            <Image source={{uri}} style={styles.pageImage} resizeMode="contain" accessibilityLabel={`Receipt PDF page ${index + 1}`} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.xxl},
  infoCard: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, ...Shadow.sm},
  infoContent: {flex: 1},
  infoTitle: {...Typography.bodyMedium, color: Colors.textPrimary},
  infoText: {...Typography.caption, color: Colors.textSecondary, marginTop: 2},
  openButton: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadow.sm},
  openButtonText: {...Typography.bodyMedium, color: '#FFFFFF'},
  loadingState: {alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl},
  loadingText: {...Typography.body, color: Colors.textSecondary},
  errorCard: {flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.errorDim, borderColor: `${Colors.error}55`, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md},
  errorText: {...Typography.caption, color: Colors.error, flex: 1},
  pageCard: {backgroundColor: '#FFFFFF', borderRadius: BorderRadius.sm, overflow: 'hidden', ...Shadow.md},
  pageLabel: {...Typography.captionMedium, color: Colors.textSecondary, padding: Spacing.sm, backgroundColor: Colors.card},
  pageImage: {width: '100%', aspectRatio: 595 / 842, backgroundColor: '#FFFFFF'},
  pressed: {opacity: 0.76},
});
