/**
 * Winsoft Print Station — MetricCard
 *
 * A compact card showing a single numeric metric and label.
 * Used on the Dashboard for Pending / Printed Today / etc.
 */

import React from 'react';
import {StyleSheet, Text, View, ViewStyle} from 'react-native';
import Icon from './Icon';

import {Colors, Spacing, BorderRadius, Typography, Shadow} from '../theme';

interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  accent?: string;
  style?: ViewStyle;
}

export default function MetricCard({
  icon,
  label,
  value,
  accent = Colors.primary,
  style,
}: MetricCardProps) {
  return (
    <View style={[styles.card, style]}>
      <Icon name={icon} size={20} color={accent} style={styles.icon} />
      <Text style={[styles.value, {color: accent}]}>{String(value)}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
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
    alignItems: 'center',
    gap: Spacing.xs,
    ...Shadow.sm,
  },
  icon: {
    marginBottom: Spacing.xxs,
  },
  value: {
    ...Typography.displayMedium,
    fontWeight: '700',
    lineHeight: 32,
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
