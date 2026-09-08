/**
 * Winsoft Print Station — Icon
 *
 * Dependency-free icon component using the MaterialCommunityIcons font.
 * The font file (MaterialCommunityIcons.ttf) is bundled directly in
 *   android/app/src/main/assets/fonts/
 * Android resolves it by the fontFamily string — no native-module linking
 * or react-native-vector-icons package required at runtime.
 *
 * Usage:
 *   <Icon name="printer-wireless" size={24} color="#6C63FF" />
 */

import React from 'react';
import {Text, TextStyle} from 'react-native';
import glyphMap from './iconGlyphMap';

interface IconProps {
  /** MaterialCommunityIcons icon name */
  name: string;
  /** Icon size in dp (default 24) */
  size?: number;
  /** Icon colour (default '#000') */
  color?: string;
  /** Extra style overrides */
  style?: TextStyle;
}

export default function Icon({
  name,
  size = 24,
  color = '#000',
  style,
}: IconProps) {
  const codePoint = glyphMap[name];

  // Fall back to a bullet if the glyph is not in the map
  const char = codePoint !== undefined ? String.fromCodePoint(codePoint) : '•';

  return (
    <Text
      allowFontScaling={false}
      selectable={false}
      style={[
        {
          fontFamily: 'MaterialCommunityIcons',
          fontSize: size,
          color,
          lineHeight: size,
        },
        style,
      ]}>
      {char}
    </Text>
  );
}
