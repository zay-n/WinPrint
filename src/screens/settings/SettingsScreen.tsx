/**
 * Winsoft Print Station — Settings Screen
 *
 * Grouped settings layout. All items are placeholders in Phase 1.
 * The groups reflect the final settings architecture so navigation
 * slots can be wired up in later phases.
 *
 * Groups:
 *  - Google Drive
 *  - Receipt Template
 *  - Printer
 *  - Monitoring
 *  - App
 */

import React, {useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import Icon from '../../components/Icon';
import SectionHeader from '../../components/SectionHeader';
import SettingsRow from '../../components/SettingsRow';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';
import type {BluetoothDevice, PrinterType} from '../../services/printer/PrinterAdapter';

export default function SettingsScreen() {
  const user = useAppStore(s => s.user);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);

  const selectedPrinterType = useAppStore(s => s.selectedPrinterType);
  const selectedBluetoothDevice = useAppStore(s => s.selectedBluetoothDevice);
  const pairedDevices = useAppStore(s => s.pairedDevices);
  const devicesLoading = useAppStore(s => s.devicesLoading);
  const printerError = useAppStore(s => s.printerError);
  const setPrinterType = useAppStore(s => s.setPrinterType);
  const setSelectedBluetoothDevice = useAppStore(s => s.setSelectedBluetoothDevice);
  const loadPairedDevices = useAppStore(s => s.loadPairedDevices);
  const connectBluetoothPrinter = useAppStore(s => s.connectBluetoothPrinter);
  const testPrintCurrentPrinter = useAppStore(s => s.testPrintCurrentPrinter);
  const clearPrinterError = useAppStore(s => s.clearPrinterError);

  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [connectionModalVisible, setConnectionModalVisible] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const handleSelectType = (type: PrinterType) => {
    setPrinterType(type);
    setTypeModalVisible(false);
    setTestSuccess(null);
  };

  const handleSelectDevice = async (device: BluetoothDevice) => {
    setTestSuccess(null);
    setSelectedBluetoothDevice(device);
    setDeviceModalVisible(false);
    await connectBluetoothPrinter(device);
  };

  const handleTestPrint = async () => {
    setTestingPrint(true);
    setTestSuccess(null);
    clearPrinterError();
    try {
      const result = await testPrintCurrentPrinter();
      if (result.success) {
        const target =
          selectedPrinterType === 'office'
            ? 'Sent to Android Print Spooler'
            : `Sent to ${selectedBluetoothDevice?.name || 'Thermal Printer'}`;
        setTestSuccess(`Test print successful! (${target})`);
      }
    } finally {
      setTestingPrint(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Google Drive ─────────────────────────────────────────── */}
        <SectionHeader title="Google Drive" />
        <View style={styles.group}>
          <SettingsRow
            icon="account-circle-outline"
            iconColor={user ? Colors.active : Colors.inactive}
            label="Google Account"
            detail={user ? user.email : 'Not signed in'}
            isFirst
          />
          <SettingsRow
            icon="folder-google-drive"
            iconColor="#4285F4"
            label="Source Folder"
            detail={sourceFolderName ?? 'Not configured'}
          />
          <SettingsRow
            icon="folder-move-outline"
            iconColor="#4285F4"
            label="Printed Folder"
            detail="Not configured"
            isLast
          />
        </View>

        {/* ── Receipt Template ─────────────────────────────────────── */}
        <SectionHeader title="Receipt Template" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="office-building-outline"
            iconColor={Colors.primary}
            label="Business Information"
            detail="Not configured"
            isFirst
          />
          <SettingsRow
            icon="image-outline"
            iconColor={Colors.primary}
            label="Logo"
            detail="None"
          />
          <SettingsRow
            icon="format-list-checks"
            iconColor={Colors.primary}
            label="Receipt Fields"
            detail="Default"
          />
          <SettingsRow
            icon="ruler-square"
            iconColor={Colors.primary}
            label="Paper Size"
            detail="A4"
          />
          <SettingsRow
            icon="text-box-outline"
            iconColor={Colors.primary}
            label="Footer Text"
            detail="Not set"
            isLast
          />
        </View>

        {/* ── Printer ──────────────────────────────────────────────── */}
        <SectionHeader title="Printer" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="printer-settings-outline"
            iconColor={Colors.warning}
            label="Printer Type"
            detail={
              selectedPrinterType === 'office'
                ? 'Office Printer (A4)'
                : '80mm Thermal Printer'
            }
            onPress={() => setTypeModalVisible(true)}
            isFirst
          />
          <SettingsRow
            icon="printer-outline"
            iconColor={Colors.warning}
            label="Selected Printer"
            detail={
              selectedPrinterType === 'office'
                ? 'System Print Spooler'
                : selectedBluetoothDevice?.name || 'Tap to select device'
            }
            onPress={() => {
              if (selectedPrinterType === 'thermal') {
                loadPairedDevices();
                setDeviceModalVisible(true);
              } else {
                setTypeModalVisible(true);
              }
            }}
          />
          <SettingsRow
            icon="cellphone-wireless"
            iconColor={Colors.warning}
            label="Connection Method"
            detail={
              selectedPrinterType === 'office'
                ? 'Android Print Framework'
                : 'Bluetooth (SPP)'
            }
            onPress={() => setConnectionModalVisible(true)}
          />
          <SettingsRow
            icon="test-tube-outline"
            iconColor={Colors.warning}
            label={testingPrint ? 'Sending Test Print…' : 'Test Print'}
            detail={testingPrint ? 'Working…' : 'Tap to test'}
            onPress={handleTestPrint}
            isLast
          />
        </View>

        {printerError ? (
          <View style={styles.printerErrorCard}>
            <Icon name="alert-circle-outline" size={18} color={Colors.error} />
            <Text style={styles.printerErrorText}>{printerError}</Text>
            <TouchableOpacity onPress={clearPrinterError}>
              <Icon name="close" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {testSuccess ? (
          <View style={styles.printerSuccessCard}>
            <Icon name="check-circle-outline" size={18} color={Colors.active} />
            <Text style={styles.printerSuccessText}>{testSuccess}</Text>
          </View>
        ) : null}

        {/* ── Monitoring ───────────────────────────────────────────── */}
        <SectionHeader title="Monitoring" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="radar"
            iconColor={Colors.active}
            label="Background Monitoring"
            detail="Disabled"
            isFirst
          />
          <SettingsRow
            icon="printer-pos-outline"
            iconColor={Colors.active}
            label="Auto-Print"
            detail="Off"
          />
          <SettingsRow
            icon="bell-outline"
            iconColor={Colors.active}
            label="Notifications"
            detail="Not configured"
            isLast
          />
        </View>

        {/* ── App ──────────────────────────────────────────────────── */}
        <SectionHeader title="App" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="information-outline"
            iconColor={Colors.textSecondary}
            label="About"
            detail="v0.1.0"
            isFirst
          />
          <SettingsRow
            icon="file-document-outline"
            iconColor={Colors.textSecondary}
            label="Logs"
            isLast
          />
        </View>

        {/* Build info */}
        <Text style={styles.buildInfo}>
          Winsoft Print Station · Phase 1 · Build 1
        </Text>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── Printer Type Modal ── */}
      <Modal
        visible={typeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTypeModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Printer Type</Text>
            <Text style={styles.modalSubtitle}>
              Choose the physical printer output pipeline
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.modalOption,
                selectedPrinterType === 'office' && styles.modalOptionSelected,
              ]}
              onPress={() => handleSelectType('office')}>
              <View style={styles.modalOptionIconWrap}>
                <Icon name="printer-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.modalOptionContent}>
                <Text style={styles.modalOptionTitle}>Office Printer (A4 PDF)</Text>
                <Text style={styles.modalOptionDesc}>
                  Android Print Framework spooler for Wi-Fi, network, or Mopria office printers.
                </Text>
              </View>
              {selectedPrinterType === 'office' && (
                <Icon name="check-circle" size={20} color={Colors.primary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.modalOption,
                selectedPrinterType === 'thermal' && styles.modalOptionSelected,
              ]}
              onPress={() => handleSelectType('thermal')}>
              <View style={styles.modalOptionIconWrap}>
                <Icon name="printer-pos-outline" size={24} color={Colors.warning} />
              </View>
              <View style={styles.modalOptionContent}>
                <Text style={styles.modalOptionTitle}>80mm Thermal Printer</Text>
                <Text style={styles.modalOptionDesc}>
                  ESC/POS receipt format via Bluetooth SPP wireless connection.
                </Text>
              </View>
              {selectedPrinterType === 'thermal' && (
                <Icon name="check-circle" size={20} color={Colors.warning} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setTypeModalVisible(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Bluetooth Device Modal ── */}
      <Modal
        visible={deviceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeviceModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Paired Bluetooth Printers</Text>
              <TouchableOpacity
                onPress={loadPairedDevices}
                disabled={devicesLoading}
                style={styles.refreshIconBtn}>
                {devicesLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Icon name="refresh" size={20} color={Colors.primary} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Select a paired 80mm ESC/POS thermal printer
            </Text>

            <ScrollView style={styles.deviceList} showsVerticalScrollIndicator={false}>
              {pairedDevices.length === 0 ? (
                <View style={styles.emptyDevices}>
                  <Icon name="bluetooth-off" size={32} color={Colors.inactive} />
                  <Text style={styles.emptyDevicesText}>
                    No paired Bluetooth devices found.{'\n'}Pair your thermal printer in Android Bluetooth Settings first, then tap refresh.
                  </Text>
                </View>
              ) : (
                pairedDevices.map(device => {
                  const isSelected = selectedBluetoothDevice?.address === device.address;
                  return (
                    <TouchableOpacity
                      key={device.address}
                      activeOpacity={0.7}
                      style={[
                        styles.deviceItem,
                        isSelected && styles.deviceItemSelected,
                      ]}
                      onPress={() => handleSelectDevice(device)}>
                      <Icon
                        name="printer-pos-outline"
                        size={20}
                        color={isSelected ? Colors.warning : Colors.textSecondary}
                      />
                      <View style={styles.deviceItemContent}>
                        <Text style={styles.deviceItemName}>{device.name}</Text>
                        <Text style={styles.deviceItemAddress}>{device.address}</Text>
                      </View>
                      {isSelected && (
                        <Icon name="check-circle" size={18} color={Colors.warning} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setDeviceModalVisible(false)}>
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Connection Method Modal ── */}
      <Modal
        visible={connectionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConnectionModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Connection Method</Text>
            <Text style={styles.modalSubtitle}>
              Physical connection options for the active printer
            </Text>

            {selectedPrinterType === 'office' ? (
              <View style={[styles.connectionItem, styles.connectionItemActive]}>
                <Icon name="android" size={22} color={Colors.active} />
                <View style={styles.connectionItemContent}>
                  <Text style={styles.connectionItemTitle}>Android Print Framework</Text>
                  <Text style={styles.connectionItemDesc}>
                    Active · System Print Spooler handles Wi-Fi, Ethernet, and cloud print services.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={[styles.connectionItem, styles.connectionItemActive]}>
                  <Icon name="bluetooth" size={22} color={Colors.active} />
                  <View style={styles.connectionItemContent}>
                    <Text style={styles.connectionItemTitle}>Bluetooth Classic (SPP)</Text>
                    <Text style={styles.connectionItemDesc}>
                      Active · Wireless RFCOMM serial port profile for 80mm ESC/POS.
                    </Text>
                  </View>
                </View>

                <View style={[styles.connectionItem, styles.connectionItemDisabled]}>
                  <Icon name="usb" size={22} color={Colors.textTertiary} />
                  <View style={styles.connectionItemContent}>
                    <Text style={styles.connectionItemTitleDisabled}>USB (OTG / Direct)</Text>
                    <Text style={styles.connectionItemDesc}>
                      Future adapter option · Hardware direct cable connection.
                    </Text>
                  </View>
                </View>

                <View style={[styles.connectionItem, styles.connectionItemDisabled]}>
                  <Icon name="lan" size={22} color={Colors.textTertiary} />
                  <View style={styles.connectionItemContent}>
                    <Text style={styles.connectionItemTitleDisabled}>LAN / Ethernet</Text>
                    <Text style={styles.connectionItemDesc}>
                      Future adapter option · TCP/IP socket network thermal printer.
                    </Text>
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setConnectionModalVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  scroll: {flex: 1},
  content: {
    padding: Spacing.base,
    paddingTop: Spacing.md,
  },

  sectionGap: {
    marginTop: Spacing.xl,
  },

  group: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadow.sm,
    marginTop: Spacing.xs,
  },

  printerErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorDim,
    borderColor: `${Colors.error}55`,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  printerErrorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  printerSuccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: `${Colors.active}18`,
    borderColor: `${Colors.active}55`,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  printerSuccessText: {
    ...Typography.caption,
    color: Colors.active,
    flex: 1,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: Spacing.base,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    maxHeight: '80%',
    ...Shadow.lg,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.title,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.base,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modalOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}12`,
  },
  modalOptionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardElevated,
  },
  modalOptionContent: {
    flex: 1,
  },
  modalOptionTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  modalOptionDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  refreshIconBtn: {
    padding: Spacing.xs,
  },
  deviceList: {
    maxHeight: 240,
    marginBottom: Spacing.md,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  deviceItemSelected: {
    borderColor: Colors.warning,
    backgroundColor: `${Colors.warning}14`,
  },
  deviceItemContent: {
    flex: 1,
  },
  deviceItemName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  deviceItemAddress: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  emptyDevices: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyDevicesText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  connectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  connectionItemActive: {
    borderColor: `${Colors.active}66`,
    backgroundColor: `${Colors.active}0A`,
  },
  connectionItemDisabled: {
    opacity: 0.55,
  },
  connectionItemContent: {
    flex: 1,
  },
  connectionItemTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  connectionItemTitleDisabled: {
    ...Typography.bodyMedium,
    color: Colors.textTertiary,
  },
  connectionItemDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalCloseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardElevated,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  modalCloseText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },

  buildInfo: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },

  bottomPad: {height: Spacing.xl},
});
