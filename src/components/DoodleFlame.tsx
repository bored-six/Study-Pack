import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { FireTier } from '@/lib/fire';

/**
 * The streak, drawn as a flame doodled in the margin of the page.
 *
 * It is the same sketch all the way up, redrawn better as the streak
 * grows: a pencil ghost, then ink, then crayon filled outside the lines,
 * two-tone, gel pen, silver, a doodled crown, and finally gold with pen
 * rays. Nothing glows — the tier reads from the linework, which is what
 * keeps it legible at 19px in the home-screen chip.
 *
 * ## How the motion works
 *
 * Squashing one rigid shape only ever looks like breathing. Fire looks
 * fluid because its *outline* changes, so the flame is drawn as six
 * hand-made silhouettes that cross-fade in a loop: at any moment two are
 * on screen at once, and the tongue appears to rise, lean and pinch off
 * as one dissolves into the next. That is cel animation — the flipbook
 * this app is named after — with the cuts smoothed away.
 *
 * Three slower loops ride on top so the morph never feels mechanical:
 *
 *   - the body stretches from its base on a ~2.3s loop,
 *   - the core swims on a ~1.5s loop, leaning the other way,
 *   - the whole doodle sways on a ~3.1s loop.
 *
 * The morph cycle and those three share no small common multiple, so the
 * composite takes minutes to repeat. Their amplitudes are deliberately
 * small: once the silhouette does the work, big transforms read as
 * wobble rather than fire.
 *
 * Everything animates through plain View opacity and transforms. Driving
 * react-native-svg element props from Reanimated silently fails to
 * repaint in Expo Go and on web, so no SVG prop — `d` least of all — is
 * ever animated here.
 */

/**
 * Six drawings of the same flame, a beat apart. Read in order the tip
 * leans left, straightens and rises, tilts right, pinches in, flares
 * wide, then falls back — a full breath of fire.
 */
const BODY_FRAMES = [
  'M31.5 49c4-9-5.2-12 1.5-20.8 2.6 6 10 7.7 10 15A8.9 8.9 0 0 1 25.2 49c-.6-1-.9-2.2-.9-3.4 0-2.8 1.2-5 2.6-6.8',
  'M31.5 49c4.2-9.4-5.7-12.4 1.1-21.4 2.6 6.1 10.2 7.9 10.2 15.3A8.9 8.9 0 0 1 25 49c-.6-1-.9-2.2-.9-3.4 0-2.7 1.1-4.9 2.5-6.7',
  'M31.6 49c4.4-9.8-5.1-12.9 1.7-22 2.7 6.3 10.1 8.1 10.1 15.6A8.9 8.9 0 0 1 25.3 49c-.6-1-.9-2.2-.9-3.4 0-3 1.3-5.3 2.9-7.2',
  'M31.4 49c3.7-8.5-4.7-11.5 2.2-20 2.9 5.8 10.4 7.4 10.4 14.7A8.9 8.9 0 0 1 25.5 49c-.6-1-.9-2.2-.9-3.4 0-2.5 1-4.6 2.2-6.3',
  'M31.5 49.2c3.5-8.2-4.5-11.2 1.3-19.4 2.4 5.6 9.5 7.2 9.5 14.2A8.6 8.6 0 0 1 25.7 49c-.5-.9-.8-2-.8-3.2 0-2.4.9-4.4 2.1-6',
  'M31.5 49c4.5-9.8-6.1-13.2 1-22.4 2.5 6.4 10.4 8.2 10.4 15.8A9.1 9.1 0 0 1 24.8 49c-.6-1-.9-2.3-.9-3.5 0-3.1 1.4-5.5 3-7.4',
];

/** The hotter shape inside it, on a shorter cycle of its own. */
const CORE_FRAMES = [
  'M31.5 48c2-4.6-2.5-6.4.7-11 1.4 3.3 5.2 4.3 5.2 8.2a4.4 4.4 0 0 1-5.9 4.2',
  'M31.5 48c1.8-4.2-2.2-6 1-10.4 1.3 3.1 4.9 4.1 4.9 7.8a4.3 4.3 0 0 1-5.8 4',
  'M31.4 48.2c2.2-5-2.8-6.9.6-11.6 1.5 3.5 5.4 4.5 5.4 8.5a4.5 4.5 0 0 1-6 4.3',
  'M31.6 48c1.9-4.4-2.3-6.2 1.2-10.8 1.35 3.2 5 4.2 5 8a4.35 4.35 0 0 1-5.9 4.1',
];

/** A doodled crown, for the tiers that have earned one. */
const CROWN = 'M24.5 22.5l3.2 3.6 4.3-4.7 4.3 4.7 3.2-3.6v4.5H24.5z';

/** One full pass through the body drawings. */
const BODY_CYCLE = 2400;
/** The core flickers faster, and out of step. */
const CORE_CYCLE = 1650;

interface Skin {
  /** Size of the whole doodle relative to the box. */
  scale: number;
  bodyFill: string | null;
  bodyStroke: string;
  bodyWidth: number;
  dashed?: boolean;
  coreFill: string | null;
  crown?: { fill: string; stroke: string };
  rays?: string;
  underline?: string;
  flicks?: string;
  sparks?: string[];
}

function skinFor(tier: FireTier): Skin {
  switch (true) {
    case tier.from >= 365:
      return {
        scale: 1.06,
        bodyFill: '#F0B93A',
        bodyStroke: '#8A6508',
        bodyWidth: 2.4,
        coreFill: '#FFF6DC',
        crown: { fill: '#FFF6DC', stroke: '#8A6508' },
        rays: '#C24E38',
        sparks: ['#E4C94B', '#F0B93A', '#C24E38'],
      };
    case tier.from >= 300:
      return {
        scale: 1.03,
        bodyFill: '#9A88DA',
        bodyStroke: '#5B4AA0',
        bodyWidth: 2.3,
        coreFill: '#EAE2FA',
        crown: { fill: '#E4C94B', stroke: '#5B4AA0' },
        sparks: ['#DCD5F2', '#B9A9E8'],
      };
    case tier.from >= 200:
      return {
        scale: 1.02,
        bodyFill: '#FFFFFF',
        bodyStroke: '#7E8CA0',
        bodyWidth: 2.3,
        coreFill: '#EDF2F7',
        flicks: '#B9C3CE',
        sparks: ['#B9C3CE', '#7E8CA0'],
      };
    case tier.from >= 100:
      return {
        scale: 1,
        bodyFill: '#7FB5E3',
        bodyStroke: '#2E6FA3',
        bodyWidth: 2.3,
        coreFill: '#FFFFFF',
        sparks: ['#7FB5E3'],
      };
    case tier.from >= 50:
      return {
        scale: 1,
        bodyFill: '#FF9E52',
        bodyStroke: '#27362B',
        bodyWidth: 2.3,
        coreFill: '#F6E7A2',
        flicks: '#C24E38',
        sparks: ['#E4C94B', '#FF9E52'],
      };
    case tier.from >= 20:
      return {
        scale: 0.95,
        bodyFill: '#FFC66B',
        bodyStroke: '#27362B',
        bodyWidth: 2.3,
        coreFill: '#F6E7A2',
        underline: '#C24E38',
      };
    case tier.from >= 10:
      return {
        scale: 0.88,
        bodyFill: '#F6E7A2',
        bodyStroke: '#27362B',
        bodyWidth: 2.2,
        coreFill: null,
      };
    case tier.from >= 5:
      return {
        scale: 0.82,
        bodyFill: null,
        bodyStroke: '#27362B',
        bodyWidth: 2.2,
        coreFill: null,
      };
    case tier.from >= 1:
      return {
        scale: 0.72,
        bodyFill: null,
        bodyStroke: '#5D6F5C',
        bodyWidth: 2,
        coreFill: null,
      };
    default:
      return {
        scale: 0.78,
        bodyFill: null,
        bodyStroke: '#A5AF9E',
        bodyWidth: 1.8,
        dashed: true,
        coreFill: null,
      };
  }
}

/** A smooth, endless ping-pong between 0 and 1. */
function useBreath(duration: number, delay: number, still: boolean) {
  const value = useSharedValue(0);
  useEffect(() => {
    if (still) {
      value.value = 0;
      return;
    }
    value.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
  }, [value, duration, delay, still]);
  return value;
}

/** A clock that runs 0 to 1 forever, for cycling through drawings. */
function useCycle(duration: number, still: boolean) {
  const value = useSharedValue(0);
  useEffect(() => {
    if (still) {
      value.value = 0;
      return;
    }
    value.value = withRepeat(
      withTiming(1, { duration, easing: Easing.linear }),
      -1,
      false
    );
  }, [value, duration, still]);
  return value;
}

/**
 * One drawing in the cycle. Its opacity peaks as the clock passes its
 * slot and falls off before the next, so exactly two frames overlap and
 * the silhouette dissolves rather than cuts.
 */
function MorphFrame({
  d,
  index,
  total,
  clock,
  scale,
  size,
  fill,
  stroke,
  strokeWidth,
  dashed,
}: {
  d: string;
  index: number;
  total: number;
  clock: SharedValue<number>;
  scale: number;
  size: number;
  fill: string | null;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // Where this drawing sits in its own pass, 0 to 1.
    const raw = clock.value - index / total;
    const phase = raw - Math.floor(raw);

    // A trapezoid, not a triangle. Each drawing reaches full opacity
    // well before the one under it starts leaving and holds there
    // through the whole handover, so some frame is always solid. A
    // plain cross-fade would leave two half-transparent copies at the
    // swap and the flame would visibly dim on every beat.
    let opacity: number;
    if (phase < 0.05) opacity = phase / 0.05;
    else if (phase < 0.22) opacity = 1;
    else if (phase < 0.33) opacity = (0.33 - phase) / 0.11;
    else opacity = 0;

    return { opacity };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Path
          d={d}
          transform={`translate(32 34) scale(${scale}) translate(-32 -34)`}
          fill={fill ?? 'none'}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? '5 4' : undefined}
          opacity={dashed ? 0.8 : 1}
        />
      </Svg>
    </Animated.View>
  );
}

/** One ember drifting up off the flame and fading out. */
function Spark({
  color,
  x,
  size,
  delay,
}: {
  color: string;
  x: number;
  size: number;
  delay: number;
}) {
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }), -1, false)
    );
  }, [rise, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -rise.value * 15 * (size / 64) },
      { translateX: Math.sin(rise.value * Math.PI * 1.4) * 3 * (size / 64) },
      { scale: 1 - rise.value * 0.35 },
    ],
    opacity: rise.value < 0.2 ? rise.value / 0.2 : 1 - (rise.value - 0.2) / 0.8,
  }));

  const dot = Math.max(3, size * 0.055);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (x / 64) * size - dot / 2,
          top: size * 0.42,
          width: dot,
          height: dot,
        },
        style,
      ]}>
      <Svg width={dot} height={dot} viewBox="0 0 8 8">
        <Circle cx={4} cy={4} r={3.4} fill={color} />
      </Svg>
    </Animated.View>
  );
}

interface Props {
  tier: FireTier;
  /** Rendered size in px, square. */
  size?: number;
  /** False draws the unlit pencil ghost, perfectly still. */
  lit?: boolean;
}

export function DoodleFlame({ tier, size = 72, lit = true }: Props) {
  const reduced = useReducedMotion();
  const still = !lit || !!reduced;

  const skin = lit ? skinFor(tier) : skinFor({ ...tier, from: -1 } as FireTier);

  // The silhouette does the work; the transforms only keep it honest.
  const bodyClock = useCycle(BODY_CYCLE, still);
  const coreClock = useCycle(CORE_CYCLE, still);
  const body = useBreath(2300, 0, still);
  const core = useBreath(1500, 120, still);
  const sway = useBreath(3100, 0, still);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * 2 * (size / 64) },
      { rotate: `${(sway.value - 0.5) * 1.8}deg` },
    ],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: 1 + body.value * 0.05 },
      { scaleX: 1 - body.value * 0.025 },
      { rotate: `${(body.value - 0.5) * 1.6}deg` },
    ],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: 1 + core.value * 0.09 },
      { scaleX: 1 - core.value * 0.04 },
      { rotate: `${(0.5 - core.value) * 3}deg` },
      { translateY: -core.value * 0.9 * (size / 64) },
    ],
    opacity: 0.88 + core.value * 0.12,
  }));

  const layer = [StyleSheet.absoluteFill, styles.fromBase];

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* still furniture — rays do not breathe with the flame */}
      {skin.rays ? (
        <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
          <Path
            d="M32 10v5M14 18l3.4 3.4M50 18l-3.4 3.4M8 34h5M51 34h5M15 50l3.2-3.2M49 50l-3.2-3.2"
            stroke={skin.rays}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.85}
          />
        </Svg>
      ) : null}

      <Animated.View style={[StyleSheet.absoluteFill, swayStyle]}>
        {/* the doodled body, dissolving between six drawings */}
        <Animated.View style={[layer, bodyStyle]}>
          {BODY_FRAMES.map((d, i) => (
            <MorphFrame
              key={i}
              d={d}
              index={i}
              total={BODY_FRAMES.length}
              clock={bodyClock}
              scale={skin.scale}
              size={size}
              fill={skin.bodyFill}
              stroke={skin.bodyStroke}
              strokeWidth={skin.bodyWidth}
              dashed={skin.dashed}
            />
          ))}
        </Animated.View>

        {/* the hotter core, on its own shorter cycle */}
        {skin.coreFill ? (
          <Animated.View style={[layer, coreStyle]}>
            {CORE_FRAMES.map((d, i) => (
              <MorphFrame
                key={i}
                d={d}
                index={i}
                total={CORE_FRAMES.length}
                clock={coreClock}
                scale={skin.scale}
                size={size}
                fill={skin.coreFill}
              />
            ))}
          </Animated.View>
        ) : null}
      </Animated.View>

      {/* crown, underline and side flicks sit outside the sway */}
      <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
        {skin.crown ? (
          <Path
            d={CROWN}
            fill={skin.crown.fill}
            stroke={skin.crown.stroke}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        ) : null}
        {skin.underline ? (
          <Path
            d="M24 53c4.5 1.6 11.5 1.6 16 0"
            stroke={skin.underline}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {skin.flicks ? (
          <Path
            d="M22 41c-2-.5-3.2-1.6-3.6-2.8M42 41c2-.5 3.2-1.6 3.6-2.8"
            stroke={skin.flicks}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </Svg>

      {!still && skin.sparks
        ? skin.sparks.map((color, i) => (
            <Spark key={i} color={color} x={[22, 43, 33][i % 3]} size={size} delay={i * 850} />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fire grows from where it is rooted, so every layer scales off its base.
  fromBase: {
    transformOrigin: '50% 82%',
  },
});
