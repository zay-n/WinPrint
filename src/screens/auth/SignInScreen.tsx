/**
 * Winsoft Print Station — Sign In / Welcome Screen
 *
 * Shown when the user is not authenticated. Provides a polished
 * welcome experience with Google Sign-In. Does NOT expose Firebase,
 * Firestore, OAuth details, or backend configuration to the customer.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import {Colors, Typography, Spacing, BorderRadius, Shadow} from '../../theme';
import {useAppStore} from '../../store/useAppStore';

export default function SignInScreen() {
  const signIn = useAppStore(s => s.signIn);
  const signInLoading = useAppStore(s => s.signInLoading);
  const signInError = useAppStore(s => s.signInError);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.container}>
        {/* Brand Mark */}
        <View style={styles.brandSection}>
          <View style={styles.logoWrap}>
            <Icon name="printer-wireless" size={40} color={Colors.primary} />
          </View>

          <View style={styles.wordmarkRow}>
            <Text style={styles.wordmarkWin}>WIN</Text>
            <Text style={styles.wordmarkSoft}>soft</Text>
          </View>

          <Text style={styles.productName}>Print Station</Text>
        </View>

        {/* Tagline */}
        <View style={styles.taglineSection}>
          <Text style={styles.tagline}>
            Your printing companion for Winsoft Accounting.
          </Text>
          <Text style={styles.taglineDesc}>
            Connect your account to receive bills, generate receipts and print
            them instantly.
          </Text>
        </View>

        {/* Feature Pills */}
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Icon name="cloud-outline" size={14} color={Colors.primaryLight} />
            <Text style={styles.pillText}>Google Drive</Text>
          </View>
          <View style={styles.pill}>
            <Icon name="printer-outline" size={14} color={Colors.primaryLight} />
            <Text style={styles.pillText}>Auto Print</Text>
          </View>
          <View style={styles.pill}>
            <Icon name="receipt" size={14} color={Colors.primaryLight} />
            <Text style={styles.pillText}>Receipts</Text>
          </View>
        </View>

        {/* Sign In Card */}
        <View style={styles.signInCard}>
          {signInError ? (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText}>
                Sign-in failed. Please try again.
              </Text>
            </View>
          ) : null}

          <Pressable
            style={({pressed}) => [
              styles.googleBtn,
              signInLoading && styles.googleBtnDisabled,
              pressed && styles.googleBtnPressed,
            ]}
            disabled={signInLoading}
            onPress={signIn}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google">
            {signInLoading ? (
              <ActivityIndicator color={Colors.textPrimary} size="small" />
            ) : (
              <Icon name="google" size={22} color="#4285F4" />
            )}
            <Text style={styles.googleBtnText}>
              {signInLoading ? 'Signing in...' : 'Continue with Google'}
            </Text>
          </Pressable>

          <View style={styles.secureRow}>
            <Icon name="shield-check-outline" size={14} color={Colors.textTertiary} />
            <Text style={styles.secureText}>Secure sign-in with Google</Text>
          </View>
        </View>
      </View>

      {/* Bottom decoration */}
      <View style={styles.bottomBar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.xxl,
  },

  // Brand
  brandSection: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: BorderRadius.xl,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1.5,
    borderColor: `${Colors.primary}40`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    ...Shadow.md,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wordmarkWin: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  wordmarkSoft: {
    fontSize: 32,
    fontWeight: '400',
    color: Colors.textSecondary,
    letterSpacing: -0.5,
  },
  productName: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    fontWeight: '600',
  },

  // Tagline
  taglineSection: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  tagline: {
    ...Typography.headline,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 30,
  },
  taglineDesc: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Feature pills
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: `${Colors.primary}14`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
  },
  pillText: {
    ...Typography.caption,
    color: Colors.primaryLight,
    fontWeight: '600',
  },

  // Sign-in card
  signInCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
    ...Shadow.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.errorDim,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    width: '100%',
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.cardElevated,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.base,
    width: '100%',
    minHeight: 52,
    ...Shadow.sm,
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleBtnPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
  googleBtnText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  secureText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },

  bottomBar: {
    height: 3,
    backgroundColor: `${Colors.primary}30`,
    borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.xxl,
    marginBottom: Spacing.base,
  },
});
