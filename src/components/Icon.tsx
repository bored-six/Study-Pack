import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

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

export function Icon({
  name,
  size = 22,
  color = colors.ink,
  fill = 'none',
  strokeWidth = 2,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none">
        {glyphs[name](fill, color)}
      </G>
    </Svg>
  );
}

const glyphs = {
  // ── tab bar ────────────────────────────────────────────────
  cards: (f: string) => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} fill={f} />
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
  play: (f: string, ink: string) => <Path d="M8.5 5.5 18 12l-9.5 6.5z" fill={f === 'none' ? ink : f} />,
  check: () => <Path d="m5 12.5 4.5 4.5L19 7" />,
  cross: () => (
    <>
      <Path d="M6.5 6.5 17.5 17.5" />
      <Path d="M17.5 6.5 6.5 17.5" />
    </>
  ),
  flame: (f: string) => (
    <Path
      d="M12 3c.8 2.6-.3 4.2 1.6 6.4 1.5 1.8 3.4 3.3 3.4 5.6a5 5 0 0 1-10 0c0-1.6.7-3 1.7-4.4.5.8 1 1.2 1.8 1.4C11 9.5 10.6 6 12 3z"
      fill={f}
    />
  ),
  trophy: (f: string) => (
    <>
      <Path d="M8 4h8v6a4 4 0 0 1-8 0z" fill={f} />
      <Path d="M8 6H5v1.5a3 3 0 0 0 3 3" />
      <Path d="M16 6h3v1.5a3 3 0 0 1-3 3" />
      <Path d="M12 14v3" />
      <Path d="M8.5 20h7" />
      <Path d="M10 17h4" />
    </>
  ),
  bolt: (f: string) => <Path d="M13 2.5 5.5 13.5H11L10 21.5 18.5 10.5H13z" fill={f} />,
  plane: (f: string) => (
    <>
      <Path d="M21 3.5 3.5 10.7l6.8 2.4 2.4 6.8z" fill={f} />
      <Path d="M10.3 13.1 21 3.5" />
    </>
  ),
  sprout: (f: string) => (
    <>
      <Path d="M12 21v-8" />
      <Path d="M12 14.5c0-4-2.8-6.5-6.5-6.5 0 4 2.8 6.5 6.5 6.5z" fill={f} />
      <Path d="M12 12c0-3.5 2.4-5.5 5.8-5.5 0 3.5-2.4 5.5-5.8 5.5z" fill={f} />
    </>
  ),
  alert: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 7.5V13" />
      <Path d="M12 16.4v.1" />
    </>
  ),
  star: (f: string) => (
    <Path
      d="m12 3.5 2.47 5.26 5.53.7-4.1 3.9 1.07 5.64L12 16.2 7.03 19l1.07-5.64L4 9.46l5.53-.7z"
      fill={f}
    />
  ),
  // ── deck categories ────────────────────────────────────────
  bulb: (f: string) => (
    <>
      <Path
        d="M12 3a6.5 6.5 0 0 1 4 11.6c-.8.6-1.2 1.4-1.3 2.4H9.3c-.1-1-.5-1.8-1.3-2.4A6.5 6.5 0 0 1 12 3z"
        fill={f}
      />
      <Path d="M10 20.5h4" />
    </>
  ),
  flask: (f: string) => (
    <>
      <Path
        d="M10.5 3.5v5L6 17.5a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3L13.5 8.5v-5"
        fill={f}
      />
      <Path d="M10 3.5h4" />
      <Path d="M8.3 14.5h7.4" />
    </>
  ),
  leaf: (f: string) => (
    <>
      <Path d="M19.5 4.5C9.5 4.5 4.5 10 4.5 19.5c9.5 0 15-5 15-15z" fill={f} />
      <Path d="M7.5 16.5c2.3-4.5 5.5-7.7 9.5-9.5" />
    </>
  ),
  monitor: (f: string) => (
    <>
      <Rect x={3.5} y={5} width={17} height={11.5} rx={2} fill={f} />
      <Path d="M12 16.5v3.5" />
      <Path d="M8.5 20.5h7" />
    </>
  ),
  calculator: (f: string) => (
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
  museum: (f: string) => (
    <>
      <Path d="M4 9.5 12 4l8 5.5z" fill={f} />
      <Path d="M6.5 12.5v5M11 12.5v5M15.5 12.5v5M20 12.5v5" />
      <Path d="M4 20.5h16.5" />
    </>
  ),
  globe: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 3.5c3 2.7 3 14.3 0 17M12 3.5c-3 2.7-3 14.3 0 17" />
      <Path d="M3.5 12h17" />
    </>
  ),
  note: (f: string) => (
    <>
      <Path d="M9.2 18.5V6l9-2.5V16" />
      <Circle cx={7} cy={18.5} r={2.2} fill={f} />
      <Circle cx={16} cy={16} r={2.2} fill={f} />
    </>
  ),
  clapper: (f: string) => (
    <>
      <Rect x={3.5} y={6} width={17} height={13} rx={2} fill={f} />
      <Path d="M3.5 10.5h17" />
      <Path d="m8 6-2 4.5M13 6l-2 4.5M18 6l-2 4.5" />
    </>
  ),
  tv: (f: string) => (
    <>
      <Rect x={3.5} y={7} width={17} height={12} rx={2} fill={f} />
      <Path d="M8.5 3.5 12 7l3.5-3.5" />
    </>
  ),
  gamepad: (f: string) => (
    <>
      <Rect x={3.5} y={8} width={17} height={9} rx={4.5} fill={f} />
      <Path d="M8 10.5v4M6 12.5h4" />
      <Circle cx={15.2} cy={11.3} r={0.4} />
      <Circle cx={17.4} cy={13.7} r={0.4} />
    </>
  ),
  dice: (f: string) => (
    <>
      <Rect x={4.5} y={4.5} width={15} height={15} rx={3} fill={f} />
      <Circle cx={9} cy={9} r={0.5} />
      <Circle cx={15} cy={9} r={0.5} />
      <Circle cx={12} cy={12} r={0.5} />
      <Circle cx={9} cy={15} r={0.5} />
      <Circle cx={15} cy={15} r={0.5} />
    </>
  ),
  book: (f: string) => (
    <>
      <Path
        d="M12 6.5c-2-1.7-5-2-8.5-2V18c3.5 0 6.5.3 8.5 2 2-1.7 5-2 8.5-2V4.5c-3.5 0-6.5.3-8.5 2z"
        fill={f}
      />
      <Path d="M12 6.5V20" />
    </>
  ),
  palette: (f: string) => (
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
  paw: (f: string) => (
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
  flag: (f: string) => (
    <>
      <Path
        d="M5.5 4.8c2.5-1.2 4.5-1.2 7 0s4.4 1.2 6.5.4v8.3c-2.1.8-4 .8-6.5-.4s-4.5-1.2-7 0z"
        fill={f}
      />
      <Path d="M5.5 21V3.5" />
    </>
  ),
  car: (f: string) => (
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
  flower: (f: string) => (
    <>
      <Circle cx={12} cy={5.7} r={2.6} fill={f} />
      <Circle cx={17.9} cy={10} r={2.6} fill={f} />
      <Circle cx={15.6} cy={16.8} r={2.6} fill={f} />
      <Circle cx={8.4} cy={16.8} r={2.6} fill={f} />
      <Circle cx={6.1} cy={10} r={2.6} fill={f} />
      <Circle cx={12} cy={12} r={2.3} fill={f} />
    </>
  ),
  burst: (f: string) => (
    <Path
      d="m12 3 1.8 4 4.2-1.6-1.6 4.2 4 1.8-4 1.8 1.6 4.2-4.2-1.6-1.8 4-1.8-4-4.2 1.6 1.6-4.2-4-1.8 4-1.8L6 5.4l4.2 1.6z"
      fill={f}
    />
  ),
  smartphone: (f: string) => (
    <>
      <Rect x={7} y={3.5} width={10} height={17} rx={2.5} fill={f} />
      <Path d="M10.5 6.5h3" />
      <Circle cx={12} cy={17.3} r={0.5} />
    </>
  ),
  clock: (f: string) => (
    <>
      <Circle cx={12} cy={12} r={8.5} fill={f} />
      <Path d="M12 7.2V12l3.3 2" />
    </>
  ),
  calendar: (f: string) => (
    <>
      <Rect x={3.5} y={5.5} width={17} height={15} rx={2.5} fill={f} />
      <Path d="M3.5 10h17" />
      <Path d="M8 3.5v4M16 3.5v4" />
    </>
  ),
  bell: (f: string) => (
    <>
      <Path d="M12 3.5a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0 1 12 3.5z" fill={f} />
      <Path d="M10 17.5a2 2 0 0 0 4 0" />
    </>
  ),
  plus: () => (
    <>
      <Path d="M12 5.5v13" />
      <Path d="M5.5 12h13" />
    </>
  ),
  trash: (f: string) => (
    <>
      <Path d="M4.5 6.5h15" />
      <Path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <Path d="M6.5 6.5h11l-.9 12.2a1.8 1.8 0 0 1-1.8 1.8H9.2a1.8 1.8 0 0 1-1.8-1.8z" fill={f} />
    </>
  ),
} as const;
