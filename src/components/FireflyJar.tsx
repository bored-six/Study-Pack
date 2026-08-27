import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { FireTier } from '@/lib/fire';

/**
 * The streak, drawn as a jar of fireflies.
 *
 * A streak is light you have collected, not heat you have to feed — so
 * each tier adds fireflies rather than making one flame bigger. Every
 * firefly is its own small Animated.View floating over the glass: plain
 * view transforms, because animating SVG element props through
 * Reanimated is unreliable in Expo Go and on web — that was the bug the
 * first version shipped with.
 *
 * At a full year the lid comes off and a few of them climb out.
 */

/** How many fireflies each tier is worth. */
function fliesFor(tier: FireTier): number {
  if (tier.from >= 365) return 9;
  if (tier.from >= 200) return 8;
  if (tier.from >= 100) return 7;
  if (tier.from >= 50) return 6;
  if (tier.from >= 20) return 4;
  if (tier.from >= 10) return 3;
  if (tier.from >= 5) return 2;
  if (tier.from >= 1) return 1;
  return 0;
}

/** The glow inside the glass warms and deepens as the jar fills. */
function jarTint(tier: FireTier): { glass: string; glow: string; core: string } {
  if (tier.from >= 365) return { glass: '#F0B93A', glow: '#F0B93A', core: '#FFF6DC' };
  if (tier.from >= 300) return { glass: '#9A88DA', glow: '#8B6FD0', core: '#FFF6DC' };
  if (tier.from >= 200) return { glass: '#EDF2F7', glow: '#FFFFFF', core: '#FFFFFF' };
  if (tier.from >= 100) return { glass: '#9CC7EA', glow: '#2E6FA3', core: '#FFFFFF' };
  if (tier.from >= 50) return { glass: '#FCE7B4', glow: '#D9832B', core: '#FFF6DC' };
  if (tier.from >= 20) return { glass: '#FDEFCB', glow: '#C24E38', core: '#FFF6DC' };
  if (tier.from >= 10) return { glass: '#FDF3DA', glow: '#D9832B', core: '#FFF6DC' };
  if (tier.from >= 5) return { glass: '#FBF6E8', glow: '#AC761C', core: '#FCEBC0' };
  if (tier.from >= 1) return { glass: '#F7F5EC', glow: '#C9A227', core: '#FCEBC0' };
  return { glass: '#F2F6F4', glow: '#A5AF9E', core: '#EDE6D2' };
}

/**
 * Where each firefly sits inside the glass, in viewBox units. Fixed
 * positions rather than random ones so the jar looks composed, and so a
 * tier always renders identically.
 */
const SEATS: { x: number; y: number }[] = [
  { x: 32, y: 40 },
  { x: 26, y: 34 },
  { x: 38, y: 44 },
  { x: 30, y: 47 },
  { x: 40, y: 34 },
  { x: 24, y: 44 },
  { x: 35, y: 29 },
  { x: 27, y: 51 },
  { x: 41, y: 50 },
];

/** The fly's own canvas, in viewBox units — halo included. */
const FLY_BOX = 18;

/** One firefly: a soft halo, a bright core, wings — on its own View. */
function Firefly({
  seat,
  scale,
  glow,
  core,
  index,
  still,
}: {
  seat: { x: number; y: number };
  scale: number;
  glow: string;
  core: string;
  index: number;
  still: boolean;
}) {
  const drift = useSharedValue(0);
  const sway = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (still) return;
    const delay = index * 340;
    drift.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2000 + index * 180, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
    sway.value = withDelay(
      delay + 400,
      withRepeat(
        withTiming(1, { duration: 1500 + index * 140, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    );
    pulse.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.35, { duration: 850 + index * 110, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
  }, [drift, sway, pulse, index, still]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: sway.value * (index % 2 === 0 ? 3 : -3) * scale },
      { translateY: drift.value * -4 * scale },
    ],
    opacity: 0.55 + pulse.value * 0.45,
  }));

  const box = FLY_BOX * scale;
  const half = FLY_BOX / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: seat.x * scale - box / 2,
          top: seat.y * scale - box / 2,
          width: box,
          height: box,
        },
        style,
      ]}>
      <Svg width={box} height={box} viewBox={`0 0 ${FLY_BOX} ${FLY_BOX}`}>
        <Circle cx={half} cy={half} r={7.6} fill={glow} opacity={0.16} />
        <Circle cx={half} cy={half} r={4.6} fill={glow} opacity={0.3} />
        <Path
          d={`M${half - 1.8} ${half - 1.4}c-2-1.6-3.6-1.2-4.2.4 1.2 1.2 2.8 1.3 4.2.2z`}
          fill={core}
          opacity={0.6}
        />
        <Path
          d={`M${half + 1.8} ${half - 1.4}c2-1.6 3.6-1.2 4.2.4-1.2 1.2-2.8 1.3-4.2.2z`}
          fill={core}
          opacity={0.6}
        />
        <Circle cx={half} cy={half} r={2.3} fill={core} stroke={glow} strokeWidth={1.3} />
        <Circle cx={half - 0.6} cy={half - 0.7} r={0.7} fill="#FFFFFF" opacity={0.9} />
      </Svg>
    </Animated.View>
  );
}

/** One firefly that has escaped the jar and is climbing away. */
function Escapee({
  x,
  scale,
  glow,
  core,
  delay,
}: {
  x: number;
  scale: number;
  glow: string;
  core: string;
  delay: number;
}) {
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 3200, easing: Easing.out(Easing.quad) }), -1, false)
    );
  }, [rise, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -rise.value * 15 * scale },
      { translateX: rise.value * 3 * scale },
    ],
    opacity: rise.value < 0.15 ? rise.value / 0.15 : 1 - (rise.value - 0.15) / 0.85,
  }));

  const box = 12 * scale;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: x * scale - box / 2, top: 14 * scale, width: box, height: box },
        style,
      ]}>
      <Svg width={box} height={box} viewBox="0 0 12 12">
        <Circle cx={6} cy={6} r={5} fill={glow} opacity={0.22} />
        <Circle cx={6} cy={6} r={2.2} fill={core} stroke={glow} strokeWidth={1.2} />
      </Svg>
    </Animated.View>
  );
}

interface Props {
  tier: FireTier;
  /** Rendered size in px, square. */
  size?: number;
  /** False draws a dark, still jar — an unlit streak shouldn't glimmer. */
  lit?: boolean;
}

export function FireflyJar({ tier, size = 72, lit = true }: Props) {
  const reduced = useReducedMotion();
  const still = !lit || !!reduced;

  const count = lit ? fliesFor(tier) : 0;
  const tint = jarTint(tier);
  const isYear = tier.from >= 365;
  const scale = size / 64;

  const seats = SEATS.slice(0, count);

  // Brightness of the whole jar scales with how full it is.
  const fill = count / SEATS.length;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* the jar itself — everything the flies float in front of */}
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <RadialGradient id="jarGlow" cx="50%" cy="58%" r="50%">
            <Stop offset="0%" stopColor={tint.glow} stopOpacity={0.55 * fill + 0.05} />
            <Stop offset="100%" stopColor={tint.glow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glassFill" cx="50%" cy="62%" r="62%">
            <Stop offset="0%" stopColor={tint.glass} stopOpacity={0.95} />
            <Stop offset="100%" stopColor={tint.glass} stopOpacity={0.5} />
          </RadialGradient>
        </Defs>

        <Circle cx={32} cy={38} r={30} fill="url(#jarGlow)" />

        <Path
          d="M22 15h20c2 4 4 7 4 14v18c0 5-3 8-8 8H26c-5 0-8-3-8-8V29c0-7 2-10 4-14z"
          fill="url(#glassFill)"
          stroke="#27362B"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />

        {fill > 0.5 ? (
          <Ellipse cx={32} cy={52} rx={12} ry={3.2} fill={tint.glow} opacity={0.22} />
        ) : null}
      </Svg>

      {seats.map((seat, i) => (
        <Firefly
          key={i}
          seat={seat}
          scale={scale}
          glow={tint.glow}
          core={tint.core}
          index={i}
          still={still}
        />
      ))}

      {/* glass highlight and lid, over the flies so the glass reads as a surface */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path
            d="M24 24c-1 3-1.6 5-1.6 9v14"
            stroke="#FFFFFF"
            strokeWidth={2.4}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
          <Path
            d="M41.5 26c.8 2.4 1.2 4 1.2 7"
            stroke="#FFFFFF"
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
            opacity={0.5}
          />
          <G transform={isYear ? 'rotate(-24 26 13)' : undefined}>
            <Rect
              x={24}
              y={isYear ? 7 : 10}
              width={16}
              height={5}
              rx={2}
              fill="#EFE5CB"
              stroke="#27362B"
              strokeWidth={2.2}
            />
          </G>
        </Svg>
      </View>

      {isYear && !still ? (
        <>
          <Escapee x={30} scale={scale} glow={tint.glow} core={tint.core} delay={0} />
          <Escapee x={40} scale={scale} glow={tint.glow} core={tint.core} delay={1100} />
          <Escapee x={22} scale={scale} glow={tint.glow} core={tint.core} delay={2200} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
