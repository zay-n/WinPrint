/**
 * Winsoft Print Station — SectionHeader
 *
 * A titled divider used to separate groups of content within a screen.
 */

import React from 'react';
import {StyleSheet, Text, View, ViewStyle} from 'react-native';

import {Colors, Spacing, Typography} from '../theme';

interface SectionHeaderProps {
  title: string;
  style?: ViewStyle;
}

export default function SectionHeader({title, style}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.label,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
});
