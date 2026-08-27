import { useEffect, useMemo } from 'react';
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
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { FireTier } from '@/lib/fire';

/**
 * The streak, drawn as a jar of fireflies.
 *
 * A streak is light you have collected, not heat you have to feed — so
 * each tier adds fireflies rather than making one flame bigger. Every
 * firefly carries its own soft halo and drifts on its own loop, so the
 * jar never looks like a static diagram: at a glance it reads as
 * something alive that you are keeping.
 *
 * At a full year the lid comes off and a few of them climb out.
 */

/** How many fireflies each tier is worth. Index matches FIRE_TIERS order. */
function fliesFor(tier: FireTier): number {
  if (tier.from >= 365) return 9;
  if (tier.from >= 300) return 8;
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

const AnimatedG = Animated.createAnimatedComponent(G);

/** One firefly: a soft halo, a bright core, and a pair of little wings. */
function Firefly({
  x,
  y,
  glow,
  core,
  index,
  still,
}: {
  x: number;
  y: number;
  glow: string;
  core: string;
  index: number;
  still: boolean;
}) {
  const drift = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (still) return;
    const delay = index * 380;
    drift.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2100 + index * 170, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2100 + index * 170, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
    pulse.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.35, { duration: 900 + index * 120, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 900 + index * 120, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [drift, pulse, index, still]);

  const animatedProps = useAnimatedProps(() => {
    const dx = drift.value * (index % 2 === 0 ? 2.6 : -2.6);
    const dy = drift.value * -3.2;
    return {
      transform: `translate(${dx}, ${dy})`,
      opacity: 0.55 + pulse.value * 0.45,
    };
  });

  return (
    <AnimatedG animatedProps={animatedProps}>
      {/* halo, biggest and faintest first */}
      <Circle cx={x} cy={y} r={6.4} fill={glow} opacity={0.16} />
      <Circle cx={x} cy={y} r={4.2} fill={glow} opacity={0.3} />
      {/* wings */}
      <Path
        d={`M${x - 1.8} ${y - 1.4}c-2-1.6-3.6-1.2-4.2.4 1.2 1.2 2.8 1.3 4.2.2z`}
        fill={core}
        opacity={0.55}
      />
      <Path
        d={`M${x + 1.8} ${y - 1.4}c2-1.6 3.6-1.2 4.2.4-1.2 1.2-2.8 1.3-4.2.2z`}
        fill={core}
        opacity={0.55}
      />
      {/* body */}
      <Circle cx={x} cy={y} r={2.3} fill={core} stroke={glow} strokeWidth={1.3} />
      <Circle cx={x - 0.6} cy={y - 0.7} r={0.7} fill="#FFFFFF" opacity={0.9} />
    </AnimatedG>
  );
}

/** One firefly that has escaped the jar and is climbing away. */
function Escapee({
  x,
  glow,
  core,
  delay,
  still,
}: {
  x: number;
  glow: string;
  core: string;
  delay: number;
  still: boolean;
}) {
  const rise = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    rise.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 3400, easing: Easing.out(Easing.quad) }), -1, false)
    );
  }, [rise, delay, still]);

  const animatedProps = useAnimatedProps(() => ({
    transform: `translate(${rise.value * 2.4}, ${-rise.value * 13})`,
    opacity: rise.value < 0.15 ? rise.value / 0.15 : 1 - (rise.value - 0.15) / 0.85,
  }));

  if (still) return null;

  return (
    <AnimatedG animatedProps={animatedProps}>
      <Circle cx={x} cy={17} r={4.4} fill={glow} opacity={0.22} />
      <Circle cx={x} cy={17} r={2.1} fill={core} stroke={glow} strokeWidth={1.2} />
    </AnimatedG>
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

  const seats = useMemo(() => SEATS.slice(0, count), [count]);

  // Brightness of the whole jar scales with how full it is.
  const fill = count / SEATS.length;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
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

        {/* the light the jar throws into the room */}
        <Circle cx={32} cy={38} r={30} fill="url(#jarGlow)" />

        {/* lid — tipped off once they start getting out */}
        <G
          transform={isYear ? 'rotate(-24 26 13)' : undefined}
          opacity={1}>
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

        {/* glass */}
        <Path
          d="M22 15h20c2 4 4 7 4 14v18c0 5-3 8-8 8H26c-5 0-8-3-8-8V29c0-7 2-10 4-14z"
          fill="url(#glassFill)"
          stroke="#27362B"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />

        {/* fireflies live between the glass and its highlight */}
        {seats.map((seat, i) => (
          <Firefly
            key={i}
            x={seat.x}
            y={seat.y}
            glow={tint.glow}
            core={tint.core}
            index={i}
            still={still}
          />
        ))}

        {/* a pool of settled light at the bottom once the jar is full */}
        {fill > 0.5 ? (
          <Ellipse cx={32} cy={52} rx={12} ry={3.2} fill={tint.glow} opacity={0.22} />
        ) : null}

        {/* glass highlight, over everything so it reads as a surface */}
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

        {isYear ? (
          <>
            <Escapee x={30} glow={tint.glow} core={tint.core} delay={0} still={still} />
            <Escapee x={40} glow={tint.glow} core={tint.core} delay={1100} still={still} />
            <Escapee x={22} glow={tint.glow} core={tint.core} delay={2200} still={still} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
