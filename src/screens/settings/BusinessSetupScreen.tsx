import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppStore} from '../../store/useAppStore';
import {Colors, Spacing, Typography, BorderRadius, Shadow} from '../../theme';
import SectionHeader from '../../components/SectionHeader';
import Icon from '../../components/Icon';
import type {SettingsStackParamList} from '../../navigation/types';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<SettingsStackParamList, 'BusinessSetup'>;

export default function BusinessSetupScreen({navigation}: Props) {
  const profile = useAppStore(s => s.businessProfile);
  const a4 = useAppStore(s => s.a4Template);
  const thermal = useAppStore(s => s.thermalTemplate);

  const updateProfile = useAppStore(s => s.updateBusinessProfile);
  const updateA4 = useAppStore(s => s.updateA4Template);
  const updateThermal = useAppStore(s => s.updateThermalTemplate);

  const [activeTab, setActiveTab] = useState<'profile' | 'a4' | 'thermal'>('profile');

  // Input helper to avoid creating inline functions for every input
  const handleProfileChange = (category: keyof typeof profile, field: string, value: string) => {
    updateProfile({
      [category]: {
        ...(profile[category] as any),
        [field]: value,
      },
    });
  };

  const InputRow = ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (text: string) => void;
    placeholder?: string;
  }) => (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
      />
    </View>
  );

  const SwitchRow = ({
    label,
    value,
    onValueChange,
  }: {
    label: string;
    value: boolean;
    onValueChange: (val: boolean) => void;
  }) => (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{false: Colors.inactive, true: Colors.active}}
        thumbColor={Colors.textPrimary}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
          onPress={() => setActiveTab('profile')}>
          <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
            Business
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'a4' && styles.tabActive]}
          onPress={() => setActiveTab('a4')}>
          <Text style={[styles.tabText, activeTab === 'a4' && styles.tabTextActive]}>
            A4 Receipt
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'thermal' && styles.tabActive]}
          onPress={() => setActiveTab('thermal')}>
          <Text style={[styles.tabText, activeTab === 'thermal' && styles.tabTextActive]}>
            80mm Receipt
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {activeTab === 'profile' && (
            <>
              <SectionHeader title="Identity" />
              <View style={styles.card}>
                <InputRow
                  label="Business Name"
                  value={profile.identity.businessName}
                  onChange={t => handleProfileChange('identity', 'businessName', t)}
                  placeholder="e.g. WINSOFT PRINT STATION"
                />
              </View>

              <SectionHeader title="Contact" style={styles.sectionGap} />
              <View style={styles.card}>
                <InputRow
                  label="Address Line 1"
                  value={profile.contact.addressLine1}
                  onChange={t => handleProfileChange('contact', 'addressLine1', t)}
                />
                <InputRow
                  label="Address Line 2"
                  value={profile.contact.addressLine2 || ''}
                  onChange={t => handleProfileChange('contact', 'addressLine2', t)}
                />
                <InputRow
                  label="City"
                  value={profile.contact.city}
                  onChange={t => handleProfileChange('contact', 'city', t)}
                />
                <InputRow
                  label="Country"
                  value={profile.contact.country}
                  onChange={t => handleProfileChange('contact', 'country', t)}
                />
                <InputRow
                  label="Phone"
                  value={profile.contact.phone}
                  onChange={t => handleProfileChange('contact', 'phone', t)}
                />
                <InputRow
                  label="Email"
                  value={profile.contact.email || ''}
                  onChange={t => handleProfileChange('contact', 'email', t)}
                />
              </View>

              <SectionHeader title="Tax & Registration" style={styles.sectionGap} />
              <View style={styles.card}>
                <InputRow
                  label="Tax Label (e.g. TRN/VAT)"
                  value={profile.tax.taxRegistrationLabel}
                  onChange={t => handleProfileChange('tax', 'taxRegistrationLabel', t)}
                />
                <InputRow
                  label="Tax Number"
                  value={profile.tax.taxRegistrationNumber || ''}
                  onChange={t => handleProfileChange('tax', 'taxRegistrationNumber', t)}
                />
              </View>

              <SectionHeader title="Receipt Defaults" style={styles.sectionGap} />
              <View style={styles.card}>
                <InputRow
                  label="Receipt Title"
                  value={profile.receiptDefaults.receiptTitle}
                  onChange={t => handleProfileChange('receiptDefaults', 'receiptTitle', t)}
                />
                <InputRow
                  label="Currency Symbol"
                  value={profile.receiptDefaults.currencySymbol}
                  onChange={t => handleProfileChange('receiptDefaults', 'currencySymbol', t)}
                />
                <InputRow
                  label="Footer Message"
                  value={profile.footer.footerMessage || ''}
                  onChange={t => handleProfileChange('footer', 'footerMessage', t)}
                />
              </View>

              <SectionHeader title="Logo (Coming Soon)" style={styles.sectionGap} />
              <View style={styles.card}>
                <View style={styles.logoPlaceholder}>
                  <Icon name="image-plus" size={32} color={Colors.textTertiary} />
                  <Text style={styles.logoText}>Logo selection will be available in a future update.</Text>
                </View>
              </View>
            </>
          )}

          {activeTab === 'a4' && (
            <>
              <SectionHeader title="Visibility - Header" />
              <View style={styles.card}>
                <SwitchRow label="Show Business Name" value={a4.showBusinessName} onValueChange={v => updateA4({showBusinessName: v})} />
                <SwitchRow label="Show Address" value={a4.showAddress} onValueChange={v => updateA4({showAddress: v})} />
                <SwitchRow label="Show Phone" value={a4.showPhone} onValueChange={v => updateA4({showPhone: v})} />
                <SwitchRow label="Show Tax Registration" value={a4.showTaxRegistration} onValueChange={v => updateA4({showTaxRegistration: v})} />
              </View>

              <SectionHeader title="Visibility - Transaction" style={styles.sectionGap} />
              <View style={styles.card}>
                <SwitchRow label="Show Invoice Number" value={a4.showInvoiceNumber} onValueChange={v => updateA4({showInvoiceNumber: v})} />
                <SwitchRow label="Show Date" value={a4.showDate} onValueChange={v => updateA4({showDate: v})} />
                <SwitchRow label="Show Customer Name" value={a4.showCustomerName} onValueChange={v => updateA4({showCustomerName: v})} />
                <SwitchRow label="Show Salesman" value={a4.showSalesman} onValueChange={v => updateA4({showSalesman: v})} />
              </View>

              <SectionHeader title="Visibility - Line Items" style={styles.sectionGap} />
              <View style={styles.card}>
                <SwitchRow label="Show Item Code" value={a4.showItemCode} onValueChange={v => updateA4({showItemCode: v})} />
                <SwitchRow label="Show Item Description" value={a4.showItemDescription} onValueChange={v => updateA4({showItemDescription: v})} />
                <SwitchRow label="Show Quantity" value={a4.showQuantity} onValueChange={v => updateA4({showQuantity: v})} />
                <SwitchRow label="Show Unit Price" value={a4.showUnitPrice} onValueChange={v => updateA4({showUnitPrice: v})} />
                <SwitchRow label="Show Item Total" value={a4.showItemTotal} onValueChange={v => updateA4({showItemTotal: v})} />
              </View>

              <SectionHeader title="Visibility - Totals & Footer" style={styles.sectionGap} />
              <View style={styles.card}>
                <SwitchRow label="Show Subtotal" value={a4.showSubtotal} onValueChange={v => updateA4({showSubtotal: v})} />
                <SwitchRow label="Show Discount" value={a4.showTotalDiscount} onValueChange={v => updateA4({showTotalDiscount: v})} />
                <SwitchRow label="Show VAT" value={a4.showVatTotal} onValueChange={v => updateA4({showVatTotal: v})} />
                <SwitchRow label="Show Grand Total" value={a4.showGrandTotal} onValueChange={v => updateA4({showGrandTotal: v})} />
                <SwitchRow label="Show Separators" value={a4.showSeparators} onValueChange={v => updateA4({showSeparators: v})} />
                <SwitchRow label="Show Footer Message" value={a4.showFooter} onValueChange={v => updateA4({showFooter: v})} />
              </View>
            </>
          )}

          {activeTab === 'thermal' && (
            <>
              <SectionHeader title="Visibility - Header" />
              <View style={styles.card}>
                <SwitchRow label="Show Business Name" value={thermal.showBusinessName} onValueChange={v => updateThermal({showBusinessName: v})} />
                <SwitchRow label="Show Address" value={thermal.showAddress} onValueChange={v => updateThermal({showAddress: v})} />
                <SwitchRow label="Show Phone" value={thermal.showPhone} onValueChange={v => updateThermal({showPhone: v})} />
                <SwitchRow label="Show Tax Registration" value={thermal.showTaxRegistration} onValueChange={v => updateThermal({showTaxRegistration: v})} />
              </View>

              <SectionHeader title="Visibility - Transaction" style={styles.sectionGap} />
              <View style={styles.card}>
                <SwitchRow label="Show Invoice Number" value={thermal.showInvoiceNumber} onValueChange={v => updateThermal({showInvoiceNumber: v})} />
                <SwitchRow label="Show Date/Time" value={thermal.showDateTime} onValueChange={v => updateThermal({showDateTime: v})} />
                <SwitchRow label="Show Customer Name" value={thermal.showCustomerName} onValueChange={v => updateThermal({showCustomerName: v})} />
                <SwitchRow label="Show Salesman" value={thermal.showSalesman} onValueChange={v => updateThermal({showSalesman: v})} />
              </View>

              <SectionHeader title="Visibility - Line Items" style={styles.sectionGap} />
              <View style={styles.card}>
                <SwitchRow label="Show Item Code" value={thermal.showItemCode} onValueChange={v => updateThermal({showItemCode: v})} />
                <SwitchRow label="Show Item Description" value={thermal.showItemDescription} onValueChange={v => updateThermal({showItemDescription: v})} />
                <SwitchRow label="Show Quantity" value={thermal.showQuantity} onValueChange={v => updateThermal({showQuantity: v})} />
                <SwitchRow label="Show Unit Price" value={thermal.showUnitPrice} onValueChange={v => updateThermal({showUnitPrice: v})} />
                <SwitchRow label="Show Item Total" value={thermal.showItemTotal} onValueChange={v => updateThermal({showItemTotal: v})} />
              </View>

              <SectionHeader title="Visibility - Totals & Footer" style={styles.sectionGap} />
              <View style={styles.card}>
                <SwitchRow label="Show Subtotal" value={thermal.showSubtotal} onValueChange={v => updateThermal({showSubtotal: v})} />
                <SwitchRow label="Show Discount" value={thermal.showDiscount} onValueChange={v => updateThermal({showDiscount: v})} />
                <SwitchRow label="Show VAT" value={thermal.showVat} onValueChange={v => updateThermal({showVat: v})} />
                <SwitchRow label="Show Grand Total" value={thermal.showGrandTotal} onValueChange={v => updateThermal({showGrandTotal: v})} />
                <SwitchRow label="Show Separators" value={thermal.showSeparators} onValueChange={v => updateThermal({showSeparators: v})} />
                <SwitchRow label="Show Footer Message" value={thermal.showFooter} onValueChange={v => updateThermal({showFooter: v})} />
              </View>
            </>
          )}
          
          <View style={styles.bottomPad} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  flex: {flex: 1},
  scroll: {flex: 1},
  content: {
    padding: Spacing.base,
    paddingTop: Spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  sectionGap: {
    marginTop: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  inputRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  textInput: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    padding: 0,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  switchLabel: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  logoPlaceholder: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  bottomPad: {
    height: 40,
  },
});
