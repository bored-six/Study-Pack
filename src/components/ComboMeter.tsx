import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { colors, font, shadow } from '@/theme/tokens';

interface Props {
  combo: number;
  idle?: boolean;
}

interface Tier {
  from: number;
  icon: IconName;
  color: string;
  wash: string;
  word: string | null;
}

/** Escalates as the run grows; below 3 nothing shows at all. */
const TIERS: Tier[] = [
  { from: 3, icon: 'spark', color: '#C9A227', wash: colors.goldWash, word: null },
  { from: 5, icon: 'flameSmall', color: '#D9832B', wash: colors.goldWash, word: null },
  { from: 10, icon: 'flame', color: colors.coral, wash: colors.coralWash, word: 'hot!' },
  { from: 20, icon: 'flameBig', color: '#6C51A8', wash: '#EAE2FA', word: 'ON FIRE' },
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
    p.value = withTiming(1, { duration: 500 });
  }, [nonce, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * p.value * 34 },
      { translateY: Math.sin(angle) * p.value * 34 },
      { scale: 1 - p.value * 0.5 },
    ],
  }));
  return <Animated.View style={[styles.fleck, { backgroundColor: color }, style]} />;
}

/**
 * The combo, front and centre instead of tucked in the header: a big
 * sticker slapped on the clipboard's corner that pops with every hit,
 * breathes and rocks while you stall, and visibly breaks on a miss —
 * plus a flare that jumps out over the page each time it grows.
 */
export function ComboMeter({ combo, idle = false }: Props) {
  const reduced = useReducedMotion();
  const prev = useRef(0);
  const [broke, setBroke] = useState(false);
  const [burst, setBurst] = useState(0);
  const [flare, setFlare] = useState<number | null>(null);
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);
  const breathe = useSharedValue(1);
  const rock = useSharedValue(0);
  const flareAnim = useSharedValue(0);

  useEffect(() => {
    const was = prev.current;
    prev.current = combo;

    if (combo >= 3 && combo > was) {
      setBurst((n) => n + 1);
      if (!reduced) {
        scale.value = withSequence(
          withTiming(1.35, { duration: 110 }),
          withSpring(1, { damping: 9, stiffness: 220 })
        );
        // The flare: the count leaps out over the page, then melts away.
        setFlare(combo);
        flareAnim.value = 0;
        flareAnim.value = withSequence(
          withSpring(1, { damping: 12, stiffness: 260 }),
          withDelay(420, withTiming(2, { duration: 320, easing: Easing.in(Easing.quad) }))
        );
        const timer = setTimeout(() => setFlare(null), 1150);
        return () => clearTimeout(timer);
      }
    }

    if (combo === 0 && was >= 3) {
      setBroke(true);
      if (!reduced) {
        shift.value = withSequence(
          withTiming(-7, { duration: 60 }),
          withTiming(7, { duration: 60 }),
          withTiming(-5, { duration: 55 }),
          withTiming(0, { duration: 55 })
        );
      }
      const timer = setTimeout(() => setBroke(false), 900);
      return () => clearTimeout(timer);
    }
  }, [combo, flareAnim, reduced, scale, shift]);

  useEffect(() => {
    if (idle && combo >= 3 && !reduced) {
      breathe.value = withRepeat(
        withSequence(withTiming(1.1, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
        false
      );
      rock.value = withRepeat(
        withSequence(withTiming(1, { duration: 900 }), withTiming(-1, { duration: 900 })),
        -1,
        false
      );
    } else {
      breathe.value = withTiming(1, { duration: 200 });
      rock.value = withTiming(0, { duration: 200 });
    }
  }, [breathe, combo, idle, reduced, rock]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value * breathe.value },
      { translateX: shift.value },
      { rotate: `${5 + rock.value * 3}deg` },
    ],
  }));

  const flareStyle = useAnimatedStyle(() => {
    const p = flareAnim.value;
    const entering = Math.min(p, 1);
    const leaving = Math.max(0, p - 1);
    return {
      opacity: entering * (1 - leaving),
      transform: [
        { scale: 0.5 + entering * 1.1 - leaving * 0.2 },
        { translateY: -leaving * 60 },
      ],
    };
  });

  if (combo < 3 && !broke) return null;

  const tier = tierFor(broke ? Math.max(prev.current, 3) : combo);

  return (
    <>
      {flare != null ? (
        <Animated.View pointerEvents="none" style={[styles.flare, flareStyle]} exiting={FadeOut}>
          <Icon name={tier.icon} size={30} color={colors.ink} fill={tier.color} strokeWidth={1.8} />
          <Text style={[styles.flareText, { color: tier.color }]}>×{flare}</Text>
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.badge,
          { backgroundColor: broke ? colors.coralWash : tier.wash },
          badgeStyle,
        ]}>
        {[0.9, 2.2, 3.6, 4.9, 5.9].map((angle) => (
          <Fleck key={angle} angle={angle} color={tier.color} nonce={reduced ? 0 : burst} />
        ))}
        <Icon
          name={broke ? 'cross' : tier.icon}
          size={22}
          color={broke ? colors.coral : colors.ink}
          fill={broke ? colors.coralWash : tier.color}
          strokeWidth={2}
        />
        <Text style={[styles.badgeNum, { color: broke ? colors.coral : tier.color }]}>
          {broke ? 'broke!' : `×${combo}`}
        </Text>
        {!broke && tier.word ? (
          <Text style={[styles.badgeWord, { color: tier.color }]}>{tier.word}</Text>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -14,
    right: 2,
    zIndex: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...shadow.pop,
  },
  badgeNum: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 24,
  },
  badgeWord: {
    fontFamily: font.bodyHeavy,
    fontSize: 9,
    letterSpacing: 1,
    marginTop: -2,
  },
  flare: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    zIndex: 40,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  flareText: {
    fontFamily: font.hero,
    fontSize: 44,
    lineHeight: 52,
  },
  fleck: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
