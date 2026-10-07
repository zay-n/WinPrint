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
 */import React, {useCallback, useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Modal, Alert, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {SettingsScreenProps} from '../../navigation/types';

import Icon from '../../components/Icon';
import SectionHeader from '../../components/SectionHeader';
import SettingsRow from '../../components/SettingsRow';
import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';
import type {BluetoothDevice, PrinterType} from '../../services/printer/PrinterAdapter';
import * as MonitoringService from '../../services/monitoring/MonitoringService';
import DriveFolderPickerModal from '../../components/DriveFolderPickerModal';
import {buildThermalReceipt} from '../../services/printer/escpos/EscPosReceiptBuilder';
import {debugEscPos} from '../../services/printer/escpos/debugEscPos';
import type {Receipt} from '../../models/Receipt';

export default function SettingsScreen({navigation}: SettingsScreenProps) {
  const user = useAppStore(s => s.user);
  const authProfile = useAppStore(s => s.authProfile);
  const signOut = useAppStore(s => s.signOut);
  const accessToken = useAppStore(s => s.accessToken);
  const sourceFolderId = useAppStore(s => s.sourceFolderId);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);
  const sourceFolderPath = useAppStore(s => s.sourceFolderPath);
  const archiveFolderId = useAppStore(s => s.archiveFolderId);
  const archiveFolderName = useAppStore(s => s.archiveFolderName);
  const archiveFolderPath = useAppStore(s => s.archiveFolderPath);
  const selectFolder = useAppStore(s => s.selectFolder);
  const selectArchiveFolder = useAppStore(s => s.selectArchiveFolder);
  const businessProfile = useAppStore(s => s.businessProfile);

  const [folderPickerMode, setFolderPickerMode] = useState<'source' | 'archive' | null>(null);

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

  const monitoringEnabled = useAppStore(s => s.monitoringEnabled);
  const fcmRegistrationStatus = useAppStore(s => s.fcmRegistrationStatus);
  const serviceAccountEmail = useAppStore(s => s.serviceAccountEmail);
  const lastDriveNotificationAt = useAppStore(s => s.lastDriveNotificationAt);
  const lastReconciliationAt = useAppStore(s => s.lastReconciliationAt);
  const lastMonitoringError = useAppStore(s => s.lastMonitoringError);
  const enableMonitoring = useAppStore(s => s.enableMonitoring);
  const disableMonitoring = useAppStore(s => s.disableMonitoring);
  const setMonitoringError = useAppStore(s => s.setMonitoringError);

  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [connectionModalVisible, setConnectionModalVisible] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    let mounted = true;
    MonitoringService.getNotificationPermissionStatus()
      .then(st => {
        if (mounted && (st === 'granted' || st === 'denied' || st === 'requested')) {
          setPermissionStatus(st === 'granted' ? 'granted' : 'denied');
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopyEmail = async () => {
    if (!serviceAccountEmail) return;
    try {
      const ok = await MonitoringService.copyToClipboard(serviceAccountEmail);
      if (ok) {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2500);
      } else {
        Alert.alert('Service Account Email', serviceAccountEmail, [{text: 'OK'}]);
      }
    } catch {
      Alert.alert('Service Account Email', serviceAccountEmail, [{text: 'OK'}]);
    }
  };

  const handleConnectOrReconnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setMonitoringError(null);
    try {
      await MonitoringService.reconnect();
      const st = await MonitoringService.getNotificationPermissionStatus();
      setPermissionStatus(st === 'granted' ? 'granted' : 'denied');
    } catch (err: any) {
      Alert.alert('Push Connection Failed', err?.message || String(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRequestPermission = async () => {
    const status = await MonitoringService.requestNotificationPermission();
    if (status === 'granted') {
      setPermissionStatus('granted');
    } else {
      setPermissionStatus('denied');
      Alert.alert(
        'Notifications Blocked',
        'Enable notifications for Winsoft Print Station in Android Settings to receive bill alerts.',
      );
    }
  };

  const handleToggleMonitoring = useCallback(async (value: boolean) => {
    if (value) {
      const status = await MonitoringService.requestNotificationPermission();
      if (status === 'denied') {
        setPermissionStatus('denied');
        Alert.alert(
          'Notifications Blocked',
          'Enable notifications for Winsoft Print Station in Android Settings to receive bill alerts.',
        );
        return;
      }
      setPermissionStatus('granted');
      enableMonitoring();
      await MonitoringService.ensureRegistered();
    } else {
      disableMonitoring();
    }
  }, [enableMonitoring, disableMonitoring]);

  const handleCheckNow = useCallback(async () => {
    setCheckingNow(true);
    setMonitoringError(null);
    try {
      await MonitoringService.runReconciliation();
    } catch (e) {
      setMonitoringError(String(e));
    } finally {
      setCheckingNow(false);
    }
  }, [setMonitoringError]);

  const formatTimestamp = (ts: number | null): string => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString();
  };

  const fcmStatusLabel = (): string => {
    switch (fcmRegistrationStatus) {
      case 'registered': return 'Connected';
      case 'registering': return 'Connecting…';
      case 'error': return 'Disconnected / Error';
      default: return 'Not Connected';
    }
  };

  const fcmStatusColor = (): string => {
    switch (fcmRegistrationStatus) {
      case 'registered': return Colors.active;
      case 'registering': return Colors.warning;
      case 'error': return Colors.error;
      default: return Colors.inactive;
    }
  };

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

  const handleDevDebugThermal = () => {
    if (__DEV__) {
      const sampleReceipt: Receipt = {
        transactionType: 'TAX INVOICE',
        transactionNumber: 'TX-DEV-001',
        date: new Date().toISOString().split('T')[0],
        customer: {
          name: 'Development Test Customer',
          phone: '+971 50 000 0000',
          address1: 'Test Address, Dubai',
        },
        items: [
          {
            sourceFields: {item: 'ITEM-001'},
            description: 'Toyota Land Cruiser Front Brake Pad Assembly Genuine Replacement Premium',
            quantity: 2,
            rate: 45,
            amount: 90,
            unit: 'PCS',
          },
          {
            sourceFields: {item: 'ITEM-002'},
            description: 'Engine Oil 5W-40',
            quantity: 1,
            rate: 120,
            amount: 120,
            unit: 'LTR',
            itemDiscount: 10,
          },
        ],
        financials: {
          subtotal: 210,
          discountAmount: 10,
          taxableAmount: 200,
          vatAmount: 10,
          vatRate: 5,
          rounding: 0,
          total: 210,
        },
        additional: {
          salesman: 'Dev User',
          trn: '123456789012345',
          remarks: 'This is a simulated dev receipt.',
        },
        sourceRows: [],
      };

      const {businessProfile: storeBusinessProfile, thermalTemplate} = useAppStore.getState();
      const bytes = buildThermalReceipt(sampleReceipt, storeBusinessProfile, thermalTemplate);
      const debugText = debugEscPos(bytes);
      
      console.log('\n[WinPrint][THERMAL DEBUG]');
      console.log(debugText);
      console.log('[/WinPrint][THERMAL DEBUG]\n');
      
      Alert.alert(
        'Dev Debug Generated',
        'ESC/POS representation has been logged to the Metro console. Check your terminal output.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Admin Management ──────────────────────────────────────── */}
        {authProfile?.role === 'admin' && (
          <>
            <SectionHeader title="Administration" />
            <View style={styles.group}>
              <SettingsRow
                icon="shield-account-outline"
                iconColor={Colors.error}
                label="Access Management"
                detail="Manage users and businesses"
                onPress={() => navigation.navigate('AdminAccess')}
                isFirst
                isLast
              />
            </View>
          </>
        )}

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
            label="Incoming Folder"
            detail={
              sourceFolderName
                ? sourceFolderPath ?? sourceFolderName
                : 'Tap to select incoming folder'
            }
            onPress={() => setFolderPickerMode('source')}
          />
          <SettingsRow
            icon="folder-move-outline"
            iconColor="#4285F4"
            label="Printed Folder"
            detail={
              archiveFolderName
                ? archiveFolderPath ?? archiveFolderName
                : 'Tap to select printed folder'
            }
            onPress={() => setFolderPickerMode('archive')}
            isLast
          />
        </View>

        {serviceAccountEmail ? (
          <View style={styles.serviceAccountCard}>
            <View style={styles.serviceAccountHeader}>
              <Icon name="information-outline" size={18} color="#4285F4" />
              <Text style={styles.serviceAccountTitle}>Drive Push Notifications</Text>
            </View>
            <Text style={styles.serviceAccountDesc}>
              To receive instant notifications when bills arrive, please share your Incoming folder in Google Drive with this service account:
            </Text>
            <View style={styles.permissionReqBox}>
              <Text style={styles.permissionReqText}>
                Required Permission: <Text style={styles.permissionReqBold}>Viewer</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.serviceAccountEmailBox}
              activeOpacity={0.7}
              onPress={handleCopyEmail}>
              <Text style={styles.serviceAccountEmailText} numberOfLines={1}>
                {serviceAccountEmail}
              </Text>
              <View style={styles.copyButtonInner}>
                <Icon
                  name={copiedEmail ? 'check' : 'content-copy'}
                  size={16}
                  color={copiedEmail ? Colors.active : Colors.primary}
                />
                <Text style={[styles.copyButtonText, copiedEmail && {color: Colors.active}]}>
                  {copiedEmail ? 'Copied' : 'Copy'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Receipt Template ─────────────────────────────────────── */}
        <SectionHeader title="Receipt Template" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="office-building-outline"
            iconColor={Colors.primary}
            label="Business & Receipt Setup"
            detail={businessProfile.identity.businessName || 'Configure profile & templates'}
            onPress={() => navigation.navigate('BusinessSetup')}
            isFirst
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
            isLast={!(__DEV__ && selectedPrinterType === 'thermal')}
          />
          {__DEV__ && selectedPrinterType === 'thermal' && (
            <SettingsRow
              icon="bug-outline"
              iconColor={Colors.active}
              label="Dev Debug Receipt (Console)"
              detail="Logs ESC/POS to Metro (No Bluetooth needed)"
              onPress={handleDevDebugThermal}
              isLast
            />
          )}
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


        {/* ── BUSINESS GROUP ─────────────────────────────────── */}
        <SectionHeader title="Business" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="office-building-outline"
            iconColor={Colors.primary}
            label="Business Information"
            detail={businessProfile.identity.businessName || 'Configure business profile'}
            onPress={() => navigation.navigate('BusinessSetup')}
            isFirst
          />
          <SettingsRow
            icon="file-document-outline"
            iconColor={Colors.primary}
            label="Receipt Template"
            detail="A4 and thermal receipt design"
            onPress={() => navigation.navigate('BusinessSetup')}
            isLast
          />
        </View>

        {/* ── PRINTING GROUP ─────────────────────────────────── */}
        <SectionHeader title="Printing" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="printer-settings-outline"
            iconColor={Colors.warning}
            label="Office Printer"
            detail={
              selectedPrinterType === 'office'
                ? 'Active — A4 via Android Print'
                : 'Not selected'
            }
            onPress={() => setTypeModalVisible(true)}
            isFirst
          />
          <SettingsRow
            icon="printer-pos-outline"
            iconColor={Colors.warning}
            label="Thermal Printer"
            detail={
              selectedPrinterType === 'thermal'
                ? selectedBluetoothDevice?.name ?? 'Active — select device'
                : 'Not selected'
            }
            onPress={() => {
              setPrinterType('thermal');
              loadPairedDevices();
              setDeviceModalVisible(true);
            }}
          />
          <SettingsRow
            icon="test-tube-outline"
            iconColor={Colors.warning}
            label={testingPrint ? 'Sending test…' : 'Test Print'}
            detail="Send a test receipt to the active printer"
            onPress={handleTestPrint}
            isLast={!(__DEV__ && selectedPrinterType === 'thermal')}
          />
          {__DEV__ && selectedPrinterType === 'thermal' && (
            <SettingsRow
              icon="bug-outline"
              iconColor={Colors.active}
              label="Dev Debug Receipt (Console)"
              detail="Logs ESC/POS to Metro"
              onPress={handleDevDebugThermal}
              isLast
            />
          )}
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

        {/* ── MONITORING GROUP ──────────────────────────────────── */}
        <SectionHeader title="Bill Monitoring" style={styles.sectionGap} />
        <View style={styles.group}>
          {/* Push Connection Status & Action Row */}
          <View style={styles.pushConnectionRow}>
            <View style={styles.pushConnectionLeft}>
              <Icon name="access-point-network" size={24} color={fcmStatusColor()} />
              <View style={styles.pushConnectionTexts}>
                <Text style={styles.pushConnectionLabel}>Push Connection</Text>
                <View style={styles.statusBadgeRow}>
                  <Text style={[styles.statusBullet, {color: fcmStatusColor()}]}>
                    {fcmRegistrationStatus === 'registered' ? '●' : '○'}
                  </Text>
                  <Text style={[styles.pushConnectionSub, {color: fcmStatusColor()}]}>
                    {fcmStatusLabel()}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.connectButton,
                fcmRegistrationStatus === 'registered' ? styles.reconnectButton : styles.connectActionButton,
                (isConnecting || fcmRegistrationStatus === 'registering') && styles.connectButtonDisabled,
              ]}
              disabled={isConnecting || fcmRegistrationStatus === 'registering'}
              onPress={handleConnectOrReconnect}
              activeOpacity={0.7}>
              {isConnecting || fcmRegistrationStatus === 'registering' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.connectButtonText}>
                  {fcmRegistrationStatus === 'registered' ? 'Reconnect' : 'Connect'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Disconnected / Error Reason Banner */}
          {fcmRegistrationStatus !== 'registered' && (
            <View style={styles.pushReasonCard}>
              <Icon name="alert-circle-outline" size={16} color={Colors.warning} />
              <Text style={styles.pushReasonText}>
                {permissionStatus === 'denied'
                  ? 'Notification permission is disabled in Android settings.'
                  : !sourceFolderId
                  ? 'Incoming folder is not selected. Please select an Incoming folder above.'
                  : lastMonitoringError
                  ? lastMonitoringError
                  : 'Tap Connect to register this device for push notifications.'}
              </Text>
            </View>
          )}

          <View style={styles.monitoringDivider} />

          {/* Monitored Folder Row */}
          <SettingsRow
            icon="folder-google-drive"
            iconColor="#4285F4"
            label="Monitored Folder"
            detail={
              sourceFolderName
                ? sourceFolderPath ?? sourceFolderName
                : 'Not configured — select folder above'
            }
            onPress={() => setFolderPickerMode('source')}
          />

          {/* Notification Permission Row */}
          <SettingsRow
            icon="bell-badge-outline"
            iconColor={permissionStatus === 'granted' ? Colors.active : Colors.warning}
            label="Notification Permission"
            detail={
              permissionStatus === 'granted'
                ? 'Enabled'
                : permissionStatus === 'denied'
                ? 'Disabled — tap to request'
                : 'Check status'
            }
            onPress={handleRequestPermission}
          />

          {/* Monitoring Toggle */}
          <View style={styles.monitoringToggleRow}>
            <Icon name="radar" size={22} color={monitoringEnabled ? Colors.active : Colors.inactive} />
            <View style={styles.monitoringToggleContent}>
              <Text style={styles.monitoringToggleLabel}>Background Monitoring</Text>
              <Text style={styles.monitoringToggleSub}>
                {monitoringEnabled ? 'Active — listening for webhook push alerts' : 'Disabled'}
              </Text>
            </View>
            <Switch
              value={monitoringEnabled}
              onValueChange={handleToggleMonitoring}
              trackColor={{false: Colors.inactive, true: Colors.active}}
              thumbColor={Colors.textPrimary}
            />
          </View>

          <View style={styles.monitoringDivider} />

          <SettingsRow
            icon="bell-outline"
            iconColor={Colors.primary}
            label="Last Bill Detected"
            detail={formatTimestamp(lastDriveNotificationAt)}
          />

          <SettingsRow
            icon="clock-check-outline"
            iconColor={Colors.textSecondary}
            label="Last Push Check"
            detail={formatTimestamp(lastReconciliationAt)}
          />

          {lastMonitoringError ? (
            <View style={styles.monitoringErrorRow}>
              <Icon name="alert-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.monitoringErrorText} numberOfLines={2}>
                {lastMonitoringError}
              </Text>
              <TouchableOpacity onPress={() => setMonitoringError(null)}>
                <Icon name="close" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.monitoringDivider} />
          <TouchableOpacity
            style={styles.checkNowButton}
            onPress={handleCheckNow}
            disabled={checkingNow}
            activeOpacity={0.7}>
            {checkingNow ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Icon name="magnify-scan" size={18} color={Colors.primary} />
            )}
            <Text style={styles.checkNowText}>
              {checkingNow ? 'Checking…' : 'Check Now (Reconciliation)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── ACCOUNT GROUP ──────────────────────────────────── */}
        <SectionHeader title="Account" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="account-circle-outline"
            iconColor={user ? Colors.active : Colors.inactive}
            label="Google Account"
            detail={user ? user.email : 'Not signed in'}
            isFirst
          />
          <SettingsRow
            icon="shield-check-outline"
            iconColor={Colors.primary}
            label="Access Status"
            detail={authProfile?.status === 'active' ? 'Active' : authProfile?.status ?? 'Unknown'}
          />
          <SettingsRow
            icon="logout"
            iconColor={Colors.error}
            label="Sign Out"
            detail="Sign out of this account"
            onPress={() => {
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Sign Out', style: 'destructive', onPress: signOut},
              ]);
            }}
            isLast
          />
        </View>

        {/* ── ADMIN GROUP (admin role only) ───────────────────── */}
        {authProfile?.role === 'admin' && (
          <>
            <SectionHeader title="Admin" style={styles.sectionGap} />
            <View style={styles.group}>
              <SettingsRow
                icon="shield-account-outline"
                iconColor={Colors.error}
                label="Access Management"
                detail="Manage users and businesses"
                onPress={() => navigation.navigate('AdminAccess')}
                isFirst
                isLast
              />
            </View>
          </>
        )}

        <Text style={styles.buildInfo}>
          Winsoft Print Station
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

      {/* ── Nested Google Drive Folder Picker Modal ── */}
      <DriveFolderPickerModal
        visible={folderPickerMode !== null}
        title={folderPickerMode === 'archive' ? 'Select Printed Folder' : 'Select Incoming Folder'}
        accessToken={accessToken}
        initialFolderId={folderPickerMode === 'archive' ? archiveFolderId : sourceFolderId}
        initialFolderName={folderPickerMode === 'archive' ? archiveFolderName : sourceFolderName}
        onSelect={folder => {
          if (folderPickerMode === 'archive') {
            selectArchiveFolder(folder);
          } else {
            void selectFolder(folder);
          }
        }}
        onClose={() => setFolderPickerMode(null)}
      />
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

  serviceAccountCard: {
    backgroundColor: '#E8F0FE',
    borderColor: '#4285F455',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  serviceAccountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  serviceAccountTitle: {
    ...Typography.bodyMedium,
    color: '#1A73E8',
    fontWeight: '700',
  },
  serviceAccountDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  serviceAccountEmailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#4285F488',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
  },
  serviceAccountEmailText: {
    ...Typography.caption,
    color: '#1A73E8',
    fontWeight: '600',
    flex: 1,
    marginRight: Spacing.xs,
  },
  permissionReqBox: {
    backgroundColor: '#D2E3FC',
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  permissionReqText: {
    ...Typography.caption,
    color: '#174EA6',
  },
  permissionReqBold: {
    fontWeight: '700',
    color: '#174EA6',
  },
  copyButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: Spacing.xs,
  },
  copyButtonText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
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

  // ── Monitoring panel ────────────────────────────────────────────────────
  pushConnectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    padding: Spacing.md,
  },
  pushConnectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
    marginRight: Spacing.sm,
  },
  pushConnectionTexts: {
    flex: 1,
  },
  pushConnectionLabel: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusBullet: {
    fontSize: 12,
  },
  pushConnectionSub: {
    ...Typography.caption,
    fontWeight: '600',
  },
  connectButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  connectActionButton: {
    backgroundColor: Colors.primary,
  },
  reconnectButton: {
    backgroundColor: Colors.cardElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  pushReasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: `${Colors.warning}14`,
    borderColor: `${Colors.warning}44`,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pushReasonText: {
    ...Typography.caption,
    color: Colors.warning,
    flex: 1,
    lineHeight: 16,
  },
  monitoringToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    padding: Spacing.md,
  },
  monitoringToggleContent: {
    flex: 1,
  },
  monitoringToggleLabel: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  monitoringToggleSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  monitoringDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  monitoringErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorDim,
    padding: Spacing.md,
  },
  monitoringErrorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  checkNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    paddingVertical: Spacing.md,
  },
  checkNowText: {
    ...Typography.bodyMedium,
    color: Colors.primary,
  },
});

