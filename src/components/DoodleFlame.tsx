import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
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
 * The outline is *computed every frame*, not picked from a set of
 * drawings. Six control points around the silhouette each drift on their
 * own stack of sine harmonics, so the tip leans and curls while the
 * flanks swell and pinch — continuously, at the display's full refresh
 * rate, never landing on the same shape twice within a cycle.
 *
 * Earlier passes at this cycled between a handful of fixed drawings.
 * Cross-fading hid the seams but the silhouette still only changed a few
 * times a second, which is what made it look stepped rather than fluid.
 * Generating the path instead removes the frame rate ceiling entirely.
 *
 * Every wobble is an integer harmonic of one clock that loops over 2π,
 * so the loop closes seamlessly with no jump at the wrap.
 */

const TAU = Math.PI * 2;

/** How long one full swirl takes. Slower reads calmer, not choppier. */
const SWIRL_MS = 5200;

/**
 * The flame silhouette at a moment in the cycle.
 *
 * Built as two Bézier flanks meeting at a wandering tip, closed with a
 * rounded base. `spread` fattens or narrows the whole shape; `amp`
 * scales how far the outline is allowed to travel, so small tiers stay
 * readable instead of thrashing.
 */
export function flameOutline(t: number, spread: number, amp: number): string {
  'worklet';
  const cx = 32;
  const baseY = 50;

  // A flame is a bulb that pinches into a leaning tip — not a teardrop.
  // Three widths do the work: the foot, the widest point low down, and
  // the waist where it necks in before the tip.
  const foot = 8.4 * spread;
  const bulgeL = (11.4 + Math.sin(t * 2 + 0.7) * 1.1 * amp) * spread;
  const bulgeR = (11.4 + Math.sin(t * 2 + 2.9) * 1.1 * amp) * spread;
  const bulgeY = 41.5 + Math.sin(t + 1.4) * 1.4 * amp;

  const waistL = (5.6 + Math.sin(t * 3 + 2.1) * 1.5 * amp) * spread;
  const waistR = (5.6 + Math.sin(t * 3 + 0.5) * 1.5 * amp) * spread;
  const waistY = 32.5 + Math.sin(t * 2 + 1.1) * 1.8 * amp;

  // The tip wanders and curls — the part the eye actually reads as fire.
  const tipX = cx + Math.sin(t) * 3.4 * amp + Math.sin(t * 3 + 1.1) * 1.5 * amp;
  const tipY = 21 - Math.sin(t * 2 + 0.5) * 2.2 * amp;
  const curl = Math.sin(t * 2 + 2.4) * 2.6 * amp;

  return (
    `M${cx - foot} ${baseY}` +
    `C${cx - bulgeL} ${bulgeY + 4} ${cx - bulgeL} ${bulgeY - 3} ${cx - waistL} ${waistY}` +
    `C${cx - waistL + curl * 0.4} ${waistY - 5} ${tipX - 3.2} ${tipY + 6} ${tipX} ${tipY}` +
    `C${tipX + 3.4} ${tipY + 6} ${cx + waistR - curl * 0.4} ${waistY - 5} ${cx + waistR} ${waistY}` +
    `C${cx + bulgeR} ${bulgeY - 3} ${cx + bulgeR} ${bulgeY + 4} ${cx + foot} ${baseY}` +
    `Q${cx} ${baseY + 3.2} ${cx - foot} ${baseY}Z`
  );
}

/** The hotter shape inside it — same maths, tighter and quicker. */
export function coreOutline(t: number, amp: number): string {
  'worklet';
  const cx = 32;
  const baseY = 47.5;
  const foot = 4.4;

  const bulgeL = 6.4 + Math.sin(t * 2 + 1.3) * 0.8 * amp;
  const bulgeR = 6.4 + Math.sin(t * 2 + 3.1) * 0.8 * amp;
  const bulgeY = 42 + Math.sin(t + 0.9) * 0.9 * amp;

  const waistL = 2.8 + Math.sin(t * 3 + 0.4) * 0.8 * amp;
  const waistR = 2.8 + Math.sin(t * 3 + 2.6) * 0.8 * amp;
  const waistY = 37 + Math.sin(t * 2 + 2.2) * 1 * amp;

  const tipX = cx + Math.sin(t + 0.6) * 2.2 * amp;
  const tipY = 30 - Math.sin(t * 2 + 1.7) * 1.6 * amp;

  return (
    `M${cx - foot} ${baseY}` +
    `C${cx - bulgeL} ${bulgeY + 2.5} ${cx - bulgeL} ${bulgeY - 1.5} ${cx - waistL} ${waistY}` +
    `C${cx - waistL} ${waistY - 2.5} ${tipX - 1.8} ${tipY + 3} ${tipX} ${tipY}` +
    `C${tipX + 1.9} ${tipY + 3} ${cx + waistR} ${waistY - 2.5} ${cx + waistR} ${waistY}` +
    `C${cx + bulgeR} ${bulgeY - 1.5} ${cx + bulgeR} ${bulgeY + 2.5} ${cx + foot} ${baseY}` +
    `Q${cx} ${baseY + 2} ${cx - foot} ${baseY}Z`
  );
}

/** A doodled crown, for the tiers that have earned one. */
const CROWN = 'M24.5 22.5l3.2 3.6 4.3-4.7 4.3 4.7 3.2-3.6v4.5H24.5z';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Skin {
  /** Size of the whole doodle relative to the box. */
  scale: number;
  /** How freely the outline is allowed to travel. */
  amp: number;
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
        amp: 1.15,
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
        amp: 1.1,
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
        amp: 1.05,
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
        amp: 1,
        bodyFill: '#7FB5E3',
        bodyStroke: '#2E6FA3',
        bodyWidth: 2.3,
        coreFill: '#FFFFFF',
        sparks: ['#7FB5E3'],
      };
    case tier.from >= 50:
      return {
        scale: 1,
        amp: 1,
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
        amp: 0.9,
        bodyFill: '#FFC66B',
        bodyStroke: '#27362B',
        bodyWidth: 2.3,
        coreFill: '#F6E7A2',
        underline: '#C24E38',
      };
    case tier.from >= 10:
      return {
        scale: 0.88,
        amp: 0.8,
        bodyFill: '#F6E7A2',
        bodyStroke: '#27362B',
        bodyWidth: 2.2,
        coreFill: null,
      };
    case tier.from >= 5:
      return {
        scale: 0.82,
        amp: 0.7,
        bodyFill: null,
        bodyStroke: '#27362B',
        bodyWidth: 2.2,
        coreFill: null,
      };
    case tier.from >= 1:
      return {
        scale: 0.72,
        amp: 0.6,
        bodyFill: null,
        bodyStroke: '#5D6F5C',
        bodyWidth: 2,
        coreFill: null,
      };
    default:
      return {
        scale: 0.78,
        amp: 0,
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

  // One clock, running 0 to 2π forever. Every wobble is an integer
  // harmonic of it, so the loop closes without a seam.
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(TAU, { duration: SWIRL_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [t, still]);

  // A slow lean on top, so the flame is not perfectly centred forever.
  const sway = useBreath(3100, 0, still);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * 2 * (size / 64) },
      { rotate: `${(sway.value - 0.5) * 1.8}deg` },
    ],
  }));

  const bodyProps = useAnimatedProps(() => ({
    d: flameOutline(t.value, 1, skin.amp),
  }));

  const coreProps = useAnimatedProps(() => ({
    d: coreOutline(t.value * 1.6 + 2, skin.amp),
  }));

  const transform = `translate(32 34) scale(${skin.scale}) translate(-32 -34)`;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
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
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {still ? (
            <Path
              d={flameOutline(0, 1, skin.amp)}
              transform={transform}
              fill={skin.bodyFill ?? 'none'}
              stroke={skin.bodyStroke}
              strokeWidth={skin.bodyWidth}
              strokeLinejoin="round"
              strokeDasharray={skin.dashed ? '5 4' : undefined}
              opacity={skin.dashed ? 0.8 : 1}
            />
          ) : (
            <AnimatedPath
              animatedProps={bodyProps}
              transform={transform}
              fill={skin.bodyFill ?? 'none'}
              stroke={skin.bodyStroke}
              strokeWidth={skin.bodyWidth}
              strokeLinejoin="round"
            />
          )}

          {skin.coreFill && !still ? (
            <AnimatedPath animatedProps={coreProps} transform={transform} fill={skin.coreFill} />
          ) : null}
        </Svg>
      </Animated.View>

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
});
