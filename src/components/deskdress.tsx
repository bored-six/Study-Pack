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
      <View
        style={[
          styles.penStroke,
          {
            width: `${Math.max(2, progress * 100)}%`,
            height: 2.5 + heat * 2.5,
            backgroundColor: heat > 0.45 ? colors.ink : '#6B7280',
            opacity: 0.55 + heat * 0.45,
          },
        ]}
      />
    </View>
  );
}

/** ||||-strokes instead of "4/10". Falls back to digits on long papers. */
export function Tally({ count, total }: { count: number; total?: number }) {
  if (count > 30) {
    return (
      <Text style={styles.tallyText}>
        {count}
        {total != null ? ` / ${total}` : ''}
      </Text>
    );
  }
  const groups: number[] = [];
  let left = count;
  while (left > 0) {
    groups.push(Math.min(5, left));
    left -= 5;
  }
  return (
    <View style={styles.tallyRow}>
      {groups.map((n, g) => (
        <View key={g} style={styles.tallyGroup}>
          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
            <View key={i} style={styles.tallyStroke} />
          ))}
          {n === 5 ? <View style={styles.tallySlash} /> : null}
        </View>
      ))}
      {count === 0 ? <Text style={styles.tallyText}>0</Text> : null}
    </View>
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

/** Evening warms the paper; late night pulls the desk lamp in. */
export function DayTint() {
  const hour = new Date().getHours();
  if (hour >= 18 && hour < 22) {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 158, 62, 0.045)' }]}
      />
    );
  }
  if (hour >= 22 || hour < 5) {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, backgroundColor: 'rgba(38, 43, 76, 0.055)' }} />
        <View style={styles.lampEdgeTop} />
        <View style={styles.lampEdgeBottom} />
      </View>
    );
  }
  return null;
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
  penStroke: {
    borderRadius: 2,
    transform: [{ rotate: '-0.4deg' }],
  },
  tallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tallyGroup: {
    flexDirection: 'row',
    gap: 2.5,
    position: 'relative',
    paddingHorizontal: 1,
  },
  tallyStroke: {
    width: 2,
    height: 13,
    borderRadius: 1,
    backgroundColor: colors.textDim,
    transform: [{ rotate: '3deg' }],
  },
  tallySlash: {
    position: 'absolute',
    left: -1,
    right: -1,
    top: 5.5,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textDim,
    transform: [{ rotate: '-24deg' }],
  },
  tallyText: {
    fontFamily: font.hero,
    fontSize: 14,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
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
  lampEdgeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(20, 24, 48, 0.05)',
  },
  lampEdgeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
    backgroundColor: 'rgba(20, 24, 48, 0.05)',
  },
  ember: {
    position: 'absolute',
    top: '30%',
    left: 0,
  },
});
