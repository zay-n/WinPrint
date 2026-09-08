/**
 * Winsoft Print Station — MaterialCommunityIcons glyph map
 *
 * Unicode code points for every icon used in this project.
 * Source: react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json
 * (extracted at project setup — no runtime dependency on that package).
 *
 * Font file lives at:
 *   android/app/src/main/assets/fonts/MaterialCommunityIcons.ttf
 * Android loads it by fontFamily name with no native-module linking needed.
 *
 * To add an icon: look up the name in the MaterialCommunityIcons glyph map
 * and add the Unicode code point here.
 */

const glyphMap: Record<string, number> = {
  // Navigation / Dashboard
  'view-dashboard': 984430,
  'view-dashboard-outline': 985629,
  'cloud': 983391,
  'cloud-outline': 983395,
  'printer': 984106,
  'printer-outline': 989062,
  'history': 983770,
  'cog': 984211,
  'cog-outline': 985275,

  // Status / Monitoring
  'radar': 984119,
  'google-drive': 983734,
  'printer-wireless': 985611,
  'printer-check': 987462,

  // Metrics / Alerts
  'clock-outline': 983376,
  'check-circle-outline': 984545,
  'alert-circle-outline': 984534,

  // Queue statuses
  'layers-outline': 985598,

  // Receipt / History
  'receipt': 984137,
  'receipt-outline': 984138,        // substitute: 'receipt' + 1 ≈ outline variant
  'identifier': 986878,
  'file-check-outline': 986665,
  'magnify': 983881,

  // Drive screen
  'lock-outline': 983873,
  'account-circle-outline': 985941,
  'folder-google-drive': 983630,
  'file-find-outline': 986007,
  'cloud-download-outline': 985981,
  'folder-move-outline': 987718,

  // Settings rows
  'office-building-outline': 988447,
  'image-outline': 985462,
  'format-list-checks': 984918,
  'ruler-square': 986306,
  'text-box-outline': 985581,
  'printer-settings-outline': 984106, // substitute: same as printer
  'cellphone-wireless': 985109,
  'test-tube-outline': 984211,        // substitute: cog-outline family
  'bell-outline': 983196,
  'printer-pos-outline': 989062,      // substitute: printer-outline
  'information-outline': 983805,
  'file-document-outline': 985582,

  // Generic
  'chevron-right': 983362,
};

export default glyphMap;
