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
} from 'react-native-reanimated';

import type { FireTier } from '@/lib/fire';

/**
 * The streak, drawn as a flame doodled in the margin of the page.
 *
 * It is the same sketch all the way up, redrawn better as the streak
 * grows: a pencil ghost, then ink, then crayon filled outside the lines,
 * two-tone, gel pen, silver, a doodled crown, and finally gold with pen
 * rays. Nothing here glows — the tier reads from the linework, which is
 * what keeps it legible at 19px in the home-screen chip.
 *
 * ## How the motion works
 *
 * Fire is fluid because its parts move at different rates, so the whole
 * thing is built as stacked layers on separate Animated.Views, each
 * breathing on its own loop:
 *
 *   - the body stretches from its base (transformOrigin bottom) on a
 *     ~1.9s loop,
 *   - the core does the same on a ~1.25s loop and leans the other way,
 *     so it visibly swims inside the outline rather than riding along,
 *   - the whole doodle sways on a ~2.7s loop.
 *
 * Those periods share no small common multiple, so the composite never
 * visibly repeats — that is the difference between "flowing" and
 * "looping". Every loop is `Easing.inOut(Easing.sin)` reversed, which
 * has no start or stop.
 *
 * Everything animates through plain View transforms. Driving
 * react-native-svg element props from Reanimated silently fails to
 * repaint in Expo Go and on web, which is what froze the firefly jar
 * this replaced — so no SVG prop is ever animated here.
 */

/** The doodled flame outline. Open path: SVG closes it for the fill. */
const BODY =
  'M31.5 49c4-9-5.2-12 1.5-20.8 2.6 6 10 7.7 10 15A8.9 8.9 0 0 1 25.2 49c-.6-1-.9-2.2-.9-3.4 0-2.8 1.2-5 2.6-6.8';

/** The hotter shape inside it. */
const CORE = 'M31.5 48c2-4.6-2.5-6.4.7-11 1.4 3.3 5.2 4.3 5.2 8.2a4.4 4.4 0 0 1-5.9 4.2';

/** A doodled crown, for the tiers that have earned one. */
const CROWN = 'M24.5 22.5l3.2 3.6 4.3-4.7 4.3 4.7 3.2-3.6v4.5H24.5z';

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
function useBreath(duration: number, delay = 0, still = false) {
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

  // Three loops, deliberately incommensurate so the flame never
  // visibly repeats itself.
  const body = useBreath(1900, 0, still);
  const core = useBreath(1250, 120, still);
  const sway = useBreath(2700, 0, still);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * 2.6 * (size / 64) },
      { rotate: `${(sway.value - 0.5) * 2.4}deg` },
    ],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: 1 + body.value * 0.11 },
      { scaleX: 1 - body.value * 0.05 },
      { rotate: `${(body.value - 0.5) * 3}deg` },
    ],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: 1 + core.value * 0.17 },
      { scaleX: 1 - core.value * 0.08 },
      { rotate: `${(0.5 - core.value) * 5}deg` },
      { translateY: -core.value * 1.2 * (size / 64) },
    ],
    opacity: 0.85 + core.value * 0.15,
  }));

  const layer = [StyleSheet.absoluteFill, styles.fromBase];

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* still furniture — rays and crown do not breathe with the flame */}
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
        {/* the doodled body */}
        <Animated.View style={[layer, bodyStyle]}>
          <Svg width={size} height={size} viewBox="0 0 64 64">
            <Path
              d={BODY}
              transform={`translate(32 34) scale(${skin.scale}) translate(-32 -34)`}
              fill={skin.bodyFill ?? 'none'}
              stroke={skin.bodyStroke}
              strokeWidth={skin.bodyWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={skin.dashed ? '5 4' : undefined}
              opacity={skin.dashed ? 0.8 : 1}
            />
          </Svg>
        </Animated.View>

        {/* the hotter core, swimming on its own rhythm */}
        {skin.coreFill ? (
          <Animated.View style={[layer, coreStyle]}>
            <Svg width={size} height={size} viewBox="0 0 64 64">
              <Path
                d={CORE}
                transform={`translate(32 34) scale(${skin.scale}) translate(-32 -34)`}
                fill={skin.coreFill}
              />
            </Svg>
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
            <Spark
              key={i}
              color={color}
              x={[22, 43, 33][i % 3]}
              size={size}
              delay={i * 850}
            />
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
