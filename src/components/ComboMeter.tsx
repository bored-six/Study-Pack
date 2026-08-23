import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { colors, font } from '@/theme/tokens';

interface Props {
  combo: number;
}

interface Tier {
  from: number;
  label: (n: number) => string;
  icon: IconName;
  color: string;
  wash: string;
}

/** Escalates as the run grows; below 3 nothing shows at all. */
const TIERS: Tier[] = [
  { from: 3, label: (n) => `×${n}`, icon: 'spark', color: '#C9A227', wash: colors.goldWash },
  { from: 5, label: (n) => `×${n}`, icon: 'flameSmall', color: '#D9832B', wash: colors.goldWash },
  { from: 10, label: (n) => `×${n} hot!`, icon: 'flame', color: colors.coral, wash: colors.coralWash },
  { from: 20, label: (n) => `×${n} ON FIRE`, icon: 'flameBig', color: '#6C51A8', wash: '#EAE2FA' },
];

function tierFor(combo: number): Tier {
  let tier = TIERS[0];
  for (const t of TIERS) if (combo >= t.from) tier = t;
  return tier;
}

function Fleck({ angle, color, nonce }: { angle: number; color: string; nonce: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (nonce === 0) return;
    p.value = 0;
    p.value = withTiming(1, { duration: 450 });
  }, [nonce, p]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * p.value * 26 },
      { translateY: Math.sin(angle) * p.value * 26 },
      { scale: 1 - p.value * 0.5 },
    ],
  }));
  return <Animated.View style={[styles.fleck, { backgroundColor: color }, style]} />;
}

/**
 * The in-exam combo: appears at 3 in a row, pops on every hit, escalates
 * at 5, 10, and 20, and visibly breaks on a miss. Decoration only —
 * honours reduce-motion by holding still.
 */
export function ComboMeter({ combo }: Props) {
  const reduced = useReducedMotion();
  const prev = useRef(0);
  const [broke, setBroke] = useState(false);
  const [burst, setBurst] = useState(0);
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);

  useEffect(() => {
    const was = prev.current;
    prev.current = combo;

    if (combo >= 3 && combo > was && !reduced) {
      scale.value = withSequence(
        withTiming(1.3, { duration: 110 }),
        withSpring(1, { damping: 9, stiffness: 220 })
      );
      setBurst((n) => n + 1);
    }

    if (combo === 0 && was >= 3) {
      setBroke(true);
      if (!reduced) {
        shift.value = withSequence(
          withTiming(-6, { duration: 60 }),
          withTiming(6, { duration: 60 }),
          withTiming(-4, { duration: 55 }),
          withTiming(0, { duration: 55 }),
          withDelay(350, withTiming(0, { duration: 0 }))
        );
      }
      const timer = setTimeout(() => setBroke(false), 650);
      return () => clearTimeout(timer);
    }
  }, [combo, reduced, scale, shift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shift.value }],
  }));

  if (combo < 3 && !broke) return null;

  const tier = tierFor(broke ? prev.current || 3 : combo);

  return (
    <Animated.View
      style={[
        styles.pill,
        { backgroundColor: broke ? colors.coralWash : tier.wash },
        style,
      ]}>
      {!reduced
        ? [0.9, 2.2, 3.6, 4.9, 5.9].map((angle) => (
            <Fleck key={angle} angle={angle} color={tier.color} nonce={burst} />
          ))
        : null}
      <Icon
        name={broke ? 'cross' : tier.icon}
        size={15}
        color={broke ? colors.coral : colors.ink}
        fill={tier.color}
        strokeWidth={2.4}
      />
      <Text style={[styles.text, { color: broke ? colors.coral : tier.color }]}>
        {broke ? 'combo broke' : tier.label(combo)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    transform: [{ rotate: '-2deg' }],
  },
  text: {
    fontFamily: font.hero,
    fontSize: 15,
    lineHeight: 19,
  },
  fleck: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
