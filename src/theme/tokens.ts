/**
 * StudyPack design tokens — warm pastel green.
 * Single light theme by design: cream cards on a mint-green ground,
 * warm forest ink (never pure black), gold reserved for streaks and
 * the offline banner.
 */
export const colors = {
  // ground
  bg: '#E6F3E7',
  surface: '#FFFDF6',
  surface2: '#EEF5EC',
  hairline: 'rgba(35, 59, 40, 0.12)',
  hairlineSoft: 'rgba(35, 59, 40, 0.08)',
  // ink
  text: '#233524',
  textDim: '#5B7159',
  textFaint: '#748A76',
  // accent
  accent: '#85D79B',
  accentDeep: '#2C8A4A',
  onAccent: '#0F3315',
  accentWash: '#D9EFD9',
  // semantics
  leaf: '#3B7527',
  leafWash: '#E4F2D2',
  coral: '#B44F3F',
  coralWash: '#FBE2DB',
  gold: '#B0791F',
  goldWash: '#FAEDD0',
  // controls
  track: '#D3E7D4',
  disabledBg: '#E3EDE2',
  disabledText: '#9AAA9C',
} as const;

export const radius = {
  card: 16,
  control: 12,
  pill: 999,
} as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
