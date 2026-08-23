import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * StudyPack's hand-drawn icon set: chunky 2px rounded strokes on a 24×24
 * grid, matching the sticker-book look. `*Filled` variants exist for the
 * tab bar's focused state.
 */
export type IconName = keyof typeof glyphs;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = colors.text, strokeWidth = 2 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none">
        {glyphs[name](color)}
      </G>
    </Svg>
  );
}

const glyphs = {
  // ── tab bar ────────────────────────────────────────────────
  cards: () => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} />
    </>
  ),
  cardsFilled: (c: string) => (
    <>
      <Path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
      <Rect x={4} y={7} width={12.5} height={13} rx={2.5} fill={c} />
    </>
  ),
  chart: () => (
    <>
      <Path d="M5 20v-7" />
      <Path d="M12 20V5" />
      <Path d="M19 20v-9" />
    </>
  ),
  chartFilled: (c: string) => (
    <>
      <Rect x={3.5} y={12} width={3.5} height={8.5} rx={1.5} fill={c} strokeWidth={0} />
      <Rect x={10.25} y={4} width={3.5} height={16.5} rx={1.5} fill={c} strokeWidth={0} />
      <Rect x={17} y={9.5} width={3.5} height={11} rx={1.5} fill={c} strokeWidth={0} />
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
  play: (c: string) => <Path d="M8.5 5.5 18 12l-9.5 6.5z" fill={c} strokeWidth={0} />,
  check: () => <Path d="m5 12.5 4.5 4.5L19 7" />,
  cross: () => (
    <>
      <Path d="M6.5 6.5 17.5 17.5" />
      <Path d="M17.5 6.5 6.5 17.5" />
    </>
  ),
  flame: () => (
    <Path d="M12 3c.8 2.6-.3 4.2 1.6 6.4 1.5 1.8 3.4 3.3 3.4 5.6a5 5 0 0 1-10 0c0-1.6.7-3 1.7-4.4.5.8 1 1.2 1.8 1.4C11 9.5 10.6 6 12 3z" />
  ),
  trophy: () => (
    <>
      <Path d="M8 4h8v6a4 4 0 0 1-8 0z" />
      <Path d="M8 6H5v1.5a3 3 0 0 0 3 3" />
      <Path d="M16 6h3v1.5a3 3 0 0 1-3 3" />
      <Path d="M12 14v3" />
      <Path d="M8.5 20h7" />
      <Path d="M10 17h4" />
    </>
  ),
  bolt: () => <Path d="M13 2.5 5.5 13.5H11L10 21.5 18.5 10.5H13z" />,
  plane: () => (
    <>
      <Path d="M21 3.5 3.5 10.7l6.8 2.4 2.4 6.8z" />
      <Path d="M10.3 13.1 21 3.5" />
    </>
  ),
  sprout: () => (
    <>
      <Path d="M12 21v-8" />
      <Path d="M12 14.5c0-4-2.8-6.5-6.5-6.5 0 4 2.8 6.5 6.5 6.5z" />
      <Path d="M12 12c0-3.5 2.4-5.5 5.8-5.5 0 3.5-2.4 5.5-5.8 5.5z" />
    </>
  ),
  alert: () => (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V13" />
      <Path d="M12 16.4v.1" />
    </>
  ),
  star: () => (
    <Path d="m12 3.5 2.47 5.26 5.53.7-4.1 3.9 1.07 5.64L12 16.2 7.03 19l1.07-5.64L4 9.46l5.53-.7z" />
  ),
  // ── deck categories ────────────────────────────────────────
  bulb: () => (
    <>
      <Path d="M12 3a6.5 6.5 0 0 1 4 11.6c-.8.6-1.2 1.4-1.3 2.4H9.3c-.1-1-.5-1.8-1.3-2.4A6.5 6.5 0 0 1 12 3z" />
      <Path d="M10 20.5h4" />
    </>
  ),
  flask: () => (
    <>
      <Path d="M10 3.5h4" />
      <Path d="M10.5 3.5v5L6 17.5a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3L13.5 8.5v-5" />
      <Path d="M8.3 14.5h7.4" />
    </>
  ),
  leaf: () => (
    <>
      <Path d="M19.5 4.5C9.5 4.5 4.5 10 4.5 19.5c9.5 0 15-5 15-15z" />
      <Path d="M7.5 16.5c2.3-4.5 5.5-7.7 9.5-9.5" />
    </>
  ),
  monitor: () => (
    <>
      <Rect x={3.5} y={5} width={17} height={11.5} rx={2} />
      <Path d="M12 16.5v3.5" />
      <Path d="M8.5 20.5h7" />
    </>
  ),
  calculator: () => (
    <>
      <Rect x={5.5} y={3.5} width={13} height={17} rx={2.5} />
      <Path d="M9 7.5h6" />
      <Circle cx={9} cy={12} r={0.4} />
      <Circle cx={12} cy={12} r={0.4} />
      <Circle cx={15} cy={12} r={0.4} />
      <Circle cx={9} cy={16} r={0.4} />
      <Circle cx={12} cy={16} r={0.4} />
      <Circle cx={15} cy={16} r={0.4} />
    </>
  ),
  museum: () => (
    <>
      <Path d="M4 9.5 12 4l8 5.5" />
      <Path d="M6.5 12.5v5M11 12.5v5M15.5 12.5v5M20 12.5v5" />
      <Path d="M4 20.5h16.5" />
    </>
  ),
  globe: () => (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 3.5c3 2.7 3 14.3 0 17M12 3.5c-3 2.7-3 14.3 0 17" />
      <Path d="M3.5 12h17" />
    </>
  ),
  note: () => (
    <>
      <Path d="M9.2 18.5V6l9-2.5V16" />
      <Circle cx={7} cy={18.5} r={2.2} />
      <Circle cx={16} cy={16} r={2.2} />
    </>
  ),
  clapper: () => (
    <>
      <Rect x={3.5} y={6} width={17} height={13} rx={2} />
      <Path d="M3.5 10.5h17" />
      <Path d="m8 6-2 4.5M13 6l-2 4.5M18 6l-2 4.5" />
    </>
  ),
  tv: () => (
    <>
      <Rect x={3.5} y={7} width={17} height={12} rx={2} />
      <Path d="M8.5 3.5 12 7l3.5-3.5" />
    </>
  ),
  gamepad: () => (
    <>
      <Rect x={3.5} y={8} width={17} height={9} rx={4.5} />
      <Path d="M8 10.5v4M6 12.5h4" />
      <Circle cx={15.2} cy={11.3} r={0.4} />
      <Circle cx={17.4} cy={13.7} r={0.4} />
    </>
  ),
  dice: () => (
    <>
      <Rect x={4.5} y={4.5} width={15} height={15} rx={3} />
      <Circle cx={9} cy={9} r={0.5} />
      <Circle cx={15} cy={9} r={0.5} />
      <Circle cx={12} cy={12} r={0.5} />
      <Circle cx={9} cy={15} r={0.5} />
      <Circle cx={15} cy={15} r={0.5} />
    </>
  ),
  book: () => (
    <>
      <Path d="M12 6.5c-2-1.7-5-2-8.5-2V18c3.5 0 6.5.3 8.5 2 2-1.7 5-2 8.5-2V4.5c-3.5 0-6.5.3-8.5 2z" />
      <Path d="M12 6.5V20" />
    </>
  ),
  palette: () => (
    <>
      <Path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.7 0-.8-.5-1.3-.9-1.8-.4-.5-.8-1-.8-1.6 0-1.1.9-1.9 2.3-1.9h1.8a4.1 4.1 0 0 0 4.1-4.1c0-3.8-3.8-5.9-8.5-5.9z" />
      <Circle cx={8.2} cy={9.2} r={0.5} />
      <Circle cx={12} cy={7.4} r={0.5} />
      <Circle cx={15.8} cy={9.2} r={0.5} />
      <Circle cx={7.6} cy={13.2} r={0.5} />
    </>
  ),
  paw: () => (
    <>
      <Path d="M12 12.3c2.8 0 5 1.9 5 4.3 0 1.7-1.2 2.9-2.7 2.9-.9 0-1.6-.5-2.3-.5s-1.4.5-2.3.5c-1.5 0-2.7-1.2-2.7-2.9 0-2.4 2.2-4.3 5-4.3z" />
      <Circle cx={6.3} cy={10} r={1.7} />
      <Circle cx={10} cy={6.7} r={1.7} />
      <Circle cx={14} cy={6.7} r={1.7} />
      <Circle cx={17.7} cy={10} r={1.7} />
    </>
  ),
  flag: () => (
    <>
      <Path d="M5.5 21V3.5" />
      <Path d="M5.5 4.8c2.5-1.2 4.5-1.2 7 0s4.4 1.2 6.5.4v8.3c-2.1.8-4 .8-6.5-.4s-4.5-1.2-7 0z" />
    </>
  ),
  car: () => (
    <>
      <Path d="M4.5 17v-2.6c0-.6.1-1.1.3-1.6l1.4-3.7A2.5 2.5 0 0 1 8.5 7.5h7a2.5 2.5 0 0 1 2.3 1.6l1.4 3.7c.2.5.3 1 .3 1.6V17" />
      <Path d="M5.5 13h13" />
      <Circle cx={8} cy={17.5} r={1.8} />
      <Circle cx={16} cy={17.5} r={1.8} />
    </>
  ),
  flower: () => (
    <>
      <Circle cx={12} cy={12} r={2.3} />
      <Circle cx={12} cy={5.7} r={2.6} />
      <Circle cx={17.9} cy={10} r={2.6} />
      <Circle cx={15.6} cy={16.8} r={2.6} />
      <Circle cx={8.4} cy={16.8} r={2.6} />
      <Circle cx={6.1} cy={10} r={2.6} />
    </>
  ),
  burst: () => (
    <Path d="m12 3 1.8 4 4.2-1.6-1.6 4.2 4 1.8-4 1.8 1.6 4.2-4.2-1.6-1.8 4-1.8-4-4.2 1.6 1.6-4.2-4-1.8 4-1.8L6 5.4l4.2 1.6z" />
  ),
  smartphone: () => (
    <>
      <Rect x={7} y={3.5} width={10} height={17} rx={2.5} />
      <Path d="M10.5 6.5h3" />
      <Circle cx={12} cy={17.3} r={0.5} />
    </>
  ),
} as const;
