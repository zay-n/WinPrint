/**
 * Winsoft Print Station — Color Palette
 * Dark, vibrant theme designed for a professional print-station dashboard.
 */

export const Colors = {
  // Backgrounds
  background: '#0F1117',
  surface: '#1A1D2E',
  card: '#22253A',
  cardElevated: '#2A2E45',

  // Accent
  primary: '#6C63FF',
  primaryDark: '#4F46E5',
  primaryLight: '#8B84FF',

  // Status
  active: '#00D4AA',
  activeDim: '#00D4AA22',
  warning: '#F59E0B',
  warningDim: '#F59E0B22',
  error: '#EF4444',
  errorDim: '#EF444422',
  inactive: '#475569',
  inactiveDim: '#47556922',

  // Text
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textInverse: '#0F1117',

  // Borders
  border: '#2D3148',
  borderLight: '#3D4165',

  // Tab bar
  tabActive: '#6C63FF',
  tabInactive: '#475569',
  tabBackground: '#13162A',

  // Header gradient stops
  headerTop: '#1A1D2E',
  headerBottom: '#0F1117',

  // Transparent
  overlay: 'rgba(15, 17, 23, 0.7)',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof Colors;
