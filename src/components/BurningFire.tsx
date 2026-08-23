import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import type { FireTier } from '@/lib/fire';
import { colors } from '@/theme/tokens';

interface Props {
  tier: FireTier;
  /** Icon size in px; the whole element is a bit larger to fit the glow. */
  size?: number;
  /** False renders a still fire — an unlit spark shouldn't dance. */
  lit?: boolean;
}

/** More embers as the fire grows. */
function emberCountFor(tier: FireTier): number {
  if (tier.from >= 100) return 4;
  if (tier.from >= 20) return 3;
  if (tier.from >= 5) return 2;
  return 1;
}

function Ember({
  color,
  delay,
  duration,
  drift,
  rise,
}: {
  color: string;
  delay: number;
  duration: number;
  drift: number;
  rise: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) })),
      -1,
      false
    );
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.12, 0.65, 1], [0, 1, 0.55, 0]),
      transform: [
        { translateY: -p * rise },
        // A little sideways waver, like heat carrying it off course.
        { translateX: Math.sin(p * Math.PI * 2) * drift },
        { scale: interpolate(p, [0, 1], [1, 0.4]) },
      ],
    };
  });

  return <Animated.View style={[styles.ember, { backgroundColor: color }, style]} />;
}

/**
 * The streak fire, actually burning: a pulsing glow, a flame that sways
 * and flickers, and embers that break off and rise. Purely decorative —
 * honours reduce-motion by standing still.
 */
export function BurningFire({ tier, size = 30, lit = true }: Props) {
  const reduced = useReducedMotion();
  const animate = lit && !reduced;

  const sway = useSharedValue(0);
  const flicker = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!animate) return;
    // Slow lean left and right, like a draught in the room.
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 950, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    // Quick uneven squash-and-stretch — the flicker itself.
    flicker.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 170 }),
        withTiming(0.96, { duration: 140 }),
        withTiming(1.04, { duration: 190 }),
        withTiming(1, { duration: 150 })
      ),
      -1,
      false
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [animate, flicker, glow, sway]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: animate
      ? [
          { rotate: `${sway.value * 2.5}deg` },
          { scaleY: flicker.value },
          { scaleX: 2 - flicker.value },
          { translateY: (1 - flicker.value) * 2 },
        ]
      : [],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: animate ? 0.14 + glow.value * 0.14 : 0.14,
    transform: [{ scale: animate ? 0.92 + glow.value * 0.18 : 1 }],
  }));

  const box = Math.round(size * 1.7);
  const embers = emberCountFor(tier);

  return (
    <View style={[styles.stage, { width: box, height: box }]}>
      {lit ? (
        <Animated.View
          style={[
            styles.glow,
            {
              width: box,
              height: box,
              borderRadius: box / 2,
              backgroundColor: tier.color,
            },
            glowStyle,
          ]}
        />
      ) : null}

      {animate
        ? Array.from({ length: embers }, (_, i) => (
            <Ember
              key={i}
              color={tier.color}
              delay={i * 520}
              duration={1500 + i * 260}
              drift={3 + (i % 2) * 3}
              rise={size * 0.85}
            />
          ))
        : null}

      <Animated.View style={flameStyle}>
        <Icon name={tier.icon} size={size} color={colors.ink} fill={tier.color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  ember: {
    position: 'absolute',
    bottom: '30%',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
