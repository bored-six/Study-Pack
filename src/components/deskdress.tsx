/**
 * Desk dressing for the exam stage: the pencil-stroke progress line,
 * tally-mark counter, per-format desk props with an impatient idle tap,
 * time-of-day light, and the ember that drifts across when a personal
 * best falls. All decoration; all still under reduce-motion.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import Svg, { Path, Rect } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import type { ExamFormat } from '@/lib/exam';
import { font, getColors, onWash, useThemeStore } from '@/theme/tokens';

/** Progress as a graphite stroke: longer as you go, bolder as combos grow. */
export function PencilProgress({ progress, combo }: { progress: number; combo: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const heat = Math.min(combo, 20) / 20;
  return (
    <View style={styles.penTrack}>
      {/* Faint guide line, so the stroke has somewhere visible to go. */}
      <View style={styles.penGuide} />
      <View
        style={[
          styles.penStroke,
          {
            width: `${Math.max(8, progress * 100)}%`,
            height: 3.5 + heat * 2.5,
            backgroundColor: heat > 0.45 ? colors.ink : '#5B6570',
            opacity: 0.75 + heat * 0.25,
          },
        ]}
      />
    </View>
  );
}

/** Handwritten "3 of 12" — always legible, unlike a lone tally stroke. */
export function PageCount({ count, total }: { count: number; total: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  return (
    <Text style={styles.pageCount}>
      {count} <Text style={styles.pageCountOf}>of</Text> {total}
    </Text>
  );
}

const PROP_FOR: Partial<Record<ExamFormat, 'ruler' | 'redpen'>> = {
  matching: 'ruler',
  modified_true_false: 'redpen',
};

export type DeskMood = 'watch' | 'happy' | 'wince' | 'sleep';

/**
 * The deskmate: the pencil at the desk's edge, now with eyes. It watches
 * you work, blinks, leans in when a combo is going, winces at a miss, and
 * dozes off when you stall. One small component on purpose — if a proper
 * mascot ever lands, this is the single place it replaces.
 */
/**
 * What the deskmate is made of.
 *
 * Fixed in both themes, for the same reason the pad's cartridge face is: a
 * small object in the corner of a page keeps its own colour when the lights
 * go down. Only the paper behind it changes.
 */
const PROP_FILL = { lead: '#FAECCB', red: '#FBE1D7' } as const;
const PROP_INK = { lead: '#27362B', red: '#C24E38' } as const;
const PROP_METAL = '#C9CDC4';
const PROP_WOOD = '#F2E4C7';

/**
 * The deskmate himself.
 *
 * He used to be the app's plain pencil glyph turned on its side with two
 * eyes floated over it, so the face landed wherever the rotation left it and
 * he read as an object wearing stickers. This is a drawn character: he
 * stands up, the face sits on the barrel where a face goes, and he has a
 * ferrule, a wood collar and stubby arms.
 *
 * Colours are passed in rather than read from the theme — see PROP_FILL.
 */
function PencilBody({ ink, fill }: { ink: string; fill: string }) {
  return (
    <Svg width={46} height={72} viewBox="0 0 46 72">
      {/* eraser */}
      <Path
        d="M11 12V7a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v5z"
        fill={PROP_FILL.red}
        stroke={ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* ferrule */}
      <Rect x={10} y={11.5} width={26} height={6.5} rx={1.5} fill={PROP_METAL} stroke={ink} strokeWidth={2} />
      {/* barrel */}
      <Rect x={11} y={18} width={24} height={30} rx={2.5} fill={fill} stroke={ink} strokeWidth={2} />
      {/* the flats of a hexagonal barrel */}
      <Path d="M19 19v28M27 19v28" stroke={ink} strokeWidth={1} opacity={0.22} />
      {/* wood collar and lead */}
      <Path d="M11 48h24l-12 16z" fill={PROP_WOOD} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M18.4 58h9.2L23 64z" fill={ink} />
      {/* arms */}
      <Path d="M11 31c-6 1.4-8.4 5-7.4 9.4" stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M35 31c6 1.4 8.4 5 7.4 9.4" stroke={ink} strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* mouth */}
      <Path d="M19.4 35q3.6 3 7.2 0" stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function DeskProp({
  format,
  idle,
  mood = 'watch',
}: {
  format: ExamFormat;
  idle: boolean;
  mood?: DeskMood;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const reduced = useReducedMotion();
  const tap = useSharedValue(0);
  const blink = useSharedValue(1);
  const lean = useSharedValue(0);
  const sway = useSharedValue(0);
  const bounce = useSharedValue(0);

  const effectiveMood: DeskMood = idle ? 'sleep' : mood;

  // Alive even at rest: a slow breathe-and-sway, so it reads as a
  // creature, not a prop.
  useEffect(() => {
    if (reduced) return;
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 1400, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [reduced, sway]);

  // A little hop-hop while a combo is running.
  useEffect(() => {
    if (effectiveMood === 'happy' && !reduced) {
      bounce.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      );
    } else {
      bounce.value = withTiming(0, { duration: 180 });
    }
  }, [bounce, effectiveMood, reduced]);

  useEffect(() => {
    if (idle && !reduced) {
      tap.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 90 }),
          withTiming(0, { duration: 90 }),
          withTiming(1, { duration: 90 }),
          withTiming(0, { duration: 1900 })
        ),
        -1,
        false
      );
    } else {
      tap.value = withTiming(0, { duration: 150 });
    }
  }, [idle, reduced, tap]);

  // A slow blink, whatever else is happening (closed eyes while asleep).
  useEffect(() => {
    if (reduced || effectiveMood === 'sleep') {
      blink.value = 1;
      return;
    }
    blink.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600 }),
        withTiming(0.1, { duration: 90 }),
        withTiming(1, { duration: 110 })
      ),
      -1,
      false
    );
  }, [blink, effectiveMood, reduced]);

  useEffect(() => {
    if (reduced) return;
    lean.value = withTiming(effectiveMood === 'happy' ? 1 : effectiveMood === 'wince' ? -1 : 0, {
      duration: 260,
    });
  }, [effectiveMood, lean, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${sway.value * 3 + tap.value * 6 - lean.value * 11}deg` },
      { translateY: tap.value * -2 - bounce.value * 5 + (lean.value === 1 ? -3 : 0) },
    ],
  }));

  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: blink.value }],
  }));

  const prop = PROP_FOR[format];

  return (
    <View pointerEvents="none" style={styles.propCorner}>
      {prop === 'ruler' ? (
        <View style={styles.ruler}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={styles.rulerTick} />
          ))}
        </View>
      ) : (
        <Animated.View style={style}>
          {/*
            The deskmate is an object, not a surface — the same rule the pad
            states for its cartridge face. A pencil is yellow and a red pen is
            red at midnight too, so its colours are pinned. Left on the theme's
            washes it turned into a mud-brown stick with a pale outline, which
            is what made it look grim at night rather than friendly.
          */}
          <PencilBody
            ink={prop === 'redpen' ? PROP_INK.red : PROP_INK.lead}
            fill={prop === 'redpen' ? PROP_FILL.red : PROP_FILL.lead}
          />
          <View style={styles.face}>
            {effectiveMood === 'sleep' ? (
              <>
                <View style={styles.eyeShut} />
                <View style={styles.eyeShut} />
              </>
            ) : effectiveMood === 'wince' ? (
              <>
                <View style={styles.eyeWince} />
                <View style={styles.eyeShut} />
              </>
            ) : (
              <>
                <Animated.View style={[styles.eye, eyeStyle]}>
                  <View style={styles.pupil} />
                </Animated.View>
                <Animated.View style={[styles.eye, eyeStyle]}>
                  <View style={styles.pupil} />
                </Animated.View>
              </>
            )}
          </View>
          {effectiveMood === 'sleep' ? <Text style={styles.zzz}>z</Text> : null}
        </Animated.View>
      )}
      {/* eraser crumbs */}
      <View style={[styles.crumb, { left: 10, bottom: 2 }]} />
      <View style={[styles.crumb, { left: 30, bottom: 5, width: 3 }]} />
      <View style={[styles.crumb, { left: 20, bottom: 0 }]} />
    </View>
  );
}

/** Evening warms the whole stage; late night dims it like a desk lamp. */
export function DayTint() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const hour = new Date().getHours();
  const wash =
    hour >= 18 && hour < 22
      ? 'rgba(255, 158, 62, 0.05)'
      : hour >= 22 || hour < 5
        ? 'rgba(38, 43, 76, 0.07)'
        : null;
  if (!wash) return null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: wash, zIndex: 40 }]}
    />
  );
}

/** One ember sails across the screen when a best combo falls. */
export function EmberDrift({ nonce }: { nonce: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const p = useSharedValue(0);

  useEffect(() => {
    if (nonce === 0 || reduced) return;
    p.value = 0;
    p.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
  }, [nonce, p, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 || p.value === 1 ? 0 : 0.9,
    transform: [
      { translateX: -30 + p.value * (width + 60) },
      { translateY: Math.sin(p.value * Math.PI * 2.2) * 26 - p.value * 60 },
      { scale: 1 - p.value * 0.4 },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.ember, style]}>
      <Icon name="flameSmall" size={16} color={colors.ink} fill={colors.gold} strokeWidth={1.6} />
    </Animated.View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  penTrack: {
    flex: 1,
    height: 14,
    justifyContent: 'center',
  },
  penGuide: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.13)',
  },
  penStroke: {
    borderRadius: 2,
    transform: [{ rotate: '-0.4deg' }],
  },
  pageCount: {
    fontFamily: font.hero,
    fontSize: 17,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pageCountOf: {
    fontSize: 12,
    color: colors.textFaint,
  },
  /**
   * Top left, not bottom right.
   *
   * The bottom right of a pad is where the Check and Next buttons live, so
   * the deskmate sat on top of the one control every question needs. Up here
   * it has the whole margin to itself — the title is centred, the stamp is
   * on the other side, and the stars come up along the bottom.
   */
  propCorner: {
    position: 'absolute',
    left: 0,
    top: 22,
    width: 46,
    height: 72,
    zIndex: 2,
  },
  ruler: {
    width: 54,
    height: 14,
    backgroundColor: PROP_FILL.lead,
    borderWidth: 1.5,
    borderColor: PROP_INK.lead,
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 5,
    transform: [{ rotate: '-14deg' }],
  },
  rulerTick: {
    width: 1.2,
    height: 5,
    backgroundColor: PROP_INK.lead,
    opacity: 0.55,
  },
  /** On the barrel: two eyes above the drawn mouth at y=35. */
  face: {
    position: 'absolute',
    top: 23,
    left: 14,
    flexDirection: 'row',
    gap: 2.5,
  },
  /**
   * An eye is an object, not a surface.
   *
   * These followed the theme, so at night the white became dark and the
   * pupil became light — a pale pupil floating in a dark socket, which is
   * the face every horror film draws. Cartoon eyes keep a light white and a
   * dark pupil under any lighting, so both are pinned. The lids below still
   * follow the theme, because a closed eye is a drawn line and has to stay
   * visible against the body.
   */
  eye: {
    width: 8,
    height: 8,
    borderRadius: 4.5,
    backgroundColor: '#F7F4EA',
    borderWidth: 1,
    borderColor: onWash.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: onWash.ink,
  },
  eyeShut: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.ink,
    marginTop: 2,
  },
  eyeWince: {
    width: 8,
    height: 4,
    borderRadius: 1.5,
    borderWidth: 1.2,
    borderColor: onWash.ink,
    backgroundColor: '#F7F4EA',
    marginTop: 1,
  },
  zzz: {
    position: 'absolute',
    top: -8,
    right: -4,
    fontFamily: font.hero,
    fontSize: 16,
    color: colors.textFaint,
  },
  crumb: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(39, 54, 43, 0.18)',
  },
  ember: {
    position: 'absolute',
    top: '30%',
    left: 0,
  },
});
