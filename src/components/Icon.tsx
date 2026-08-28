import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { getColors, useThemeStore } from '@/theme/tokens';

/**
 * The dot in an eye, the pip on a die, the seed in a fruit.
 *
 * These sit on top of the glyph's own pastel fill rather than on the page,
 * so they are the same dark ink in both themes — a colour that followed the
 * theme would turn near-white at night and vanish into the fill it is
 * drawn on.
 */
const DETAIL_INK = '#27362B';

/** A tongue, a nib, a drop — the same reason, in colour. */
const DETAIL_CORAL = '#C24E38';
/** A highlight on a filled glyph, so it reads as paper rather than a hole. */
const DETAIL_PAPER = '#FFFFFF';

/**
 * Flipp's duotone sticker icons: candy/paper fills under chunky 2px
 * rounded ink strokes on a 24×24 grid — enamel-pin style, not line icons.
 * Pass `fill` for the body color (defaults to transparent for pure-line
 * glyphs like check/cross). `*Filled` variants exist for the tab bar.
 */
export type IconName = keyof typeof glyphs;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}

/** Every glyph leans a little, deterministically — hand-placed, not printed. */
function wonkFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return ((hash % 29) - 14) / 2; // -7deg … +7deg
}

export function Icon({
  name,
  size = 22,
  color,
  fill = 'none',
  strokeWidth = 2,
}: Props) {
  // The default used to be the light theme's ink, so any icon that did not
  // name a colour was drawn dark-on-dark at night — which is most of them.
  const isDark = useThemeStore((s) => s.isDark);
  const stroke = color ?? getColors(isDark).ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        transform={`rotate(${wonkFor(name)} 12 12)`}>
        {glyphs[name] ? (
          glyphs[name](fill, stroke)
        ) : (
          console.warn(`[Icon] Missing glyph for name: "${name}"`),
          null
        )}
      </G>
    </Svg>
  );
}

const glyphs = {
  // --- New Tab Bar B Icons ---
  decksTab: (f: string, ink: string) => (
    <>
      <Rect x={4} y={8} width={12} height={14} rx={2} fill="rgba(255,255,255,0.4)" stroke={ink} />
      <Path d="M8 6 H18 A2 2 0 0 1 20 8 V18" stroke={ink} />
      <Circle cx={10} cy={15} r={1} fill={ink} stroke="none" />
      <Circle cx={14} cy={15} r={1.5} fill={ink} stroke="none" />
    </>
  ),
  plannerTab: (f: string, ink: string) => (
    <>
      <Rect x={3} y={6} width={18} height={15} rx={2} />
      <Path d="M8 4 V8 M16 4 V8 M3 10 H21" />
      <Path d="M9 15 L11 17 L16 12" />
    </>
  ),
  progressTab: (f: string, ink: string) => (
    <>
      <Path d="M4 20 H20 M4 20 V4" />
      <Path d="M8 16 L12 10 L16 12 L20 6" />
      <Circle cx={20} cy={6} r={2} fill={ink} stroke="none" />
    </>
  ),
  // ── tab bar ────────────────────────────────────────────────
  cards: (f: string) => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} fill={f} />
      <Circle cx={8} cy={13} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={12} cy={13} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M9 15h2" />
    </>
  ),
  cardsFilled: (f: string, ink: string) => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} fill={ink} />
    </>
  ),
  chart: (f: string) => (
    <>
      <Rect x={3.5} y={12} width={4} height={8.5} rx={1.8} fill={f} />
      <Rect x={10} y={4} width={4} height={16.5} rx={1.8} fill={f} />
      <Rect x={16.5} y={9} width={4} height={11.5} rx={1.8} fill={f} />
      <Circle cx={12} cy={8} r={0.8} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  chartFilled: (f: string, ink: string) => (
    <>
      <Rect x={3.5} y={12} width={4} height={8.5} rx={1.8} fill={ink} />
      <Rect x={10} y={4} width={4} height={16.5} rx={1.8} fill={ink} />
      <Rect x={16.5} y={9} width={4} height={11.5} rx={1.8} fill={ink} />
    </>
  ),
  // ── ui ─────────────────────────────────────────────────────
  download: () => (
    <>
      <Path d="M12 4v10" />
      <Path d="M7.5 10.5 12 15l4.5-4.5" />
      <Path d="M4.5 19.5h15" />
    </>
  ),
  play: (f: string, ink: string) => (
    <Path d="M8.2 4.6c3.8 1.7 7.2 4.2 10.6 7.4-3.6 2.6-7.1 4.6-10.9 6.1.4-4.5.2-9 .3-13.5z" fill={f === 'none' ? ink : f} />
  ),
  check: () => (
    <Path d="M4.3 14.2c2 .8 3.6 2.2 4.7 4.3 1.9-5.4 5.2-9.3 10.3-12.2-.9-.2-1.6-.7-2.1-1.4" />
  ),
  cross: () => (
    <>
      <Path d="M6.9 5.4c2.9 4.4 6.5 8.3 11 13" />
      <Path d="M18.6 7.2c-5.1 2.5-8.8 6-12.5 10.9" />
    </>
  ),
  // ── School ────────────────────────────────────────────────
  book: (f: string) => (
    <>
      <Path d="M4 6c0-1.5 2-2 7-1 0 0 1 0 1 1v13c0 1.5-2 1-7 0v-13z" fill={f} />
      <Path d="M20 6c0-1.5-2-2-7-1 0 0-1 0-1 1v13c0 1.5 2 1 7 0v-13z" fill={f} />
      <Circle cx={7} cy={11} r={1.2} fill={DETAIL_INK} stroke="none" />
      <Circle cx={9.5} cy={10.5} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M7 14c0.5 1 1.5 1 2 0" />
      <Path d="M7.5 14.5v1.5c0 1 1 1 1 0v-1.5" fill={DETAIL_CORAL} />
    </>
  ),
  note: (f: string) => (
    <>
      <Path d="M9.2 18.5V6l9-2.5V16" />
      <Circle cx={7} cy={18.5} r={2.2} fill={f} />
      <Circle cx={16} cy={16} r={2.2} fill={f} />
      <Circle cx={12} cy={10} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={10} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M12 12h2" />
    </>
  ),
  pencil: (f: string) => (
    <>
      <Path d="M18 4l2 2 -3 3 -2 -2z" fill={DETAIL_CORAL} />
      <Path d="M15 7l2 2 -8 8 -3 -1 1 -3z" fill={f} />
      <Path d="M5 15l1 -3 -3 4 2 0z" />
      <Path d="M3 16l1 -1 -1 1z" fill={DETAIL_INK} />
      <Circle cx={9} cy={11} r={0.8} fill={DETAIL_INK} stroke="none"/>
      <Circle cx={11.5} cy={13.5} r={0.8} fill={DETAIL_INK} stroke="none"/>
      <Path d="M8 13.5c1 1 2 0 2 0" />
    </>
  ),
  calculator: (f: string) => (
    <>
      <Rect x={5} y={4} width={14} height={16} rx={2} fill={f} />
      <Circle cx={9} cy={11} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={12} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 15h2 M8 7h8" />
    </>
  ),
  flask: (f: string) => (
    <>
      <Path d="M10.5 3.5v5L6 17.5a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3L13.5 8.5v-5" fill={f} />
      <Path d="M10 3.5h4 M8.3 14.5h7.4" />
      <Circle cx={9.5} cy={17} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14.5} cy={17} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 19h2" />
      <Circle cx={11} cy={10} r={1} fill={f} />
      <Circle cx={14} cy={7} r={1.5} fill={f} />
    </>
  ),
  globe: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 3.5c3 2.7 3 14.3 0 17M12 3.5c-3 2.7-3 14.3 0 17" />
      <Path d="M3.5 12h17" />
      <Circle cx={9} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={10} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 14h2" />
    </>
  ),
  museum: (f: string) => (
    <>
      <Path d="M4 9.5 12 4l8 5.5z" fill={f} />
      <Path d="M6.5 12.5v5M11 12.5v5M15.5 12.5v5M20 12.5v5" />
      <Path d="M4 20.5h16.5" />
      <Circle cx={12} cy={8} r={1} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  monitor: (f: string) => (
    <>
      <Rect x={3.5} y={5} width={17} height={11.5} rx={2} fill={f} />
      <Path d="M12 16.5v3.5 M8.5 20.5h7" />
      <Circle cx={9} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={10} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 13h2" />
    </>
  ),
  apple: (f: string) => (
    <>
      <Path d="M12 6C9 4 5 6 5 11c0 5 4 8 7 8s7-3 7-8C19 6 15 4 12 6z" fill={f} />
      <Path d="M12 6c1-3 3-4 4-2" />
      <Circle cx={9} cy={11} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={12} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 15h2" />
    </>
  ),
  atom: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={3} fill={f} />
      <Path d="M11 11.5c1 1 2 0 2 0" />
      <Circle cx={11.5} cy={10.5} r={0.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={12.5} cy={11} r={0.5} fill={DETAIL_INK} stroke="none" />
      <Ellipse cx={12} cy={12} rx={4} ry={10} transform="rotate(45 12 12)" />
      <Ellipse cx={12} cy={12} rx={4} ry={10} transform="rotate(-45 12 12)" />
    </>
  ),
  planet: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={6} fill={f} />
      <Ellipse cx={12} cy={12} rx={10} ry={3} transform="rotate(-20 12 12)" />
      <Circle cx={10} cy={10.5} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={11.5} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 14h2" />
    </>
  ),
  question: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.3" />
      <Path d="M12 16.6v.1" />
    </>
  ),
  // ── Nature ────────────────────────────────────────────────
  leaf: (f: string) => (
    <>
      <Path d="M19.5 4.5C9.5 4.5 4.5 10 4.5 19.5c9.5 0 15-5 15-15z" fill={f} />
      <Path d="M7.5 16.5c2.3-4.5 5.5-7.7 9.5-9.5" />
      <Circle cx={10} cy={11} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M10 14h2" />
    </>
  ),
  sprout: (f: string) => (
    <>
      <Path d="M12 21v-8" />
      <Path d="M12 14.5c0-4-2.8-6.5-6.5-6.5 0 4 2.8 6.5 6.5 6.5z" fill={f} />
      <Path d="M12 12c0-3.5 2.4-5.5 5.8-5.5 0 3.5-2.4 5.5-5.8 5.5z" fill={f} />
      <Circle cx={8} cy={12} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={10} r={0.8} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  flower: (f: string) => (
    <>
      <Circle cx={12} cy={5.7} r={2.6} fill={f} />
      <Circle cx={17.9} cy={10} r={2.6} fill={f} />
      <Circle cx={15.6} cy={16.8} r={2.6} fill={f} />
      <Circle cx={8.4} cy={16.8} r={2.6} fill={f} />
      <Circle cx={6.1} cy={10} r={2.6} fill={f} />
      <Circle cx={12} cy={12} r={2.3} fill={f} />
      <Circle cx={11} cy={11.5} r={0.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={13} cy={11.5} r={0.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 13h2" />
    </>
  ),
  paw: (f: string) => (
    <>
      <Path d="M12 12.3c2.8 0 5 1.9 5 4.3 0 1.7-1.2 2.9-2.7 2.9-.9 0-1.6-.5-2.3-.5s-1.4.5-2.3.5c-1.5 0-2.7-1.2-2.7-2.9 0-2.4 2.2-4.3 5-4.3z" fill={f} />
      <Circle cx={6.3} cy={10} r={1.7} fill={f} />
      <Circle cx={10} cy={6.7} r={1.7} fill={f} />
      <Circle cx={14} cy={6.7} r={1.7} fill={f} />
      <Circle cx={17.7} cy={10} r={1.7} fill={f} />
      <Circle cx={10} cy={15} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={15} r={1} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  cat: (f: string) => (
    <>
      <Path d="M6 16v-6l2-4 3 2 3-2 2 4v6c0 3-2 4-5 4s-5-1-5-4z" fill={f} />
      <Circle cx={9} cy={11} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={13} cy={11} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M10 13c0 2 2 2 2 0" fill={DETAIL_CORAL} />
      <Path d="M2 11l3 1 M2 13l3 -1 M22 11l-3 1 M22 13l-3 -1" />
    </>
  ),
  star: (f: string) => (
    <>
      <Path d="M12.7 2.8l2 5.7 6.4.7-4.9 4.3 2 6.6-6.1-3.6-6.4 3.2 1.9-6.6L3 8.9l6.6-.6z" fill={f} />
      <Circle cx={10} cy={13} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={12} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 15h2" />
    </>
  ),
  spark: (f: string) => (
    <>
      <Path d="M12.6 3.8 13.8 9l5.2 1.2-4.8 1.9-1 5.6-1.9-5-4.7-1.2 4.6-2z" fill={f} />
      <Path d="M18.9 15.1v3.2M17.3 16.6h3.2" />
    </>
  ),
  burst: (f: string) => (
    <Path d="m12 3 1.8 4 4.2-1.6-1.6 4.2 4 1.8-4 1.8 1.6 4.2-4.2-1.6-1.8 4-1.8-4-4.2 1.6 1.6-4.2-4-1.8 4-1.8L6 5.4l4.2 1.6z" fill={f} />
  ),
  flame: (f: string) => (
    <>
      <Path d="M15 2.4c-2.6 2.4-3.2 4.8-2.1 7.8-1-.1-1.7-.6-2.2-1.6-1.5 1.5-2.5 3.1-2.7 5a5.2 5.2 0 0 0 10.3 1.3c.4-2.5-1.2-4.4-2.8-6.3-1.5-1.8-1.3-3.5-.5-6.2z" fill={f} />
      <Circle cx={10} cy={15} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={14} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 17h2" />
    </>
  ),
  flameSmall: (f: string) => (
    <Path d="M12 4.5c1.9 2.6 4 4.4 4 7.4a4 4 0 0 1-8 0c0-3 2.1-4.8 4-7.4z" fill={f} />
  ),
  flameBig: (f: string) => (
    <>
      <Path d="M12 2.5c.9 2.9-.4 4.6 1.8 7.1 1.7 2 3.7 3.6 3.7 6.2a5.5 5.5 0 0 1-11 0c0-1.8.8-3.4 1.9-4.9.5.9 1.1 1.4 2 1.6C10.8 9.4 10.4 5.8 12 2.5z" fill={f} />
      <Path d="M12 12.6c.9 1.3 1.7 2.2 1.7 3.4a1.7 1.7 0 0 1-3.4 0c0-1.2.8-2.1 1.7-3.4z" fill={DETAIL_PAPER} />
    </>
  ),
  flameCrown: (f: string) => (
    <>
      <Path d="M12 2.5c.9 2.9-.4 4.6 1.8 7.1 1.7 2 3.7 3.6 3.7 6.2a5.5 5.5 0 0 1-11 0c0-1.8.8-3.4 1.9-4.9.5.9 1.1 1.4 2 1.6C10.8 9.4 10.4 5.8 12 2.5z" fill={f} />
      <Path d="M12 12.6c.9 1.3 1.7 2.2 1.7 3.4a1.7 1.7 0 0 1-3.4 0c0-1.2.8-2.1 1.7-3.4z" fill={DETAIL_PAPER} />
      <Path d="M4.2 6.4v2M3.2 7.4h2M19.8 5.4v2M18.8 6.4h2M20.4 13v1.6M19.6 13.8h1.6" />
    </>
  ),
  heart: (f: string) => (
    <>
      <Path d="M11.6 20.6S3.9 15.5 4.6 10.1a4.3 4.3 0 0 1 7.2-2.5c.8-2.2 3.5-3.3 5.7-2.2 2.1 1 3 3.5 2.1 5.9-1.3 3.8-5.7 7.1-8 9.3z" fill={f} />
      <Circle cx={8} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={8} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M10 12h3" />
    </>
  ),
  // ── Fun ────────────────────────────────────────────────
  palette: (f: string) => (
    <>
      <Path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.7 0-.8-.5-1.3-.9-1.8-.4-.5-.8-1-.8-1.6 0-1.1.9-1.9 2.3-1.9h1.8a4.1 4.1 0 0 0 4.1-4.1c0-3.8-3.8-5.9-8.5-5.9z" fill={f} />
      <Circle cx={7} cy={9} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={12} cy={11} r={1.2} fill={DETAIL_INK} stroke="none" />
      <Path d="M8 13c1 2 3 1 4 0" fill={DETAIL_CORAL} />
      <Circle cx={15.8} cy={9.2} r={0.5} />
      <Circle cx={7.6} cy={15.2} r={0.5} />
    </>
  ),
  gamepad: (f: string) => (
    <>
      <Rect x={3.5} y={8} width={17} height={9} rx={4.5} fill={f} />
      <Path d="M8 10.5v4M6 12.5h4" />
      <Circle cx={15.2} cy={11.3} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={17.4} cy={13.7} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M10 15h4" />
    </>
  ),
  dice: (f: string) => (
    <>
      <Path d="M5 6 c0-2 1-2 3-2 h8 c2 0 3 0 3 2 v11 c0 2 -1 3 -3 3 h-9 c-2 0-2-1-2-3 z" fill={f} />
      <Circle cx={9} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={15} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={9} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M10 13c1 2 3 1 4 0" fill={DETAIL_CORAL} />
    </>
  ),
  clapper: (f: string) => (
    <>
      <Rect x={3.5} y={6} width={17} height={13} rx={2} fill={f} />
      <Path d="M3.5 10.5h17" />
      <Path d="m8 6-2 4.5M13 6l-2 4.5M18 6l-2 4.5" />
      <Circle cx={9} cy={14} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={14} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M10 16h3" />
    </>
  ),
  tv: (f: string) => (
    <>
      <Rect x={3.5} y={7} width={17} height={12} rx={2} fill={f} />
      <Path d="M8.5 3.5 12 7l3.5-3.5" />
      <Circle cx={9} cy={12} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={12} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 15h2" />
    </>
  ),
  trophy: (f: string) => (
    <>
      <Path d="M8 4h8v6a4 4 0 0 1-8 0z" fill={f} />
      <Path d="M8 6H5v1.5a3 3 0 0 0 3 3" />
      <Path d="M16 6h3v1.5a3 3 0 0 1-3 3" />
      <Path d="M12 14v3 M8.5 20h7 M10 17h4" />
      <Circle cx={10} cy={7} r={1.2} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={7} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 10h2" />
    </>
  ),
  smartphone: (f: string) => (
    <>
      <Rect x={7} y={3.5} width={10} height={17} rx={2.5} fill={f} />
      <Path d="M10.5 6.5h3" />
      <Circle cx={12} cy={17.3} r={0.5} />
      <Circle cx={10} cy={10} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={10} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 13h2" />
    </>
  ),
  car: (f: string) => (
    <>
      <Path d="M4.5 17v-2.6c0-.6.1-1.1.3-1.6l1.4-3.7A2.5 2.5 0 0 1 8.5 7.5h7a2.5 2.5 0 0 1 2.3 1.6l1.4 3.7c.2.5.3 1 .3 1.6V17z" fill={f} />
      <Path d="M5.5 13h13" />
      <Circle cx={8} cy={17.5} r={1.8} fill={f} />
      <Circle cx={16} cy={17.5} r={1.8} fill={f} />
      <Circle cx={10} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 12h2" />
    </>
  ),
  plane: (f: string) => (
    <>
      <Path d="M21 3.5 3.5 10.7l6.8 2.4 2.4 6.8z" fill={f} />
      <Path d="M10.3 13.1 21 3.5" />
      <Circle cx={13} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={16} cy={7} r={0.8} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  flag: (f: string) => (
    <>
      <Path d="M5.5 4.8c2.5-1.2 4.5-1.2 7 0s4.4 1.2 6.5.4v8.3c-2.1.8-4 .8-6.5-.4s-4.5-1.2-7 0z" fill={f} />
      <Path d="M5.5 21V3.5" />
      <Circle cx={10} cy={8} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={9} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 11h2" />
    </>
  ),
  bolt: (f: string) => (
    <>
      <Path d="M13 2.5 5.5 13.5H11L10 21.5 18.5 10.5H13z" fill={f} />
      <Circle cx={10} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={9} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 11h2" />
    </>
  ),
  ghost: (f: string) => (
    <>
      <Path d="M5 11c0-4 3-7 7-7s7 3 7 7v9l-2-2-2 2-2-2-2 2-2-2-2 2v-9z" fill={f} />
      <Circle cx={9} cy={10} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={11.5} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M12 14c0 1.5 2 1.5 2 0" fill={DETAIL_CORAL} />
    </>
  ),
  music: (f: string) => (
    <>
      <Path d="M9 16 A3 2 0 1 1 6 18 V6 L18 3 V15 A3 2 0 1 1 15 17 V7 L9 9 Z" fill={f} />
      <Circle cx={6.5} cy={16.5} r={0.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15.5} cy={15.5} r={0.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M8 11h2 M14 9h2" />
    </>
  ),
  // ── Day ────────────────────────────────────────────────
  clock: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 7.2V12l3.3 2" />
      <Circle cx={9} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 15h2" />
    </>
  ),
  calendar: (f: string) => (
    <>
      <Rect x={3.5} y={5.5} width={17} height={15} rx={2.5} fill={f} />
      <Path d="M3.5 10h17" />
      <Path d="M8 3.5v4M16 3.5v4" />
      <Circle cx={9} cy={14} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={14} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 17h2" />
    </>
  ),
  bell: (f: string) => (
    <>
      <Path d="M13.1 3c3.2.4 5.2 3.1 4.9 6.4.3 4 2 5.2 2 5.2l-15.8.1s1.3-2.1 1.3-5.7C5.5 5.4 8 3.2 13.1 3z" fill={f} />
      <Path d="M13.4 17.2a1.9 1.9 0 0 1-3.8-.5" />
      <Circle cx={9} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={11} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 13h2" />
    </>
  ),
  bulb: (f: string) => (
    <>
      <Path d="M9 20h6 M10 22h4" />
      <Path d="M12 2 c-3 0-6 2.5-6 6 c0 3 2 4 2 7 v2 c0 1 1.5 1.5 4 1.5 s4-0.5 4-1.5 v-2 c0-3 2-4 2-7 c0-3.5-3-6-6-6z" fill={f} />
      <Circle cx={9.5} cy={9} r={1.2} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14.5} cy={10} r={1.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 13c0.5 1 1.5 1 2 0" />
    </>
  ),
  alert: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 7.5V13" />
      <Path d="M12 16.4v.1" />
      <Circle cx={9} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={10} r={1} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  plus: () => (
    <>
      <Path d="M12 4 c-1 4 2 10 0 16" />
      <Path d="M4 12 c4-1 10 2 16 0" />
      <Circle cx={9} cy={8} r={1.5} fill={DETAIL_INK} stroke="none" />
      <Circle cx={15} cy={8} r={1.5} fill={DETAIL_INK} stroke="none" />
    </>
  ),
  trash: (f: string) => (
    <>
      <Path d="M4.5 6.5h15" />
      <Path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <Path d="M6.5 6.5h11l-.9 12.2a1.8 1.8 0 0 1-1.8 1.8H9.2a1.8 1.8 0 0 1-1.8-1.8z" fill={f} />
      <Circle cx={10} cy={13} r={1} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={13} r={1} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 16h2" />
    </>
  ),
  derpBrain: (f: string) => (
    <>
      <Path d="M12 4.5c-3 0-5 2-5 4c-2 0-3.5 1.5-3.5 3.5c0 2 1.5 3.5 3.5 3.5c0 2 2 4.5 5 4.5s5-2.5 5-4.5c2 0 3.5-1.5 3.5-3.5c0-2-1.5-3.5-3.5-3.5c0-2-2-4-5-4z" fill={f} />
      <Rect x={4.5} y={9.5} width={6} height={4.5} rx={1.5} />
      <Rect x={13.5} y={9.5} width={6} height={4.5} rx={1.5} />
      <Path d="M10.5 11.5h3 M4.5 11.5h-1 M19.5 11.5h1" />
      <Circle cx={8} cy={11.5} r={0.6} fill={DETAIL_INK} stroke="none" />
      <Circle cx={16} cy={11.5} r={0.6} fill={DETAIL_INK} stroke="none" />
      <Path d="M10.5 15.5v2c0 2 3 2 3 0v-2" fill={DETAIL_CORAL} />
      <Path d="M12 15.5v2" />
    </>
  ),
  gear: (f: string) => (
    <>
      <Path d="M12 3.6v1.7M12 18.7v1.7M3.6 12h1.7M18.7 12h1.7M6.1 6.1l1.2 1.2M16.7 16.7l1.2 1.2M16.7 7.3l1.2-1.2M7.3 16.7l-1.2 1.2" />
      <Circle cx={12} cy={12} r={6.2} fill={f} />
      <Circle cx={12} cy={12} r={2.3} />
      <Circle cx={10} cy={11} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Circle cx={14} cy={11} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M11 14h2" />
    </>
  ),
  sound: (f: string) => (
    <>
      <Path d="M12.5 4.5 7.5 8.5H4.5v7h3l5 4z" fill={f} />
      <Path d="M15.8 9.4a3.8 3.8 0 0 1 0 5.2M18.4 6.8a7.4 7.4 0 0 1 0 10.4" />
      <Circle cx={9} cy={11} r={0.8} fill={DETAIL_INK} stroke="none" />
      <Path d="M9 14h2" />
    </>
  ),
  flameYear: (f: string) => (
    <>
      <Path d="M12 4.5c.6 1.9-.2 3 1.2 4.7 1.1 1.4 2.6 2.6 2.6 4.6a3.8 3.8 0 0 1-7.6 0c0-1.4.6-2.6 1.5-3.8.4.7.8 1.1 1.5 1.3-.4-2.4-.4-4.6.8-6.8z" fill={f} />
      <Path d="M12 1.6v1.7M4.6 4.7l1.2 1.2M19.4 4.7l-1.2 1.2M2.6 11.8h1.7M19.7 11.8h1.7M4.6 18.4l1.2-1.2M19.4 18.4l-1.2-1.2M12 20.7v1.7" />
    </>
  ),

  derpBrain_OLD: (f: string) => (
    <>
      <Path d="M12 4.5c-3 0-5 2-5 4c-2 0-3.5 1.5-3.5 3.5c0 2 1.5 3.5 3.5 3.5c0 2 2 4.5 5 4.5s5-2.5 5-4.5c2 0 3.5-1.5 3.5-3.5c0-2-1.5-3.5-3.5-3.5c0-2-2-4-5-4z" fill={f} />
      <Rect x={4.5} y={9.5} width={6} height={4.5} rx={1.5} />
      <Rect x={13.5} y={9.5} width={6} height={4.5} rx={1.5} />
      <Path d="M10.5 11.5h3 M4.5 11.5h-1 M19.5 11.5h1" />
      <Circle cx={8} cy={11.5} r={0.6} fill={DETAIL_INK} stroke="none" />
      <Circle cx={16} cy={11.5} r={0.6} fill={DETAIL_INK} stroke="none" />
      <Path d="M10.5 15.5v2c0 2 3 2 3 0v-2" fill={DETAIL_CORAL} />
      <Path d="M12 15.5v2" />
    </>
  ),

  derpCat: (f: string) => glyphs.cat(f),
  derpGhost: (f: string) => glyphs.ghost(f),

  // ── tab bar ────────────────────────────────────────────────
  cardsClassic: (f: string) => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} fill={f} />
    </>
  ),
  cardsFilledClassic: (f: string, ink: string) => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} fill={ink} />
    </>
  ),
  chartClassic: (f: string) => (
    <>
      <Rect x={3.5} y={12} width={4} height={8.5} rx={1.8} fill={f} />
      <Rect x={10} y={4} width={4} height={16.5} rx={1.8} fill={f} />
      <Rect x={16.5} y={9} width={4} height={11.5} rx={1.8} fill={f} />
    </>
  ),
  chartFilledClassic: (f: string, ink: string) => (
    <>
      <Rect x={3.5} y={12} width={4} height={8.5} rx={1.8} fill={ink} />
      <Rect x={10} y={4} width={4} height={16.5} rx={1.8} fill={ink} />
      <Rect x={16.5} y={9} width={4} height={11.5} rx={1.8} fill={ink} />
    </>
  ),
  // ── ui ─────────────────────────────────────────────────────
  downloadClassic: () => (
    <>
      <Path d="M12 4v10" />
      <Path d="M7.5 10.5 12 15l4.5-4.5" />
      <Path d="M4.5 19.5h15" />
    </>
  ),
  playClassic: (f: string, ink: string) => <Path d="M8.5 5.5 18 12l-9.5 6.5z" fill={f === 'none' ? ink : f} />,
  checkClassic: () => <Path d="m5 12.5 4.5 4.5L19 7" />,
  crossClassic: () => (
    <>
      <Path d="M6.5 6.5 17.5 17.5" />
      <Path d="M17.5 6.5 6.5 17.5" />
    </>
  ),
  flameClassic: (f: string) => (
    <Path
      d="M12 3c.8 2.6-.3 4.2 1.6 6.4 1.5 1.8 3.4 3.3 3.4 5.6a5 5 0 0 1-10 0c0-1.6.7-3 1.7-4.4.5.8 1 1.2 1.8 1.4C11 9.5 10.6 6 12 3z"
      fill={f}
    />
  ),
  trophyClassic: (f: string) => (
    <>
      <Path d="M8 4h8v6a4 4 0 0 1-8 0z" fill={f} />
      <Path d="M8 6H5v1.5a3 3 0 0 0 3 3" />
      <Path d="M16 6h3v1.5a3 3 0 0 1-3 3" />
      <Path d="M12 14v3" />
      <Path d="M8.5 20h7" />
      <Path d="M10 17h4" />
    </>
  ),
  boltClassic: (f: string) => <Path d="M13 2.5 5.5 13.5H11L10 21.5 18.5 10.5H13z" fill={f} />,
  planeClassic: (f: string) => (
    <>
      <Path d="M21 3.5 3.5 10.7l6.8 2.4 2.4 6.8z" fill={f} />
      <Path d="M10.3 13.1 21 3.5" />
    </>
  ),
  sproutClassic: (f: string) => (
    <>
      <Path d="M12 21v-8" />
      <Path d="M12 14.5c0-4-2.8-6.5-6.5-6.5 0 4 2.8 6.5 6.5 6.5z" fill={f} />
      <Path d="M12 12c0-3.5 2.4-5.5 5.8-5.5 0 3.5-2.4 5.5-5.8 5.5z" fill={f} />
    </>
  ),
  alertClassic: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 7.5V13" />
      <Path d="M12 16.4v.1" />
    </>
  ),
  starClassic: (f: string) => (
    <Path
      d="m12 3.5 2.47 5.26 5.53.7-4.1 3.9 1.07 5.64L12 16.2 7.03 19l1.07-5.64L4 9.46l5.53-.7z"
      fill={f}
    />
  ),
  // ── deck categories ────────────────────────────────────────
  bulbClassic: (f: string) => (
    <>
      <Path
        d="M12 3a6.5 6.5 0 0 1 4 11.6c-.8.6-1.2 1.4-1.3 2.4H9.3c-.1-1-.5-1.8-1.3-2.4A6.5 6.5 0 0 1 12 3z"
        fill={f}
      />
      <Path d="M10 20.5h4" />
    </>
  ),
  flaskClassic: (f: string) => (
    <>
      <Path
        d="M10.5 3.5v5L6 17.5a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3L13.5 8.5v-5"
        fill={f}
      />
      <Path d="M10 3.5h4" />
      <Path d="M8.3 14.5h7.4" />
    </>
  ),
  leafClassic: (f: string) => (
    <>
      <Path d="M19.5 4.5C9.5 4.5 4.5 10 4.5 19.5c9.5 0 15-5 15-15z" fill={f} />
      <Path d="M7.5 16.5c2.3-4.5 5.5-7.7 9.5-9.5" />
    </>
  ),
  monitorClassic: (f: string) => (
    <>
      <Rect x={3.5} y={5} width={17} height={11.5} rx={2} fill={f} />
      <Path d="M12 16.5v3.5" />
      <Path d="M8.5 20.5h7" />
    </>
  ),
  calculatorClassic: (f: string) => (
    <>
      <Rect x={5.5} y={3.5} width={13} height={17} rx={2.5} fill={f} />
      <Path d="M9 7.5h6" />
      <Circle cx={9} cy={12} r={0.4} />
      <Circle cx={12} cy={12} r={0.4} />
      <Circle cx={15} cy={12} r={0.4} />
      <Circle cx={9} cy={16} r={0.4} />
      <Circle cx={12} cy={16} r={0.4} />
      <Circle cx={15} cy={16} r={0.4} />
    </>
  ),
  museumClassic: (f: string) => (
    <>
      <Path d="M4 9.5 12 4l8 5.5z" fill={f} />
      <Path d="M6.5 12.5v5M11 12.5v5M15.5 12.5v5M20 12.5v5" />
      <Path d="M4 20.5h16.5" />
    </>
  ),
  globeClassic: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 3.5c3 2.7 3 14.3 0 17M12 3.5c-3 2.7-3 14.3 0 17" />
      <Path d="M3.5 12h17" />
    </>
  ),
  noteClassic: (f: string) => (
    <>
      <Path d="M9.2 18.5V6l9-2.5V16" />
      <Circle cx={7} cy={18.5} r={2.2} fill={f} />
      <Circle cx={16} cy={16} r={2.2} fill={f} />
    </>
  ),
  clapperClassic: (f: string) => (
    <>
      <Rect x={3.5} y={6} width={17} height={13} rx={2} fill={f} />
      <Path d="M3.5 10.5h17" />
      <Path d="m8 6-2 4.5M13 6l-2 4.5M18 6l-2 4.5" />
    </>
  ),
  tvClassic: (f: string) => (
    <>
      <Rect x={3.5} y={7} width={17} height={12} rx={2} fill={f} />
      <Path d="M8.5 3.5 12 7l3.5-3.5" />
    </>
  ),
  gamepadClassic: (f: string) => (
    <>
      <Rect x={3.5} y={8} width={17} height={9} rx={4.5} fill={f} />
      <Path d="M8 10.5v4M6 12.5h4" />
      <Circle cx={15.2} cy={11.3} r={0.4} />
      <Circle cx={17.4} cy={13.7} r={0.4} />
    </>
  ),
  diceClassic: (f: string) => (
    <>
      <Rect x={4.5} y={4.5} width={15} height={15} rx={3} fill={f} />
      <Circle cx={9} cy={9} r={0.5} />
      <Circle cx={15} cy={9} r={0.5} />
      <Circle cx={12} cy={12} r={0.5} />
      <Circle cx={9} cy={15} r={0.5} />
      <Circle cx={15} cy={15} r={0.5} />
    </>
  ),
  bookClassic: (f: string) => (
    <>
      <Path
        d="M12 6.5c-2-1.7-5-2-8.5-2V18c3.5 0 6.5.3 8.5 2 2-1.7 5-2 8.5-2V4.5c-3.5 0-6.5.3-8.5 2z"
        fill={f}
      />
      <Path d="M12 6.5V20" />
    </>
  ),
  paletteClassic: (f: string) => (
    <>
      <Path
        d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.7 0-.8-.5-1.3-.9-1.8-.4-.5-.8-1-.8-1.6 0-1.1.9-1.9 2.3-1.9h1.8a4.1 4.1 0 0 0 4.1-4.1c0-3.8-3.8-5.9-8.5-5.9z"
        fill={f}
      />
      <Circle cx={8.2} cy={9.2} r={0.5} />
      <Circle cx={12} cy={7.4} r={0.5} />
      <Circle cx={15.8} cy={9.2} r={0.5} />
      <Circle cx={7.6} cy={13.2} r={0.5} />
    </>
  ),
  pawClassic: (f: string) => (
    <>
      <Path
        d="M12 12.3c2.8 0 5 1.9 5 4.3 0 1.7-1.2 2.9-2.7 2.9-.9 0-1.6-.5-2.3-.5s-1.4.5-2.3.5c-1.5 0-2.7-1.2-2.7-2.9 0-2.4 2.2-4.3 5-4.3z"
        fill={f}
      />
      <Circle cx={6.3} cy={10} r={1.7} fill={f} />
      <Circle cx={10} cy={6.7} r={1.7} fill={f} />
      <Circle cx={14} cy={6.7} r={1.7} fill={f} />
      <Circle cx={17.7} cy={10} r={1.7} fill={f} />
    </>
  ),
  flagClassic: (f: string) => (
    <>
      <Path
        d="M5.5 4.8c2.5-1.2 4.5-1.2 7 0s4.4 1.2 6.5.4v8.3c-2.1.8-4 .8-6.5-.4s-4.5-1.2-7 0z"
        fill={f}
      />
      <Path d="M5.5 21V3.5" />
    </>
  ),
  carClassic: (f: string) => (
    <>
      <Path
        d="M4.5 17v-2.6c0-.6.1-1.1.3-1.6l1.4-3.7A2.5 2.5 0 0 1 8.5 7.5h7a2.5 2.5 0 0 1 2.3 1.6l1.4 3.7c.2.5.3 1 .3 1.6V17z"
        fill={f}
      />
      <Path d="M5.5 13h13" />
      <Circle cx={8} cy={17.5} r={1.8} fill={f} />
      <Circle cx={16} cy={17.5} r={1.8} fill={f} />
    </>
  ),
  flowerClassic: (f: string) => (
    <>
      <Circle cx={12} cy={5.7} r={2.6} fill={f} />
      <Circle cx={17.9} cy={10} r={2.6} fill={f} />
      <Circle cx={15.6} cy={16.8} r={2.6} fill={f} />
      <Circle cx={8.4} cy={16.8} r={2.6} fill={f} />
      <Circle cx={6.1} cy={10} r={2.6} fill={f} />
      <Circle cx={12} cy={12} r={2.3} fill={f} />
    </>
  ),
  burstClassic: (f: string) => (
    <Path
      d="m12 3 1.8 4 4.2-1.6-1.6 4.2 4 1.8-4 1.8 1.6 4.2-4.2-1.6-1.8 4-1.8-4-4.2 1.6 1.6-4.2-4-1.8 4-1.8L6 5.4l4.2 1.6z"
      fill={f}
    />
  ),
  smartphoneClassic: (f: string) => (
    <>
      <Rect x={7} y={3.5} width={10} height={17} rx={2.5} fill={f} />
      <Path d="M10.5 6.5h3" />
      <Circle cx={12} cy={17.3} r={0.5} />
    </>
  ),
  clockClassic: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 7.2V12l3.3 2" />
    </>
  ),
  calendarClassic: (f: string) => (
    <>
      <Rect x={3.5} y={5.5} width={17} height={15} rx={2.5} fill={f} />
      <Path d="M3.5 10h17" />
      <Path d="M8 3.5v4M16 3.5v4" />
    </>
  ),
  bellClassic: (f: string) => (
    <>
      <Path d="M12 3.5a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0 1 12 3.5z" fill={f} />
      <Path d="M10 17.5a2 2 0 0 0 4 0" />
    </>
  ),
  plusClassic: () => (
    <>
      <Path d="M12 5.5v13" />
      <Path d="M5.5 12h13" />
    </>
  ),
  trashClassic: (f: string) => (
    <>
      <Path d="M4.5 6.5h15" />
      <Path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <Path d="M6.5 6.5h11l-.9 12.2a1.8 1.8 0 0 1-1.8 1.8H9.2a1.8 1.8 0 0 1-1.8-1.8z" fill={f} />
    </>
  ),
  sparkClassic: (f: string) => (
    <>
      <Path d="M12 4.5 13.4 9l4.5 1.4-4.5 1.4L12 16.3l-1.4-4.5L6.1 10.4 10.6 9z" fill={f} />
      <Path d="M18.5 15.5v2.6M17.2 16.8h2.6" />
    </>
  ),
  flameSmallClassic: (f: string) => (
    <Path
      d="M12 4.5c1.9 2.6 4 4.4 4 7.4a4 4 0 0 1-8 0c0-3 2.1-4.8 4-7.4z"
      fill={f}
    />
  ),
  flameBigClassic: (f: string) => (
    <>
      <Path
        d="M12 2.5c.9 2.9-.4 4.6 1.8 7.1 1.7 2 3.7 3.6 3.7 6.2a5.5 5.5 0 0 1-11 0c0-1.8.8-3.4 1.9-4.9.5.9 1.1 1.4 2 1.6C10.8 9.4 10.4 5.8 12 2.5z"
        fill={f}
      />
      <Path
        d="M12 12.6c.9 1.3 1.7 2.2 1.7 3.4a1.7 1.7 0 0 1-3.4 0c0-1.2.8-2.1 1.7-3.4z"
        fill={DETAIL_PAPER}
      />
    </>
  ),
  flameCrownClassic: (f: string) => (
    <>
      <Path
        d="M12 2.5c.9 2.9-.4 4.6 1.8 7.1 1.7 2 3.7 3.6 3.7 6.2a5.5 5.5 0 0 1-11 0c0-1.8.8-3.4 1.9-4.9.5.9 1.1 1.4 2 1.6C10.8 9.4 10.4 5.8 12 2.5z"
        fill={f}
      />
      <Path
        d="M12 12.6c.9 1.3 1.7 2.2 1.7 3.4a1.7 1.7 0 0 1-3.4 0c0-1.2.8-2.1 1.7-3.4z"
        fill={DETAIL_PAPER}
      />
      <Path d="M4.2 6.4v2M3.2 7.4h2M19.8 5.4v2M18.8 6.4h2M20.4 13v1.6M19.6 13.8h1.6" />
    </>
  ),
  heartClassic: (f: string) => (
    <Path
      d="M12 20.3s-7.5-4.4-7.5-9.5a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9c0 5.1-7.5 9.5-7.5 9.5z"
      fill={f}
    />
  ),
  questionClassic: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.3" />
      <Path d="M12 16.6v.1" />
    </>
  ),
  pencilClassic: (f: string) => (
    <>
      <Path d="m14.5 5.5 4 4L8 20l-4.6.6L4 16z" fill={f} />
      <Path d="m12.8 7.2 4 4" />
    </>
  ),
  flameTallClassic: (f: string) => (
    <>
      <Path
        d="M12 2c.6 2.2-.2 3.6 1.4 5.6 1.4 1.8 3.6 3.6 3.6 6.4a5 5 0 0 1-10 0c0-2 .9-3.7 2.1-5.3.4.9 1 1.5 1.9 1.7C10.7 8 10.7 4.6 12 2z"
        fill={f}
      />
      <Path d="M12 12.9c.8 1.2 1.5 2 1.5 3.1a1.5 1.5 0 0 1-3 0c0-1.1.7-1.9 1.5-3.1z" fill={DETAIL_PAPER} />
      <Path d="M5.6 7.8c-.5 1-.3 1.9.2 2.6M18.4 6.4c.4 1 .2 1.9-.3 2.6" />
    </>
  ),
  gearClassic: (f: string) => (
    <>
      <Path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M16.7 7.3l1.5-1.5M7.3 16.7l-1.5 1.5" />
      <Circle cx={12} cy={12} r={6.2} fill={f} />
      <Circle cx={12} cy={12} r={2.3} />
    </>
  ),
  flameYearClassic: (f: string) => (
    <>
      <Path
        d="M12 4.5c.6 1.9-.2 3 1.2 4.7 1.1 1.4 2.6 2.6 2.6 4.6a3.8 3.8 0 0 1-7.6 0c0-1.4.6-2.6 1.5-3.8.4.7.8 1.1 1.5 1.3-.4-2.4-.4-4.6.8-6.8z"
        fill={f}
      />
      <Path d="M12 1.6v1.7M4.6 4.7l1.2 1.2M19.4 4.7l-1.2 1.2M2.6 11.8h1.7M19.7 11.8h1.7M4.6 18.4l1.2-1.2M19.4 18.4l-1.2-1.2M12 20.7v1.7" />
    </>
  ),

} as const;
