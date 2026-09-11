/**
 * Read-only detail view for one parsed Winsoft transaction.
 *
 * The screen consumes the existing Receipt[] in Zustand. It deliberately does
 * not parse, mutate, print, or archive anything.
 */

import React, {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import type {RawWinsoftRow, Receipt, ReceiptItem} from '../../models/Receipt';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {receiptIdentity, useAppStore} from '../../store/useAppStore';
import {BorderRadius, Colors, Shadow, Spacing, Typography} from '../../theme';
import type {DriveStackParamList} from '../../navigation/types';

type Props = NativeStackScreenProps<DriveStackParamList, 'TransactionDetail'>;

export default function TransactionDetailScreen({route, navigation}: Props) {
  const receipt = useAppStore(state => state.receipts[route.params.receiptIndex]);
  const generatedPdfPaths = useAppStore(state => state.generatedPdfPaths);
  const generatingReceiptIndex = useAppStore(state => state.generatingReceiptIndex);
  const pdfError = useAppStore(state => state.pdfError);
  const generateReceiptPdf = useAppStore(state => state.generateReceiptPdf);

  const selectedPrinterType = useAppStore(state => state.selectedPrinterType);
  const selectedBluetoothDevice = useAppStore(state => state.selectedBluetoothDevice);
  const printLoading = useAppStore(state => state.printLoading);
  const printerError = useAppStore(state => state.printerError);
  const printReceipt = useAppStore(state => state.printReceipt);
  const clearPrinterError = useAppStore(state => state.clearPrinterError);
  const enqueueReceipt = useAppStore(state => state.enqueueReceipt);

  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);
  const [enqueueSuccessMessage, setEnqueueSuccessMessage] = useState<string | null>(null);

  if (!receipt) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.missingState}>
          <Icon name="receipt-text-remove-outline" size={32} color={Colors.inactive} />
          <Text style={styles.missingTitle}>Transaction unavailable</Text>
          <Text style={styles.missingText}>
            Parse the CSV again to inspect its transactions.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const pdfPath = generatedPdfPaths[receiptIdentity(receipt)];
  const generatingPdf = generatingReceiptIndex === route.params.receiptIndex;
  const handlePdfAction = async () => {
    if (pdfPath) {
      navigation.navigate('ReceiptPreview', {receiptIndex: route.params.receiptIndex, pdfPath});
      return;
    }
    const generatedPath = await generateReceiptPdf(route.params.receiptIndex);
    if (generatedPath) {
      navigation.navigate('ReceiptPreview', {
        receiptIndex: route.params.receiptIndex,
        pdfPath: generatedPath,
      });
    }
  };

  const handlePrintAction = async () => {
    setPrintSuccessMessage(null);
    clearPrinterError();
    const result = await printReceipt(receipt);
    if (result.success) {
      const printerLabel =
        selectedPrinterType === 'office'
          ? 'Android Print Spooler'
          : selectedBluetoothDevice?.name || '80mm Thermal Printer';
      setPrintSuccessMessage(`Print job sent to ${printerLabel}!`);
    }
  };

  const handleEnqueueAction = () => {
    setEnqueueSuccessMessage(null);
    enqueueReceipt(receipt);
    setEnqueueSuccessMessage('Transaction added to print queue.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TransactionHeader receipt={receipt} />

        <View style={styles.actionsRow}>
          <Pressable
            onPress={handlePdfAction}
            disabled={generatingPdf || printLoading}
            style={({pressed}) => [
              styles.actionButton,
              styles.pdfButton,
              (pressed || generatingPdf) && styles.pressed,
            ]}
            accessibilityLabel={pdfPath ? 'Preview PDF' : 'Generate PDF'}>
            {generatingPdf ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Icon name={pdfPath ? 'file-eye-outline' : 'file-pdf-box'} size={18} color="#FFFFFF" />
            )}
            <Text style={styles.actionButtonText}>
              {generatingPdf ? 'Generating…' : pdfPath ? 'Preview PDF' : 'Generate PDF'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handlePrintAction}
            disabled={printLoading || generatingPdf}
            style={({pressed}) => [
              styles.actionButton,
              styles.printButton,
              (pressed || printLoading) && styles.pressed,
            ]}
            accessibilityLabel={`Print receipt via ${selectedPrinterType}`}>
            {printLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Icon
                name={selectedPrinterType === 'thermal' ? 'printer-pos-outline' : 'printer-outline'}
                size={18}
                color="#FFFFFF"
              />
            )}
            <Text style={styles.actionButtonText}>
              {printLoading
                ? 'Printing…'
                : `Print (${selectedPrinterType === 'office' ? 'Office A4' : 'Thermal'})`}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleEnqueueAction}
            style={({pressed}) => [
              styles.actionButton,
              styles.enqueueButton,
              pressed && styles.pressed,
            ]}
            accessibilityLabel="Enqueue Receipt">
            <Icon name="tray-arrow-down" size={18} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Enqueue</Text>
          </Pressable>
        </View>

        {pdfError ? <Text style={styles.pdfError}>{pdfError}</Text> : null}

        {printerError ? (
          <View style={styles.printerErrorCard}>
            <Icon name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.printerErrorText}>{printerError}</Text>
          </View>
        ) : null}

        {printSuccessMessage ? (
          <View style={styles.printerSuccessCard}>
            <Icon name="check-circle-outline" size={18} color={Colors.active} />
            <Text style={styles.printerSuccessText}>{printSuccessMessage}</Text>
          </View>
        ) : null}

        {enqueueSuccessMessage ? (
          <View style={styles.printerSuccessCard}>
            <Icon name="check-circle-outline" size={18} color={Colors.active} />
            <Text style={styles.printerSuccessText}>{enqueueSuccessMessage}</Text>
          </View>
        ) : null}

        <DetailSection title="Transaction">
          <KeyValueRows
            rows={[
              ['Transaction Type', receipt.transactionType],
              ['Transaction Number', receipt.transactionNumber],
              ['Date', receipt.date],
              ['Source File', receipt.sourceFile?.driveFileName],
              ['Drive File ID', receipt.sourceFile?.driveFileId],
            ]}
          />
        </DetailSection>

        <DetailSection title="Customer">
          <KeyValueRows
            emptyText="No customer details were supplied."
            rows={[
              ['Name', receipt.customer.name],
              ['Address 1', receipt.customer.address1],
              ['Address 2', receipt.customer.address2],
              ['City', receipt.customer.city],
              ['Country', receipt.customer.country],
              ['Phone', receipt.customer.phone],
              ['Fax / Telex', receipt.customer.fax],
              ['Account Type', receipt.customer.accountType],
              ['Account Number', receipt.customer.accountNumber],
            ]}
          />
        </DetailSection>

        <DetailSection title="Totals">
          <KeyValueRows
            rows={[
              ['Subtotal', formatNumber(receipt.financials.subtotal)],
              ['Discount', formatNumber(receipt.financials.discountAmount)],
              ['Freight', formatNumber(receipt.financials.freight)],
              ['Taxable Amount', formatNumber(receipt.financials.taxableAmount)],
              ['VAT', formatNumber(receipt.financials.vatAmount)],
              ['VAT Rate', receipt.financials.vatRate === undefined ? undefined : `${receipt.financials.vatRate}%`],
              ['Rounding', formatNumber(receipt.financials.rounding)],
              ['Total', formatNumber(receipt.financials.total)],
            ]}
          />
        </DetailSection>

        <DetailSection title="Additional Transaction Details">
          <KeyValueRows
            emptyText="No additional transaction details were supplied."
            rows={[
              ['Salesman', receipt.additional.salesman],
              ['TRN', receipt.additional.trn],
              ['LPO Number', receipt.additional.lpoNumber],
              ['LPO Date', receipt.additional.lpoDate],
              ['Remarks', receipt.additional.remarks],
              ['Area', receipt.additional.area],
              ['Supply Date', receipt.additional.supplyDate],
              ['Transaction Code', receipt.additional.tranCode],
              ['Tax Code', receipt.additional.taxCode],
              ['VAT Tag', receipt.additional.vatTag],
              ['Country Code', receipt.additional.countryCode],
              ['Supplier Country', receipt.additional.msupCountry],
              ['VAT Status', receipt.additional.vatStatus],
              ['TRN Term', formatNumber(receipt.additional.trnTerm)],
            ]}
          />
        </DetailSection>

        <DetailSection title={`Line Items (${receipt.items.length})`}>
          {receipt.items.map((item, index) => (
            <LineItemCard key={index} item={item} index={index} />
          ))}
        </DetailSection>

        <RawSourceFields receipt={receipt} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TransactionHeader({receipt}: {receipt: Receipt}) {
  return (
    <View style={styles.headerCard}>
      <View style={styles.headerIcon}>
        <Icon name="file-document-outline" size={24} color={Colors.primaryLight} />
      </View>
      <View style={styles.headerContent}>
        <Text style={styles.headerEyebrow}>PARSED TRANSACTION</Text>
        <Text style={styles.headerTitle}>{receipt.transactionType} · {receipt.transactionNumber}</Text>
        <Text style={styles.headerSubtitle}>
          {receipt.items.length} line item{receipt.items.length === 1 ? '' : 's'}
          {receipt.customer.name ? ` · ${receipt.customer.name}` : ''}
        </Text>
      </View>
    </View>
  );
}

function DetailSection({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function KeyValueRows({
  rows,
  emptyText = 'No values available.',
}: {
  rows: Array<[string, string | undefined]>;
  emptyText?: string;
}) {
  const populatedRows = rows.filter(([, value]) => value !== undefined && value !== '');
  if (populatedRows.length === 0) {
    return <Text style={styles.emptyText}>{emptyText}</Text>;
  }

  return (
    <View>
      {populatedRows.map(([label, value], index) => (
        <View key={label} style={[styles.keyValueRow, index > 0 && styles.keyValueDivider]}>
          <Text style={styles.keyLabel}>{label}</Text>
          <Text style={styles.keyValue} selectable>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function LineItemCard({item, index}: {item: ReceiptItem; index: number}) {
  return (
    <View style={[styles.itemCard, index > 0 && styles.itemCardGap]}>
      <View style={styles.itemHeading}>
        <Text style={styles.itemIndex}>ITEM {index + 1}</Text>
        <Text style={styles.itemAmount}>{formatNumber(item.amount) ?? '—'}</Text>
      </View>
      <Text style={styles.itemDescription}>{item.description ?? 'No description'}</Text>
      <KeyValueRows
        rows={[
          ['Product ID', item.productId],
          ['Unit', item.unit],
          ['Quantity', formatNumber(item.quantity)],
          ['Rate', formatNumber(item.rate)],
          ['Amount', formatNumber(item.amount)],
          ['Item VAT', formatNumber(item.vatAmount)],
          ['Item Discount', formatNumber(item.itemDiscount)],
          ['Batch', item.batch],
          ['Manufacture Date', item.manufactureDate],
          ['Expiry Date', item.expiryDate],
          ['Brand', item.brand],
          ['Dimension', item.dimension],
          ['Net Weight', formatNumber(item.netWeight)],
          ['Gross Weight', formatNumber(item.grossWeight)],
          ['Arabic Description', item.arabicDescription],
        ]}
      />
    </View>
  );
}

function RawSourceFields({receipt}: {receipt: Receipt}) {
  const [expanded, setExpanded] = useState(false);
  const rawFieldCount = useMemo(
    () => receipt.items.reduce((count, item) => count + Object.keys(item.sourceFields).length, 0),
    [receipt.items],
  );

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setExpanded(value => !value)}
        style={({pressed}) => [styles.sourceToggle, pressed && styles.pressed]}
        accessibilityLabel="View all source fields">
        <View style={styles.sourceToggleIcon}>
          <Icon name="database-outline" size={20} color={Colors.primaryLight} />
        </View>
        <View style={styles.sourceToggleContent}>
          <Text style={styles.sourceToggleTitle}>View All Source Fields</Text>
          <Text style={styles.sourceToggleDescription}>
            {rawFieldCount} original column/value pairs across {receipt.items.length} line item{receipt.items.length === 1 ? '' : 's'}
          </Text>
        </View>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
      </Pressable>

      {expanded ? receipt.items.map((item, index) => (
        <SourceFieldTable key={index} sourceFields={item.sourceFields} lineNumber={index + 1} />
      )) : null}
    </View>
  );
}

function SourceFieldTable({
  sourceFields,
  lineNumber,
}: {
  sourceFields: RawWinsoftRow;
  lineNumber: number;
}) {
  return (
    <View style={styles.sourceCard}>
      <Text style={styles.sourceCardTitle}>Line {lineNumber} source fields</Text>
      {Object.entries(sourceFields).map(([column, value], index) => (
        <View key={`${column}-${index}`} style={[styles.sourceRow, index > 0 && styles.keyValueDivider]}>
          <Text style={styles.sourceColumn} selectable>{column}</Text>
          <Text style={styles.sourceValue} selectable>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function formatNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxl},
  headerCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: `${Colors.primary}55`, padding: Spacing.base,
    ...Shadow.md,
  },
  headerIcon: {width: 48, height: 48, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}22`},
  headerContent: {flex: 1},
  headerEyebrow: {...Typography.label, color: Colors.primaryLight},
  headerTitle: {...Typography.title, color: Colors.textPrimary, marginTop: 2},
  headerSubtitle: {...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.xxs},
  actionsRow: {flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap'},
  actionButton: {flex: 1, minWidth: '48%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderRadius: BorderRadius.md, padding: Spacing.md, ...Shadow.sm},
  pdfButton: {backgroundColor: Colors.primary},
  printButton: {backgroundColor: Colors.warning},
  enqueueButton: {backgroundColor: Colors.active},
  actionButtonText: {...Typography.bodyMedium, color: '#FFFFFF', fontSize: 13, fontWeight: '600'},
  pdfError: {...Typography.caption, color: Colors.error, backgroundColor: Colors.errorDim, borderRadius: BorderRadius.sm, padding: Spacing.sm},
  printerErrorCard: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.errorDim, borderColor: `${Colors.error}55`, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md},
  printerErrorText: {...Typography.caption, color: Colors.error, flex: 1},
  printerSuccessCard: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: `${Colors.active}18`, borderColor: `${Colors.active}55`, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md},
  printerSuccessText: {...Typography.caption, color: Colors.active, flex: 1},
  section: {marginTop: Spacing.sm},
  sectionTitle: {...Typography.label, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.xs, paddingHorizontal: Spacing.xxs},
  sectionCard: {backgroundColor: Colors.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm},
  keyValueRow: {flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm},
  keyValueDivider: {borderTopWidth: 1, borderTopColor: Colors.border},
  keyLabel: {...Typography.captionMedium, color: Colors.textSecondary, flex: 0.45},
  keyValue: {...Typography.caption, color: Colors.textPrimary, flex: 0.55, textAlign: 'right'},
  emptyText: {...Typography.caption, color: Colors.textTertiary, padding: Spacing.md},
  itemCard: {backgroundColor: Colors.cardElevated, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md},
  itemCardGap: {marginTop: Spacing.sm},
  itemHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xxs},
  itemIndex: {...Typography.label, color: Colors.primaryLight},
  itemAmount: {...Typography.bodyMedium, color: Colors.active},
  itemDescription: {...Typography.bodyMedium, color: Colors.textPrimary, marginBottom: Spacing.sm},
  sourceToggle: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: `${Colors.primary}55`, padding: Spacing.md, ...Shadow.sm},
  sourceToggleIcon: {width: 38, height: 38, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}22`},
  sourceToggleContent: {flex: 1},
  sourceToggleTitle: {...Typography.bodyMedium, color: Colors.textPrimary},
  sourceToggleDescription: {...Typography.caption, color: Colors.textSecondary, marginTop: 2},
  sourceCard: {backgroundColor: Colors.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm, overflow: 'hidden'},
  sourceCardTitle: {...Typography.captionMedium, color: Colors.primaryLight, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: `${Colors.primary}12`},
  sourceRow: {flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm},
  sourceColumn: {...Typography.captionMedium, color: Colors.textSecondary, flex: 0.45},
  sourceValue: {...Typography.caption, color: Colors.textPrimary, flex: 0.55, textAlign: 'right'},
  pressed: {opacity: 0.75},
  missingState: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl, gap: Spacing.sm},
  missingTitle: {...Typography.title, color: Colors.textPrimary, marginTop: Spacing.sm},
  missingText: {...Typography.body, color: Colors.textSecondary, textAlign: 'center'},
});
