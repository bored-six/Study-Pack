import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { FireTier } from '@/lib/fire';

/**
 * The streak, drawn as fire in the margin of the page.
 *
 * ## The form evolves, not just the colour
 *
 * A spark is not a small flame — it is a star. An ember is not a flame
 * at all — it is a coal. Fire only appears at ten days, sitting on that
 * coal, and from there it keeps gaining parts: a heart, side tongues, a
 * taller and narrower column, orbiting flamelets, a crown, rays.
 *
 * Each tier is therefore a *recipe of parts* rather than one silhouette
 * in a different ink. Put the ten side by side as solid black and they
 * stay tellable apart, which is the test the earlier version failed.
 *
 * ## The motion
 *
 * Every part's outline is computed on each frame from sine harmonics —
 * no drawings, no frame count, so the ceiling is the display refresh
 * rate. All the wobbles are integer harmonics of one clock that loops
 * over 2*pi, so the loop closes with no jump at the wrap, and each part
 * carries a phase offset so the pieces never move in lockstep.
 */

const TAU = Math.PI * 2;

/** How long one full swirl takes. */
const SWIRL_MS = 5200;

interface FlameSpec {
  cx?: number;
  baseY?: number;
  /** Half-width where it meets the ground. */
  foot: number;
  /** Half-width at the widest point, low down. */
  bulge: number;
  /** Half-width where it necks in before the tip. */
  waist: number;
  /** How high the tip reaches. Lower number, taller flame. */
  tipY: number;
}

/**
 * A flame: a bulb that pinches into a leaning tip. Proportions come from
 * the spec, so the same generator draws a squat kindling wisp and a tall
 * blue column.
 */
export function flameShape(t: number, o: FlameSpec, amp: number): string {
  'worklet';
  const cx = o.cx ?? 32;
  const baseY = o.baseY ?? 50;
  const span = baseY - o.tipY;

  const bulgeY = baseY - span * 0.3 + Math.sin(t + 1.4) * 1.3 * amp;
  const waistY = baseY - span * 0.58 + Math.sin(t * 2 + 1.1) * 1.6 * amp;

  const bulgeL = o.bulge + Math.sin(t * 2 + 0.7) * o.bulge * 0.12 * amp;
  const bulgeR = o.bulge + Math.sin(t * 2 + 2.9) * o.bulge * 0.12 * amp;
  const waistL = o.waist + Math.sin(t * 3 + 2.1) * o.waist * 0.28 * amp;
  const waistR = o.waist + Math.sin(t * 3 + 0.5) * o.waist * 0.28 * amp;

  const tipX =
    cx + Math.sin(t) * span * 0.11 * amp + Math.sin(t * 3 + 1.1) * span * 0.05 * amp;
  const tipY = o.tipY - Math.sin(t * 2 + 0.5) * span * 0.08 * amp;
  const curl = Math.sin(t * 2 + 2.4) * 2.6 * amp;

  return (
    `M${cx - o.foot} ${baseY}` +
    `C${cx - bulgeL} ${bulgeY + 3.5} ${cx - bulgeL} ${bulgeY - 2.5} ${cx - waistL} ${waistY}` +
    `C${cx - waistL + curl * 0.4} ${waistY - span * 0.16} ${tipX - o.foot * 0.38} ${tipY + span * 0.2} ${tipX} ${tipY}` +
    `C${tipX + o.foot * 0.4} ${tipY + span * 0.2} ${cx + waistR - curl * 0.4} ${waistY - span * 0.16} ${cx + waistR} ${waistY}` +
    `C${cx + bulgeR} ${bulgeY - 2.5} ${cx + bulgeR} ${bulgeY + 3.5} ${cx + o.foot} ${baseY}` +
    `Q${cx} ${baseY + 2.8} ${cx - o.foot} ${baseY}Z`
  );
}

/** A coal: wide, squat, domed, with no tip at all. */
export function domeShape(t: number, w: number, h: number, amp: number): string {
  'worklet';
  const cx = 32;
  const baseY = 50;
  const a = Math.sin(t * 2) * 0.7 * amp;
  const b = Math.sin(t * 3 + 1.2) * 0.7 * amp;

  return (
    `M${cx - w} ${baseY}` +
    `C${cx - w - a} ${baseY - h * 0.75} ${cx - w * 0.55} ${baseY - h - b} ${cx} ${baseY - h}` +
    `C${cx + w * 0.55} ${baseY - h + b} ${cx + w + a} ${baseY - h * 0.75} ${cx + w} ${baseY}` +
    `Q${cx} ${baseY + 2.6} ${cx - w} ${baseY}Z`
  );
}

/** A spark: a four-point star that breathes. */
export function starShape(
  t: number,
  cx: number,
  cy: number,
  r: number,
  amp: number
): string {
  'worklet';
  const p = r * (1 + Math.sin(t * 3) * 0.2 * amp);
  const q = p * 0.26;

  return (
    `M${cx} ${cy - p}L${cx + q} ${cy - q}L${cx + p} ${cy}L${cx + q} ${cy + q}` +
    `L${cx} ${cy + p}L${cx - q} ${cy + q}L${cx - p} ${cy}L${cx - q} ${cy - q}Z`
  );
}

/** The doodled crown, and the pen rays around a year-old fire. */
const CROWN = 'M25 12l3 3.4 4-4.4 4 4.4 3-3.4v4.2H25z';
const RAYS = 'M13 20l3.4 3.4M51 20l-3.4 3.4M7 36h5M52 36h5M15 51l3.2-3.2M49 51l-3.2-3.2';

type Part =
  | { k: 'flame'; o: FlameSpec; fill?: string; stroke?: string; sw?: number; ph?: number }
  | { k: 'dome'; w: number; h: number; fill?: string; stroke?: string; sw?: number; ph?: number }
  | { k: 'star'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number; ph?: number };

interface Form {
  /** How freely the outlines travel. Zero holds the whole thing still. */
  amp: number;
  /** Drawn as a dashed pencil ghost. */
  ghost?: boolean;
  parts: Part[];
  crown?: { fill: string; stroke: string };
  rays?: string;
}

/**
 * The ten forms. Parts draw in order, so anything meant to sit behind
 * the main body is listed before it.
 */
function formFor(tier: FireTier): Form {
  switch (true) {
    // A whole fire: four flames, embers, a crown and pen rays.
    case tier.from >= 365:
      return {
        amp: 1.15,
        rays: '#C24E38',
        crown: { fill: '#FFF3C8', stroke: '#8A6508' },
        parts: [
          { k: 'flame', o: { cx: 19, foot: 4.4, bulge: 6, waist: 3, tipY: 26 }, fill: '#C08A2E', stroke: '#8A6508', sw: 2, ph: 2.2 },
          { k: 'flame', o: { cx: 45, foot: 4.4, bulge: 6, waist: 3, tipY: 28 }, fill: '#C08A2E', stroke: '#8A6508', sw: 2, ph: 3.7 },
          { k: 'flame', o: { foot: 9.2, bulge: 12.4, waist: 6, tipY: 17 }, fill: '#F0B93A', stroke: '#8A6508', sw: 2.4 },
          { k: 'flame', o: { foot: 4.6, bulge: 6.2, waist: 3.1, tipY: 28 }, fill: '#FFF3C8', ph: 1.6 },
          { k: 'star', cx: 47, cy: 44, r: 2.4, fill: '#F0B93A', ph: 0.6 },
          { k: 'star', cx: 17, cy: 46, r: 2, fill: '#C24E38', ph: 2.1 },
        ],
      };

    // Crowned, with two flamelets orbiting above.
    case tier.from >= 300:
      return {
        amp: 1.1,
        crown: { fill: '#E4C94B', stroke: '#3E3070' },
        parts: [
          { k: 'flame', o: { cx: 20, baseY: 40, foot: 2.6, bulge: 3.4, waist: 1.7, tipY: 26 }, fill: '#B9A9E8', stroke: '#3E3070', sw: 1.7, ph: 1.1 },
          { k: 'flame', o: { cx: 44, baseY: 40, foot: 2.6, bulge: 3.4, waist: 1.7, tipY: 26 }, fill: '#B9A9E8', stroke: '#3E3070', sw: 1.7, ph: 2.6 },
          { k: 'flame', o: { foot: 7.2, bulge: 9.4, waist: 4.4, tipY: 19 }, fill: '#9A88DA', stroke: '#3E3070', sw: 2.3 },
          { k: 'flame', o: { foot: 3.6, bulge: 4.8, waist: 2.3, tipY: 29 }, fill: '#E5DEFA', ph: 1.7 },
        ],
      };

    // A spire: taller and thinner still, throwing sparks.
    case tier.from >= 200:
      return {
        amp: 1.05,
        parts: [
          { k: 'flame', o: { foot: 5.4, bulge: 6.8, waist: 2.8, tipY: 9 }, fill: '#CBD5E0', stroke: '#5E6B7A', sw: 2.2 },
          { k: 'flame', o: { foot: 2.8, bulge: 3.6, waist: 1.7, tipY: 19 }, fill: '#FFFFFF', ph: 1.2 },
          { k: 'star', cx: 44, cy: 24, r: 2.2, fill: '#FFFFFF', ph: 0.8 },
          { k: 'star', cx: 20, cy: 29, r: 1.7, fill: '#CBD5E0', ph: 2.4 },
        ],
      };

    // A tall narrow column — the shape changes, not only the hue.
    case tier.from >= 100:
      return {
        amp: 1,
        parts: [
          { k: 'flame', o: { foot: 6.4, bulge: 8, waist: 3.6, tipY: 13 }, fill: '#6FA6DB', stroke: '#1F4A75', sw: 2.3 },
          { k: 'flame', o: { foot: 3.2, bulge: 4.2, waist: 2, tipY: 24 }, fill: '#CDE8FF', ph: 1.4 },
        ],
      };

    // Three tongues: the fire starts splitting.
    case tier.from >= 50:
      return {
        amp: 1,
        parts: [
          { k: 'flame', o: { cx: 24, foot: 4, bulge: 5.6, waist: 2.8, tipY: 29 }, fill: '#C24E38', stroke: '#27362B', sw: 2, ph: 2.2 },
          { k: 'flame', o: { cx: 40, foot: 4, bulge: 5.6, waist: 2.8, tipY: 31 }, fill: '#C24E38', stroke: '#27362B', sw: 2, ph: 3.7 },
          { k: 'flame', o: { foot: 8.4, bulge: 11.4, waist: 5.6, tipY: 21 }, fill: '#FF8A4A', stroke: '#27362B', sw: 2.4 },
          { k: 'flame', o: { foot: 4.2, bulge: 5.8, waist: 2.9, tipY: 31 }, fill: '#FFD87A', ph: 1.6 },
        ],
      };

    // A flame with a heart. The coal is gone.
    case tier.from >= 20:
      return {
        amp: 0.9,
        parts: [
          { k: 'flame', o: { foot: 8, bulge: 10.4, waist: 5.4, tipY: 25 }, fill: '#FFB05C', stroke: '#27362B', sw: 2.3 },
          { k: 'flame', o: { foot: 4, bulge: 5.4, waist: 2.7, tipY: 33 }, fill: '#FBE59B', ph: 1.9 },
        ],
      };

    // Coal with the first wisp of actual fire on top.
    case tier.from >= 10:
      return {
        amp: 0.8,
        parts: [
          { k: 'flame', o: { foot: 4.5, bulge: 6, waist: 3, tipY: 30 }, fill: '#F6E7A2', stroke: '#D9832B', sw: 1.9, ph: 0.4 },
          { k: 'dome', w: 10.5, h: 7, fill: '#E8A33A', stroke: '#27362B', sw: 2.2 },
          { k: 'dome', w: 6, h: 4.4, fill: '#FBE59B' },
        ],
      };

    // A glowing coal. Still no flame.
    case tier.from >= 5:
      return {
        amp: 0.7,
        parts: [
          { k: 'dome', w: 11, h: 8.5, fill: '#E8A33A', stroke: '#AC761C', sw: 2.2 },
          { k: 'dome', w: 6.5, h: 5, fill: '#FBE59B' },
          { k: 'star', cx: 38, cy: 34, r: 2, fill: '#E4C94B', ph: 1.1 },
        ],
      };

    // A star, not a small flame.
    case tier.from >= 1:
      return {
        amp: 0.9,
        parts: [
          { k: 'star', cx: 32, cy: 40, r: 7, fill: '#FCEBC0', stroke: '#C9A227', sw: 2 },
          { k: 'star', cx: 41, cy: 31, r: 2.4, fill: '#E4C94B', ph: 1.6 },
          { k: 'star', cx: 24, cy: 33, r: 1.8, fill: '#E4C94B', ph: 2.9 },
        ],
      };

    // Nothing burning yet: a cold coal, sketched in pencil.
    default:
      return {
        amp: 0,
        ghost: true,
        parts: [{ k: 'dome', w: 9, h: 6, stroke: '#A5AF9E', sw: 1.8 }],
      };
  }
}

/** The outline of one part at a moment in the cycle. */
function pathFor(part: Part, t: number, amp: number): string {
  'worklet';
  if (part.k === 'flame') return flameShape(t, part.o, amp);
  if (part.k === 'dome') return domeShape(t, part.w, part.h, amp);
  return starShape(t, part.cx, part.cy, part.r, amp);
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * One piece of the fire. Each carries its own phase offset so the parts
 * never swirl in lockstep — that is what stops a multi-part tier from
 * reading as one rigid object.
 */
function FormPart({
  part,
  clock,
  amp,
  ghost,
  still,
}: {
  part: Part;
  clock: SharedValue<number>;
  amp: number;
  ghost: boolean;
  still: boolean;
}) {
  const phase = part.ph ?? 0;

  const animatedProps = useAnimatedProps(() => ({
    d: pathFor(part, clock.value + phase, amp),
  }));

  const visual = {
    fill: ghost ? 'none' : (part.fill ?? 'none'),
    stroke: part.stroke,
    strokeWidth: part.sw,
    strokeLinejoin: 'round' as const,
    strokeDasharray: ghost ? '5 4' : undefined,
    opacity: ghost ? 0.8 : 1,
  };

  if (still) return <Path d={pathFor(part, phase, amp)} {...visual} />;
  return <AnimatedPath animatedProps={animatedProps} {...visual} />;
}

interface Props {
  tier: FireTier;
  /** Rendered size in px, square. */
  size?: number;
  /** False draws the unlit cold coal, perfectly still. */
  lit?: boolean;
}

export function DoodleFlame({ tier, size = 72, lit = true }: Props) {
  const reduced = useReducedMotion();
  const still = !lit || !!reduced;

  const form = lit ? formFor(tier) : formFor({ ...tier, from: -1 } as FireTier);

  // One clock, running 0 to 2*pi forever. Every wobble is an integer
  // harmonic of it, so the loop closes without a seam.
  const clock = useSharedValue(0);
  useEffect(() => {
    if (still) {
      clock.value = 0;
      return;
    }
    clock.value = withRepeat(
      withTiming(TAU, { duration: SWIRL_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [clock, still]);

  // A slow lean, so the whole fire is not pinned dead centre.
  const sway = useSharedValue(0);
  useEffect(() => {
    if (still) {
      sway.value = 0;
      return;
    }
    sway.value = withRepeat(
      withTiming(1, { duration: 3100, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [sway, still]);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * 2 * (size / 64) },
      { rotate: `${(sway.value - 0.5) * 1.8}deg` },
    ],
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {form.rays ? (
        <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
          <Path
            d={RAYS}
            stroke={form.rays}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        </Svg>
      ) : null}

      <Animated.View style={[StyleSheet.absoluteFill, swayStyle]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {form.parts.map((part, i) => (
            <FormPart
              key={i}
              part={part}
              clock={clock}
              amp={form.amp}
              ghost={!!form.ghost}
              still={still}
            />
          ))}
        </Svg>
      </Animated.View>

      {form.crown ? (
        <Svg width={size} height={size} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
          <Path
            d={CROWN}
            fill={form.crown.fill}
            stroke={form.crown.stroke}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </Svg>
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
