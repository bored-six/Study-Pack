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

import { Icon } from '@/components/Icon';
import type { ExamFormat } from '@/lib/exam';
import { colors, font } from '@/theme/tokens';

/** Progress as a graphite stroke: longer as you go, bolder as combos grow. */
export function PencilProgress({ progress, combo }: { progress: number; combo: number }) {
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

/** The tool lying at the desk's edge; taps impatiently when you stall. */
export function DeskProp({ format, idle }: { format: ExamFormat; idle: boolean }) {
  const reduced = useReducedMotion();
  const tap = useSharedValue(0);

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

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${32 + tap.value * 7}deg` }, { translateY: tap.value * -2 }],
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
          <Icon
            name="pencil"
            size={26}
            color={prop === 'redpen' ? colors.coral : colors.ink}
            fill={prop === 'redpen' ? colors.coralWash : colors.goldWash}
            strokeWidth={1.8}
          />
        </Animated.View>
      )}
      {/* eraser crumbs */}
      <View style={[styles.crumb, { right: 34, bottom: 6 }]} />
      <View style={[styles.crumb, { right: 42, bottom: 11, width: 3 }]} />
      <View style={[styles.crumb, { right: 28, bottom: 13 }]} />
    </View>
  );
}

/** Evening warms the whole stage; late night dims it like a desk lamp. */
export function DayTint() {
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

const styles = StyleSheet.create({
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
  propCorner: {
    position: 'absolute',
    right: -4,
    bottom: -10,
    width: 70,
    height: 40,
  },
  ruler: {
    width: 54,
    height: 14,
    backgroundColor: colors.goldWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
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
    backgroundColor: colors.textDim,
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
