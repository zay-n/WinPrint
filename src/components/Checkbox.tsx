/**
 * Checkbox — small, dependency-free selection box used for CSV and receipt
 * selection. Drawn with views so it does not depend on the icon font.
 */

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {BorderRadius, Colors} from '../theme';

export default function Checkbox({
  checked,
  onToggle,
  disabled = false,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Accessibility label, e.g. "Select sales.csv". */
  label: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{checked, disabled}}
      accessibilityLabel={label}
      style={styles.touch}>
      <View style={[styles.box, checked && styles.boxChecked, disabled && styles.boxDisabled]}>
        {checked ? <Text allowFontScaling={false} style={styles.tick}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {padding: 4},
  box: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm - 2,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {backgroundColor: Colors.primary, borderColor: Colors.primary},
  boxDisabled: {opacity: 0.4},
  tick: {color: '#fff', fontSize: 16, lineHeight: 18, fontWeight: '700'},
});
