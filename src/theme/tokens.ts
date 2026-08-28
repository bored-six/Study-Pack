import { create } from 'zustand';
/**
 * Flipp design tokens — soft sticker book.
 * Warm paper ground; surfaces are gentle "stickers": soft warm-ink edges,
 * lightly tinted offset shadows, candy washes, small tilts, duotone icons,
 * and a chunky hero font. Deliberately calm — no harsh outlines or solid
 * black shadows. Gold is reserved for streaks and the offline banner.
 * Single light theme by design.
 */
export const lightColors = {
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

/**
 * The same page, at night.
 *
 * The first attempt sat at #1A211C — near black, with cards only 1.29:1
 * above it and washes barely 1.1:1, so every tinted card read as a hole
 * punched in the screen rather than a sticker on paper. This is lifted
 * clear of black and keeps a faint olive cast, because the light
 * theme is warm cream and a cold grey dark mode belongs to a different
 * app. Each level steps ~1.28:1 above the last, so a card sits on the
 * page and a nested card sits on the card.
 *
 * Every colour pairing the UI actually renders clears 4.5:1, checked
 * rather than eyeballed. disabledText against disabledBg is the one
 * exception at 3.7:1 — disabled controls are meant to recede.
 */
export const darkColors = {
  // ground: three steps, each visibly above the last
  bg: '#373D33',
  surface: '#464E41',
  surface2: '#555E4F',
  ink: '#F2F4F0',
  edge: 'rgba(242, 244, 240, 0.28)',
  line: 'rgba(242, 244, 240, 0.18)',
  lineSoft: 'rgba(242, 244, 240, 0.12)',
  // text
  text: '#F2F4F0',
  textDim: '#CBD1C5',
  textFaint: '#BCC3B6',
  // accent (hero green)
  accent: '#6FDD93',
  accentEdge: '#4CBE72',
  accentDeep: '#A6EDBE',
  onAccent: '#12301B',
  accentWash: '#456650',
  // semantics — washes lifted so a tinted card still reads as paper
  leaf: '#BCEBAA',
  leafWash: '#4C6B42',
  coral: '#F9BBAA',
  coralWash: '#6B483E',
  gold: '#F6D584',
  goldWash: '#6B5C3B',
  // controls
  track: '#5F6859',
  disabledBg: '#484F43',
  disabledText: '#A3AB9C',
} as const;

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: false,
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
}));

/**
 * Sets the theme without going through the toggle, so the stored
 * preference can be restored on launch. Without this the switch worked
 * but forgot itself the moment the app closed.
 */
export function setDarkMode(on: boolean): void {
  useThemeStore.setState({ isDark: on });
}

export const getColors = (isDark: boolean) => isDark ? darkColors : lightColors;
export const colors = lightColors; // Fallback for static files


/** Candy washes rotated across deck cards for sticker-sheet variety. */
export const candy = [
  { wash: '#DDF3DC', ink: '#2C8A4A' }, // mint
  { wash: '#FFE5D2', ink: '#BC5A2E' }, // peach
  { wash: '#FCEBC0', ink: '#A0731A' }, // sun
  { wash: '#DBEEFB', ink: '#2E6FA3' }, // sky
  { wash: '#EAE2FA', ink: '#6C51A8' }, // lilac
] as const;

/**
 * Washes a subject can wear, each with its matching deep ink.
 * Ordered around the wheel — greens, yellows, warms, pinks, purples,
 * blues, teals, then a neutral — so the picker reads as a paint strip.
 * Never reorder or remove a wash: the hex is what's stored on the deck.
 */
export const subjectPalette = [
  { wash: '#DDF3DC', ink: '#2C8A4A' }, // mint
  { wash: '#CFEBBD', ink: '#4E7B2C' }, // grass
  { wash: '#E3EBD3', ink: '#5F7A34' }, // sage
  { wash: '#F6F3BE', ink: '#8A7C1E' }, // lemon
  { wash: '#FCEBC0', ink: '#A0731A' }, // sun
  { wash: '#EFE3CE', ink: '#8A6B3F' }, // sand
  { wash: '#FFDDB8', ink: '#B06F1F' }, // apricot
  { wash: '#FFE5D2', ink: '#BC5A2E' }, // peach
  { wash: '#FBD5CC', ink: '#B24A38' }, // coral
  { wash: '#F7CFD3', ink: '#A94050' }, // cherry
  { wash: '#F9DEE7', ink: '#B04A6E' }, // rose
  { wash: '#F2D9F0', ink: '#8E4C8B' }, // orchid
  { wash: '#EAE2FA', ink: '#6C51A8' }, // lilac
  { wash: '#DCD5F2', ink: '#5B4AA0' }, // grape
  { wash: '#E0E4F5', ink: '#4A5AA8' }, // periwinkle
  { wash: '#DBEEFB', ink: '#2E6FA3' }, // sky
  { wash: '#CDE0F2', ink: '#33628F' }, // denim
  { wash: '#D9F0EA', ink: '#2F7D6D' }, // aqua
  { wash: '#C9E9E4', ink: '#2C6F68' }, // teal
  { wash: '#E2E5E0', ink: '#5C6A5B' }, // stone
  { wash: '#FF1493', ink: '#8B008B' }, // deep pink
  { wash: '#FF4500', ink: '#8B0000' }, // orange red
  { wash: '#FFD700', ink: '#8B6508' }, // gold
  { wash: '#00FF7F', ink: '#006400' }, // spring green
  { wash: '#00BFFF', ink: '#00008B' }, // deep sky blue
  { wash: '#9370DB', ink: '#4B0082' }, // medium purple
  { wash: '#FF69B4', ink: '#C71585' }, // hot pink
  { wash: '#7FFF00', ink: '#556B2F' }, // chartreuse
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
