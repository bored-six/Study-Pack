/**
 * StudyPack design tokens — playful neubrutalism.
 * Warm paper ground; every surface is a "sticker": confident 2px forest-ink
 * outlines, solid ink offset shadows, candy washes, tilted accents, and a
 * chunky hero font with dimensional hard-shadow type. Gold is reserved for
 * streaks and the offline banner. Single light theme by design.
 */
export const colors = {
  // ground
  bg: '#FAF3E1',
  surface: '#FFFFFF',
  surface2: '#F4EDDA',
  ink: '#27362B',
  line: 'rgba(39, 54, 43, 0.14)',
  lineSoft: 'rgba(39, 54, 43, 0.09)',
  // ink text
  text: '#27362B',
  textDim: '#5D6F5C',
  textFaint: '#82927F',
  // accent (hero green)
  accent: '#5FD184',
  accentEdge: '#38A75F',
  accentDeep: '#2C8A4A',
  onAccent: '#0E3018',
  accentWash: '#DDF3DC',
  // semantics
  leaf: '#3B7527',
  leafWash: '#E3F2CE',
  coral: '#C24E38',
  coralWash: '#FBE1D7',
  gold: '#AC761C',
  goldWash: '#FAECCB',
  // controls
  track: '#EFE5CB',
  disabledBg: '#EDE6D2',
  disabledText: '#A5AF9E',
} as const;

/** Candy washes rotated across deck cards for sticker-sheet variety. */
export const candy = [
  { wash: '#DDF3DC', ink: '#2C8A4A' }, // mint
  { wash: '#FFE5D2', ink: '#BC5A2E' }, // peach
  { wash: '#FCEBC0', ink: '#A0731A' }, // sun
  { wash: '#DBEEFB', ink: '#2E6FA3' }, // sky
  { wash: '#EAE2FA', ink: '#6C51A8' }, // lilac
] as const;

export const radius = {
  card: 22,
  control: 16,
  pill: 999,
} as const;

/** Solid ink offset shadows — the sticker look. Requires RN >= 0.76. */
export const shadow = {
  card: { boxShadow: `0 3px 0 ${colors.ink}` },
  pop: { boxShadow: `0 5px 0 ${colors.ink}` },
} as const;

/** The standard sticker outline. Spread onto any card/badge/control. */
export const outline = {
  borderWidth: 2,
  borderColor: colors.ink,
} as const;

/** Hard offset text shadow for dimensional display type. */
export const textPop = (color: string, drop = 3) =>
  ({
    textShadowColor: color,
    textShadowOffset: { width: 0, height: drop },
    textShadowRadius: 0,
  }) as const;

/** Depth of the pressable button "edge" in px. */
export const buttonEdge = 4;

/** Bottom content clearance for the floating pill tab bar. */
export const tabClearance = 92;

export const font = {
  // Lilita One — chunky hero font for big titles and big numbers
  hero: 'LilitaOne_400Regular',
  // Baloo 2 — rounded display for section titles and buttons
  display: 'Baloo2_800ExtraBold',
  heading: 'Baloo2_700Bold',
  headingSnug: 'Baloo2_600SemiBold',
  // Nunito — friendly body
  body: 'Nunito_500Medium',
  bodySemibold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
} as const;
