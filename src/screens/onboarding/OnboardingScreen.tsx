import React, {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import {Colors, Spacing, BorderRadius, Typography} from '../../theme';
import type {OnboardingScreenProps} from '../../navigation/types';
import {useAppStore} from '../../store/useAppStore';
import {isAuthorizedAppSession} from '../../services/auth/Authorization';
import * as MonitoringService from '../../services/monitoring/MonitoringService';

type Props = OnboardingScreenProps;

const STEP_TITLES = ['Welcome', 'Drive', 'Business', 'Printer', 'Review'] as const;
const STEP_ICONS = ['printer-wireless', 'google-drive', 'office-building-outline', 'printer-outline', 'format-list-checks'] as const;

type SetupStatus = 'Completed' | 'Needs attention' | 'Not configured' | 'Optional' | 'Not tested';

function StatusRow({label, detail, status}: {label: string; detail: string; status: SetupStatus}) {
  const complete = status === 'Completed';
  const warning = status === 'Needs attention';
  const icon = complete ? 'check-circle-outline' : warning ? 'alert-circle-outline' : 'clock-outline';
  const color = complete ? Colors.active : warning ? Colors.warning : Colors.textSecondary;
  return (
    <View accessible accessibilityLabel={`${label}: ${status}. ${detail}`} style={styles.statusRow}>
      <Icon name={icon} size={20} color={color} />
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{label}</Text>
        <Text style={styles.statusDetail}>{detail}</Text>
      </View>
      <Text style={[styles.statusTag, {color}]}>{status}</Text>
    </View>
  );
}

export default function OnboardingScreen({navigation}: Props) {
  const user = useAppStore(s => s.user);
  const authProfile = useAppStore(s => s.authProfile);
  const customer = useAppStore(s => s.customer);
  const sourceFolderId = useAppStore(s => s.sourceFolderId);
  const sourceFolderName = useAppStore(s => s.sourceFolderName);
  const sourceFolderPath = useAppStore(s => s.sourceFolderPath);
  const archiveFolderId = useAppStore(s => s.archiveFolderId);
  const archiveFolderName = useAppStore(s => s.archiveFolderName);
  const archiveFolderPath = useAppStore(s => s.archiveFolderPath);
  const driveNeedsReauth = useAppStore(s => s.driveNeedsReauth);
  const driveAccessChecked = useAppStore(s => s.driveAccessChecked);
  const businessProfile = useAppStore(s => s.businessProfile);
  const a4Template = useAppStore(s => s.a4Template);
  const thermalTemplate = useAppStore(s => s.thermalTemplate);
  const selectedPrinterType = useAppStore(s => s.selectedPrinterType);
  const selectedBluetoothDevice = useAppStore(s => s.selectedBluetoothDevice);
  const fcmRegistrationStatus = useAppStore(s => s.fcmRegistrationStatus);
  const serviceAccountEmail = useAppStore(s => s.serviceAccountEmail);
  const monitoringEnabled = useAppStore(s => s.monitoringEnabled);
  const testPrintCurrentPrinter = useAppStore(s => s.testPrintCurrentPrinter);
  const onboardingStep = useAppStore(s => s.onboardingStep);
  const setOnboardingStep = useAppStore(s => s.setOnboardingStep);

  const accountReady = isAuthorizedAppSession(authProfile, customer);
  const foldersSelected = Boolean(sourceFolderId && archiveFolderId && sourceFolderId !== archiveFolderId);
  const businessName = businessProfile.identity.businessName.trim();
  const businessReady = Boolean(businessName);
  const printerSelected = selectedPrinterType === 'office' ||
    (selectedPrinterType === 'thermal' && Boolean(selectedBluetoothDevice));
  const firstIncomplete = !accountReady ? 0 : !foldersSelected ? 1 : !businessReady ? 2 : !printerSelected ? 3 : 4;
  const savedStep = Number.isFinite(onboardingStep) ? Math.floor(onboardingStep) : 0;
  const initialStep = Math.max(0, Math.min(STEP_TITLES.length - 1, savedStep, firstIncomplete));
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [testState, setTestState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const step = Math.max(0, Math.min(STEP_TITLES.length - 1, Number.isFinite(stepIndex) ? stepIndex : 0));
  const driveStatus = driveNeedsReauth
    ? 'Reconnect Google Drive to verify access.'
    : driveAccessChecked
      ? 'Drive access was verified successfully in this session.'
      : 'Folders may be saved, but Drive access has not been verified in this session.';
  const profileDetail = businessReady
    ? `${businessName} · optional contact details can be added later`
    : 'Add a business name; contact details are optional.';
  const printerDetail = selectedPrinterType === 'thermal'
    ? selectedBluetoothDevice
      ? `${selectedBluetoothDevice.name} selected · connection has not been confirmed by a test`
      : 'Choose a paired Bluetooth thermal printer in Settings.'
    : 'Office printing uses Android Print Framework; test it to verify the request.';
  const monitoringReady = accountReady && foldersSelected && driveAccessChecked && !driveNeedsReauth &&
    fcmRegistrationStatus === 'registered' && businessReady;

  const goToStep = (next: number) => {
    const bounded = Math.max(0, Math.min(STEP_TITLES.length - 1, next));
    setStepIndex(bounded);
    setOnboardingStep(bounded);
  };

  const openDrive = () => {
    setOnboardingStep(step);
    if (driveNeedsReauth) {
      navigation.navigate('Settings');
    } else {
      navigation.navigate('Drive');
    }
  };

  const openBusiness = () => {
    setOnboardingStep(step);
    navigation.navigate('Settings', {screen: 'BusinessSetup'} as never);
  };

  const openPrinterSettings = () => {
    setOnboardingStep(step);
    navigation.navigate('Settings');
  };

  const runTestPrint = async () => {
    setTestState('loading');
    setTestError(null);
    try {
      const result = await testPrintCurrentPrinter();
      if (result.success) {
        setTestState('success');
      } else {
        setTestState('error');
        setTestError(result.error || 'The printer did not accept the test receipt.');
      }
    } catch (error) {
      setTestState('error');
      setTestError(error instanceof Error ? error.message : String(error));
    }
  };

  const finish = () => {
    if (!accountReady) {
      Alert.alert('Account verification required', 'Return to the sign-in and approval flow to verify this account.');
      return;
    }
    setOnboardingStep(0);
    navigation.popToTop();
  };

  const copyServiceAccountEmail = async () => {
    if (!serviceAccountEmail) return;
    try {
      const copied = await MonitoringService.copyToClipboard(serviceAccountEmail);
      if (!copied) Alert.alert('Monitoring service account', serviceAccountEmail);
    } catch {
      Alert.alert('Monitoring service account', serviceAccountEmail);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close setup and return to Dashboard"
          onPress={() => navigation.goBack()}
          style={styles.iconButton}>
          <Icon name="chevron-right" size={21} color={Colors.textPrimary} style={styles.backGlyph} />
        </Pressable>
        <Text style={styles.topLabel}>GETTING STARTED</Text>
        <Text style={styles.stepCount}>{step + 1} of {STEP_TITLES.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="progressbar" accessibilityLabel={`Setup progress, step ${step + 1} of ${STEP_TITLES.length}`} style={styles.progressTrack}>
          {STEP_TITLES.map((title, index) => (
            <View key={title} style={[styles.progressSegment, index <= step && styles.progressSegmentActive]} />
          ))}
        </View>
        <View style={styles.stepLabels}>
          {STEP_TITLES.map((title, index) => (
            <Text key={title} style={[styles.stepLabel, index === step && styles.stepLabelActive]}>{title}</Text>
          ))}
        </View>

        <View style={styles.heroMark}>
          <Icon name={STEP_ICONS[step]} size={34} color={Colors.primaryLight} />
        </View>
        <Text style={styles.eyebrow}>STEP {String(step + 1).padStart(2, '0')}</Text>
        <Text style={styles.heading}>{[
          'Your print station, ready for work',
          'Choose where bills live',
          'Make each receipt yours',
          'Choose a printer',
          'Review your setup',
        ][step]}</Text>
        <Text style={styles.body}>{[
          'Connect your Winsoft receipt workflow to the folders and printer you already use.',
          'Select Incoming and Printed folders. They remain saved in the existing Drive settings.',
          'Review your business identity and receipt layout. Optional contact details can be added later.',
          'Choose office or Bluetooth printing. A test print is optional and uses the existing test receipt.',
          'Confirm what is ready. Finishing setup will not enable monitoring or print a customer receipt.',
        ][step]}</Text>

        <View style={styles.contentCard}>
          {step === 0 && (
            <>
              <CardHeading icon="account-circle-outline" title="Signed-in account" subtitle={user?.email || 'Account verified by Winsoft'} />
              <Text style={styles.cardBody}>Account approval and business access are checked by the existing sign-in gate. This guide cannot bypass those checks.</Text>
            </>
          )}
          {step === 1 && (
            <>
              <CardHeading icon="google-drive" title="Google Drive" subtitle={driveNeedsReauth ? 'Reconnect required' : driveAccessChecked ? 'Access verified this session' : 'Access not checked yet'} />
              <View style={styles.divider} />
              <StatusRow label="Incoming folder" detail={sourceFolderName ? `${sourceFolderName}${sourceFolderPath ? ` · ${sourceFolderPath}` : ''}` : 'Choose the folder where Winsoft CSV bills arrive.'} status={sourceFolderId ? 'Completed' : 'Not configured'} />
              <StatusRow label="Printed/archive folder" detail={archiveFolderName ? `${archiveFolderName}${archiveFolderPath ? ` · ${archiveFolderPath}` : ''}` : 'Choose where fully printed CSV files are moved.'} status={archiveFolderId && archiveFolderId !== sourceFolderId ? 'Completed' : archiveFolderId ? 'Needs attention' : 'Not configured'} />
              <Text style={styles.cardBody}>{driveStatus}</Text>
              {driveNeedsReauth && <Text style={styles.errorText}>Open Settings to reconnect Google Drive. Firebase sign-in and saved folders are preserved.</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel="Open existing nested Drive folder picker" onPress={openDrive} style={styles.cardAction}>
                <Text style={styles.cardActionText}>{driveNeedsReauth ? 'Open Drive settings' : 'Choose or change folders'}</Text>
                <Icon name="chevron-right" size={18} color={Colors.primaryLight} />
              </Pressable>
              {serviceAccountEmail ? (
                <>
                  <Text style={styles.hint}>Monitoring backend identity: {serviceAccountEmail}. Registration confirms Incoming access; the Printed folder is moved by your Google account.</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Copy monitoring service account email" onPress={() => void copyServiceAccountEmail()} style={styles.cardAction}>
                    <Text style={styles.cardActionText}>Copy service account email</Text>
                    <Icon name="chevron-right" size={18} color={Colors.primaryLight} />
                  </Pressable>
                </>
              ) : (
                <Text style={styles.hint}>The backend service-account email is shown here only after the existing registration response provides it.</Text>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <CardHeading icon="office-building-outline" title="Business profile" subtitle={businessReady ? businessName : 'Business name not set'} />
              <Text style={styles.cardBody}>{profileDetail} Business name and receipt defaults can appear on printed receipts.</Text>
              <View style={styles.divider} />
              <StatusRow label="Receipt layout" detail={selectedPrinterType === 'thermal' ? `80 mm template available${thermalTemplate.showBusinessName ? ' · business name shown' : ''}` : `A4 template available${a4Template.showBusinessName ? ' · business name shown' : ''}`} status="Optional" />
              <Text style={styles.hint}>Tax labels, currency, and template visibility are managed in the existing profile editor. No calculations or receipt rendering are changed here.</Text>
              <Pressable accessibilityRole="button" onPress={openBusiness} style={styles.cardAction}>
                <Text style={styles.cardActionText}>Review business and receipt layout</Text>
                <Icon name="chevron-right" size={18} color={Colors.primaryLight} />
              </Pressable>
            </>
          )}
          {step === 3 && (
            <>
              <CardHeading icon="printer-outline" title={selectedPrinterType === 'office' ? 'Office printer' : 'Bluetooth thermal printer'} subtitle={printerDetail} />
              <Text style={styles.cardBody}>Printer selection and Bluetooth pairing stay in Settings. The test below sends only the existing sample test receipt.</Text>
              <Pressable accessibilityRole="button" onPress={openPrinterSettings} style={styles.cardAction}>
                <Text style={styles.cardActionText}>Choose printer or pair device</Text>
                <Icon name="chevron-right" size={18} color={Colors.primaryLight} />
              </Pressable>
              <Pressable accessibilityRole="button" disabled={testState === 'loading'} onPress={() => void runTestPrint()} style={[styles.testButton, testState === 'loading' && styles.disabledButton]}>
                {testState === 'loading' ? <ActivityIndicator size="small" color={Colors.primaryLight} /> : <Icon name="printer-check" size={18} color={Colors.primaryLight} />}
                <Text style={styles.testButtonText}>{testState === 'loading' ? 'Sending test…' : testState === 'success' ? 'Send test again' : 'Send optional test receipt'}</Text>
              </Pressable>
              {testState === 'success' && <Text accessibilityRole="text" style={styles.successText}>The test request succeeded. This confirms the adapter response, not that paper was physically printed.</Text>}
              {testState === 'error' && <Text accessibilityRole="alert" style={styles.errorText}>{testError || 'Test print failed. Check printer selection and permissions, then retry.'}</Text>}
              {testState === 'idle' && <Text style={styles.hint}>You can continue without a test and return to printer settings later.</Text>}
            </>
          )}
          {step === 4 && (
            <>
              <CardHeading icon="format-list-checks" title="Setup summary" subtitle="Statuses reflect current app state" />
              <View style={styles.divider} />
              <StatusRow label="Account and business access" detail={accountReady ? `${user?.email || 'Authorized account'} · business access verified` : 'Authorization needs to be verified in the existing sign-in flow.'} status={accountReady ? 'Completed' : 'Needs attention'} />
              <StatusRow label="Incoming folder" detail={sourceFolderName || 'Select an Incoming folder in Drive.'} status={sourceFolderId ? 'Completed' : 'Not configured'} />
              <StatusRow label="Printed/archive folder" detail={archiveFolderName || 'Select a different Printed folder in Drive.'} status={archiveFolderId && archiveFolderId !== sourceFolderId ? 'Completed' : 'Not configured'} />
              <StatusRow label="Business profile" detail={businessName || 'Business name is not set.'} status={businessReady ? 'Completed' : 'Not configured'} />
              <StatusRow label="Receipt template" detail={selectedPrinterType === 'thermal' ? '80 mm template available to review.' : 'A4 template available to review.'} status="Optional" />
              <StatusRow label="Printer" detail={testState === 'success' ? 'Test request succeeded in this session.' : printerDetail} status={testState === 'success' ? 'Completed' : printerSelected ? 'Not tested' : 'Not configured'} />
              <StatusRow label="Push connection" detail={fcmRegistrationStatus === 'registered' ? 'The existing backend registration is active.' : fcmRegistrationStatus === 'registering' ? 'Device registration is still in progress.' : 'Device registration has not succeeded.'} status={fcmRegistrationStatus === 'registered' ? 'Completed' : fcmRegistrationStatus === 'error' ? 'Needs attention' : 'Not configured'} />
              <StatusRow label="Monitoring readiness" detail={monitoringReady ? 'Prerequisites appear ready; monitoring remains off until explicitly enabled.' : 'Requires verified access, folders, active business profile, and successful device registration.'} status={monitoringReady ? 'Completed' : 'Needs attention'} />
              <Text style={styles.hint}>Monitoring is currently {monitoringEnabled ? 'enabled in Settings' : 'off'}. This Finish action does not change it.</Text>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => goToStep(step - 1)} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Later</Text>
          </Pressable>
        )}
        {step < STEP_TITLES.length - 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Continue to ${STEP_TITLES[step + 1]}`} onPress={() => goToStep(step + 1)} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Continue</Text>
            <Icon name="chevron-right" size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={finish} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Continue to Dashboard</Text>
            <Icon name="check-circle-outline" size={18} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function CardHeading({icon, title, subtitle}: {icon: string; title: string; subtitle: string}) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardIcon}><Icon name={icon} size={20} color={Colors.primaryLight} /></View>
      <View style={styles.cardTitleWrap}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: Colors.background},
  topBar: {height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border},
  iconButton: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'},
  backGlyph: {transform: [{rotate: '180deg'}]},
  topLabel: {...Typography.label, color: Colors.textSecondary, letterSpacing: 1.2},
  stepCount: {...Typography.captionMedium, color: Colors.textPrimary, minWidth: 48, textAlign: 'right'},
  scrollContent: {padding: Spacing.base, paddingBottom: Spacing.xl},
  progressTrack: {flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm},
  progressSegment: {height: 4, flex: 1, borderRadius: BorderRadius.full, backgroundColor: Colors.borderLight},
  progressSegmentActive: {backgroundColor: Colors.primary},
  stepLabels: {flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm},
  stepLabel: {...Typography.label, color: Colors.textTertiary, fontSize: 10},
  stepLabelActive: {color: Colors.primaryLight},
  heroMark: {width: 68, height: 68, marginTop: Spacing.xxxl, marginBottom: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}20`, borderWidth: 1, borderColor: `${Colors.primary}55`},
  eyebrow: {...Typography.label, color: Colors.primaryLight, letterSpacing: 1.3},
  heading: {...Typography.displayMedium, color: Colors.textPrimary, marginTop: Spacing.xs, maxWidth: 420},
  body: {...Typography.body, color: Colors.textSecondary, marginTop: Spacing.sm, maxWidth: 500},
  contentCard: {marginTop: Spacing.xl, padding: Spacing.base, borderRadius: BorderRadius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm},
  cardHeader: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48},
  cardIcon: {width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.primary}20`},
  cardTitleWrap: {flex: 1},
  cardTitle: {...Typography.bodyMedium, color: Colors.textPrimary},
  cardSubtitle: {...Typography.caption, color: Colors.textSecondary},
  cardBody: {...Typography.body, color: Colors.textSecondary, marginTop: Spacing.xs},
  divider: {height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm},
  hint: {...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.md},
  errorText: {...Typography.caption, color: Colors.error, marginTop: Spacing.sm},
  successText: {...Typography.caption, color: Colors.active, marginTop: Spacing.sm},
  cardAction: {minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: BorderRadius.md},
  cardActionText: {...Typography.bodyMedium, color: Colors.primaryLight},
  testButton: {minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.sm, backgroundColor: `${Colors.primary}20`, borderRadius: BorderRadius.md},
  testButtonText: {...Typography.bodyMedium, color: Colors.primaryLight},
  disabledButton: {opacity: 0.55},
  statusRow: {minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.sm},
  statusCopy: {flex: 1, gap: 2},
  statusTitle: {...Typography.captionMedium, color: Colors.textPrimary},
  statusDetail: {...Typography.caption, color: Colors.textSecondary},
  statusTag: {...Typography.label, fontSize: 10, textAlign: 'right', maxWidth: 100},
  footer: {flexDirection: 'row', gap: Spacing.md, padding: Spacing.base, paddingBottom: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background},
  secondaryButton: {minHeight: 52, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.borderLight},
  secondaryText: {...Typography.bodyMedium, color: Colors.textPrimary},
  primaryButton: {flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg},
  primaryText: {...Typography.bodyMedium, color: '#FFFFFF', fontWeight: '700'},
});
