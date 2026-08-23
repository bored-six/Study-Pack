/**
 * Flipp design tokens — soft sticker book.
 * Warm paper ground; surfaces are gentle "stickers": soft warm-ink edges,
 * lightly tinted offset shadows, candy washes, small tilts, duotone icons,
 * and a chunky hero font. Deliberately calm — no harsh outlines or solid
 * black shadows. Gold is reserved for streaks and the offline banner.
 * Single light theme by design.
 */
export const colors = {
  // ground
  bg: '#FAF3E1',
  surface: '#FFFFFF',
  surface2: '#F4EDDA',
  ink: '#27362B',
  edge: 'rgba(39, 54, 43, 0.22)',
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

/** Washes a subject can wear, each with its matching deep ink. */
export const subjectPalette = [
  { wash: '#DDF3DC', ink: '#2C8A4A' }, // mint
  { wash: '#FFE5D2', ink: '#BC5A2E' }, // peach
  { wash: '#FCEBC0', ink: '#A0731A' }, // sun
  { wash: '#DBEEFB', ink: '#2E6FA3' }, // sky
  { wash: '#EAE2FA', ink: '#6C51A8' }, // lilac
  { wash: '#F9DEE7', ink: '#B04A6E' }, // rose
  { wash: '#E3EBD3', ink: '#5F7A34' }, // sage
  { wash: '#EFE3CE', ink: '#8A6B3F' }, // sand
  { wash: '#D9F0EA', ink: '#2F7D6D' }, // aqua
  { wash: '#E0E4F5', ink: '#4A5AA8' }, // periwinkle
] as const;

/** The deep ink paired with a wash; falls back to plain ink. */
export function subjectInkFor(wash: string | null): string {
  return subjectPalette.find((p) => p.wash === wash)?.ink ?? colors.ink;
}

export const radius = {
  card: 22,
  control: 16,
  pill: 999,
} as const;

/** Soft tinted offset shadows — sticker depth without harshness. */
export const shadow = {
  card: { boxShadow: '0 2px 0 rgba(39, 54, 43, 0.08)' },
  pop: { boxShadow: '0 3px 0 rgba(39, 54, 43, 0.11)' },
} as const;

/** The standard soft sticker outline. Spread onto any card/badge/control. */
export const outline = {
  borderWidth: 1.5,
  borderColor: colors.edge,
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

/** Slightly uneven corners — hand-cut sticker, not machine-rounded. */
export const derpRadius = {
  borderTopLeftRadius: 16,
  borderTopRightRadius: 20,
  borderBottomRightRadius: 15,
  borderBottomLeftRadius: 19,
} as const;

export const font = {
  // Patrick Hand — the notebook handwriting for titles and big numbers
  hero: 'PatrickHand_400Regular',
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
