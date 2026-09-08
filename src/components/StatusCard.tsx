/**
 * Winsoft Print Station — StatusCard
 *
 * Displays a status metric with an icon, title, value and optional sub-label.
 * Used on the Dashboard to show monitoring / drive / printer states.
 */

import React from 'react';
import {StyleSheet, Text, View, ViewStyle} from 'react-native';
import Icon from './Icon';

import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../theme';

export type StatusVariant = 'active' | 'inactive' | 'warning' | 'error' | 'neutral';

interface StatusCardProps {
  icon: string;
  title: string;
  value: string;
  subLabel?: string;
  variant?: StatusVariant;
  style?: ViewStyle;
}

const variantConfig: Record<
  StatusVariant,
  {color: string; bg: string; iconColor: string}
> = {
  active: {color: Colors.active, bg: Colors.activeDim, iconColor: Colors.active},
  inactive: {color: Colors.inactive, bg: Colors.inactiveDim, iconColor: Colors.inactive},
  warning: {color: Colors.warning, bg: Colors.warningDim, iconColor: Colors.warning},
  error: {color: Colors.error, bg: Colors.errorDim, iconColor: Colors.error},
  neutral: {color: Colors.textSecondary, bg: Colors.inactiveDim, iconColor: Colors.textSecondary},
};

export default function StatusCard({
  icon,
  title,
  value,
  subLabel,
  variant = 'neutral',
  style,
}: StatusCardProps) {
  const {color, bg, iconColor} = variantConfig[variant];

  return (
    <View style={[styles.card, style]}>
      <View style={[styles.iconWrap, {backgroundColor: bg}]}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.value, {color}]} numberOfLines={1}>
          {value}
        </Text>
        {subLabel ? (
          <Text style={styles.subLabel} numberOfLines={1}>
            {subLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  subLabel: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
});
