/**
 * Winsoft Print Station — EmptyState
 *
 * Reusable empty-state placeholder shown when a list/section has no data.
 */

import React from 'react';
import {StyleSheet, Text, View, ViewStyle} from 'react-native';
import Icon from './Icon';

import {Colors, Spacing, Typography} from '../theme';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  style?: ViewStyle;
}

export default function EmptyState({
  icon,
  title,
  description,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={52} color={Colors.inactive} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    ...Typography.title,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 22,
  },
});
