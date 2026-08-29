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
  ember: {
    position: 'absolute',
    top: '30%',
    left: 0,
  },
});
