/**
 * Winsoft Print Station — SettingsRow
 *
 * A single tappable settings row with icon, label and optional detail text
 * and a trailing chevron. Used on the Settings screen.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Icon from './Icon';

import {Colors, Spacing, BorderRadius, Typography} from '../theme';

interface SettingsRowProps {
  icon: string;
  iconColor?: string;
  label: string;
  detail?: string;
  onPress?: () => void;
  showChevron?: boolean;
  style?: ViewStyle;
  isFirst?: boolean;
  isLast?: boolean;
}

export default function SettingsRow({
  icon,
  iconColor = Colors.primary,
  label,
  detail,
  onPress,
  showChevron = true,
  style,
  isFirst = false,
  isLast = false,
}: SettingsRowProps) {
  const borderStyle = {
    borderTopLeftRadius: isFirst ? BorderRadius.md : 0,
    borderTopRightRadius: isFirst ? BorderRadius.md : 0,
    borderBottomLeftRadius: isLast ? BorderRadius.md : 0,
    borderBottomRightRadius: isLast ? BorderRadius.md : 0,
    borderBottomWidth: isLast ? 0 : 1,
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.row, borderStyle, style]}>
      <View style={[styles.iconWrap, {backgroundColor: `${iconColor}22`}]}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.right}>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {showChevron ? (
          <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  detail: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
});
