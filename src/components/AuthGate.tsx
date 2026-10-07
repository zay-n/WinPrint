/**
 * Winsoft Print Station — AuthGate
 *
 * Controls what is rendered based on authentication/authorization state:
 *
 *  Loading        → "Checking your account..."
 *  Not signed in  → <SignInScreen>
 *  Signed in but blocked → Account Pending / Suspended / Business pending screens
 *  Fully authorized → <children> (AppNavigator)
 *
 * The "not signed in → fall through" path has been replaced with a proper
 * welcome/sign-in screen. No backend details are exposed to the user.
 */

import React from 'react';
import {View, Text, StyleSheet, Pressable, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAppStore} from '../store/useAppStore';
import {Colors, Typography, Spacing, BorderRadius} from '../theme';
import SignInScreen from '../screens/auth/SignInScreen';
import Icon from './Icon';

// ─── Loading state ─────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <View style={styles.centeredContainer}>
      <View style={styles.loadingLogoWrap}>
        <Icon name="printer-wireless" size={32} color={Colors.primary} />
      </View>
      <ActivityIndicator
        color={Colors.primary}
        size="large"
        style={styles.spinner}
      />
      <Text style={styles.loadingText}>Checking your account...</Text>
      <Text style={styles.loadingSubtext}>Please wait a moment.</Text>
    </View>
  );
}

// ─── Blocked state ─────────────────────────────────────────────────────────────

type BlockedVariant = 'pending' | 'suspended' | 'businessPending' | 'businessSuspended' | 'error';

interface BlockedConfig {
  icon: string;
  iconColor: string;
  title: string;
  message: string;
}

const BLOCKED_CONFIGS: Record<BlockedVariant, BlockedConfig> = {
  pending: {
    icon: 'clock-outline',
    iconColor: Colors.warning,
    title: 'Account Pending',
    message:
      'Your account has not been approved yet. Please contact the administrator to request access to Winsoft Print Station.',
  },
  suspended: {
    icon: 'account-cancel-outline',
    iconColor: Colors.error,
    title: 'Access Disabled',
    message:
      'Your access to Winsoft Print Station has been disabled. Please contact the administrator if you believe this is a mistake.',
  },
  businessPending: {
    icon: 'domain-off',
    iconColor: Colors.warning,
    title: 'Business Access Pending',
    message:
      'Your account has been approved, but your business access has not been configured yet. Please contact the administrator.',
  },
  businessSuspended: {
    icon: 'store-off-outline',
    iconColor: Colors.error,
    title: 'Business Access Disabled',
    message:
      'Access to this business is currently disabled. Please contact the administrator.',
  },
  error: {
    icon: 'wifi-off',
    iconColor: Colors.textSecondary,
    title: 'Unable to Verify Account',
    message:
      'We could not verify your account right now. Please check your internet connection and try again.',
  },
};

interface BlockedViewProps {
  variant: BlockedVariant;
  onTryAgain: () => void;
  onSignOut: () => void;
}

function BlockedView({variant, onTryAgain, onSignOut}: BlockedViewProps) {
  const cfg = BLOCKED_CONFIGS[variant];
  return (
    <SafeAreaView style={styles.centeredContainer} edges={['top', 'bottom']}>
      <View style={styles.blockedContent}>
        <View style={[styles.blockedIconWrap, {borderColor: `${cfg.iconColor}40`, backgroundColor: `${cfg.iconColor}14`}]}>
          <Icon name={cfg.icon} size={36} color={cfg.iconColor} />
        </View>

        <Text style={styles.blockedTitle}>{cfg.title}</Text>
        <Text style={styles.blockedMessage}>{cfg.message}</Text>

        <View style={styles.buttonRow}>
          <Pressable
            style={({pressed}) => [styles.btnSecondary, pressed && styles.btnPressed]}
            onPress={onTryAgain}
            accessibilityRole="button"
            accessibilityLabel="Try Again">
            <Icon name="refresh" size={16} color={Colors.textPrimary} />
            <Text style={styles.btnSecondaryText}>Try Again</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.btnPrimary, pressed && styles.btnPressed]}
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign Out">
            <Text style={styles.btnPrimaryText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Main AuthGate ─────────────────────────────────────────────────────────────

export default function AuthGate({children}: {children: React.ReactNode}) {
  const user = useAppStore(s => s.user);
  const authProfile = useAppStore(s => s.authProfile);
  const customer = useAppStore(s => s.customer);
  const signOut = useAppStore(s => s.signOut);
  const restoreSessionLoading = useAppStore(s => s.restoreSessionLoading);
  const _hasHydrated = useAppStore(s => s._hasHydrated);
  const signInError = useAppStore(s => s.signInError);

  // 1. Still loading session or hydrating persistence
  if (restoreSessionLoading || !_hasHydrated) {
    return <LoadingView />;
  }

  // 2. Not signed in → show welcome / sign-in screen
  if (!user) {
    return <SignInScreen />;
  }

  // 3. Signed in — check authorization

  const status = authProfile?.status;
  const role = authProfile?.role;

  // Determine if the user can pass into the main app
  let canPass = false;
  if (status === 'active') {
    if (role === 'admin') {
      canPass = true;
    } else if (authProfile?.businessId && customer?.status === 'active') {
      canPass = true;
    }
  }

  if (canPass) {
    return <>{children}</>;
  }

  // Determine which blocked variant to show
  const tryAgain = () => useAppStore.getState().restoreSession();

  if (signInError) {
    return <BlockedView variant="error" onTryAgain={tryAgain} onSignOut={signOut} />;
  }

  if (!status || status === 'pending') {
    return <BlockedView variant="pending" onTryAgain={tryAgain} onSignOut={signOut} />;
  }
  if (status === 'suspended') {
    return <BlockedView variant="suspended" onTryAgain={tryAgain} onSignOut={signOut} />;
  }
  if (status === 'active') {
    if (!authProfile?.businessId) {
      return <BlockedView variant="businessPending" onTryAgain={tryAgain} onSignOut={signOut} />;
    }
    // Has businessId but customer is suspended or missing
    return <BlockedView variant="businessSuspended" onTryAgain={tryAgain} onSignOut={signOut} />;
  }

  // Fallback
  return <BlockedView variant="error" onTryAgain={tryAgain} onSignOut={signOut} />;
}

const styles = StyleSheet.create({
  centeredContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  spinner: {
    marginBottom: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
    marginBottom: 4,
  },
  loadingSubtext: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },

  blockedContent: {
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    maxWidth: 380,
    gap: Spacing.md,
  },
  blockedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  blockedTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
  },
  blockedMessage: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  btnPrimary: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    minWidth: 110,
    alignItems: 'center',
  },
  btnPrimaryText: {
    ...Typography.bodyMedium,
    color: '#fff',
    fontWeight: '700',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    minWidth: 110,
    justifyContent: 'center',
  },
  btnSecondaryText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.75,
  },
});
