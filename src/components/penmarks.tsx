/**
 * Pen marks: the teacher's-pen vocabulary used across exam formats.
 * A strike through a rejected option, a red circle around a blamed word,
 * a tick on a recalled item, and a rubber stamp for true/false verdicts.
 * All honour reduce-motion by rendering their finished state.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { playSfx } from '@/lib/sfx';
import { colors, font } from '@/theme/tokens';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** A pen line struck through a rejected option. Grows left to right. */
export function PenStrike({ color = colors.textFaint }: { color?: string }) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) grow.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) });
  }, [grow, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: grow.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.strike, { backgroundColor: color }, style]}
    />
  );
}

/** The red circle a teacher draws around the word that's wrong. */
export function PenCircle({
  width,
  height,
  color = colors.coral,
}: {
  width: number;
  height: number;
  color?: string;
}) {
  const reduced = useReducedMotion();
  // Perimeter approximation for the dash trick.
  const rx = width / 2 + 5;
  const ry = height / 2 + 4;
  const length = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const progress = useSharedValue(reduced ? 0 : length);

  useEffect(() => {
    if (!reduced) {
      progress.value = withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) });
    }
  }, [length, progress, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width={width + 14}
        height={height + 12}
        style={styles.circleSvg}
        viewBox={`0 0 ${width + 14} ${height + 12}`}>
        <AnimatedEllipse
          cx={(width + 14) / 2}
          cy={(height + 12) / 2}
          rx={rx}
          ry={ry}
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length}`}
          animatedProps={animatedProps}
          transform={`rotate(-4 ${(width + 14) / 2} ${(height + 12) / 2})`}
        />
      </Svg>
    </View>
  );
}

/** A big pen tick, drawn stroke by stroke. */
export function PenTick({ size = 22, color = colors.leaf }: { size?: number; color?: string }) {
  const reduced = useReducedMotion();
  const LEN = 34;
  const progress = useSharedValue(reduced ? 0 : LEN);

  useEffect(() => {
    if (!reduced) {
      progress.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
    }
  }, [progress, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <AnimatedPath
        d="m5 12.5 4.5 4.5L19 7"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={`${LEN}`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

/** A rubber stamp slamming down: TRUE in leaf, FALSE in coral. */
export function Stamp({
  label,
  tone,
  style,
}: {
  label: string;
  tone: 'right' | 'wrong';
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 2.1);
  const opacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    // The thud lands when the stamp makes contact, reduced motion or not.
    const timer = setTimeout(() => playSfx('stamp'), reduced ? 0 : 140);
    if (reduced) return () => clearTimeout(timer);
    opacity.value = withTiming(1, { duration: 90 });
    scale.value = withSequence(
      withTiming(0.92, { duration: 140, easing: Easing.in(Easing.quad) }),
      withSpring(1, { damping: 11, stiffness: 320 })
    );
    return () => clearTimeout(timer);
  }, [opacity, reduced, scale]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: tone === 'right' ? '-7deg' : '6deg' }],
  }));

  const color = tone === 'right' ? colors.leaf : colors.coral;

  return (
    <Animated.View pointerEvents="none" style={[styles.stamp, { borderColor: color }, animStyle, style]}>
      <Text style={[styles.stampText, { color }]}>{label}</Text>
    </Animated.View>
  );
}

/** Ink flecks that scatter when the stamp lands. */
export function InkSplat({ color, nonce }: { color: string; nonce: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced || nonce === 0) return;
    p.value = 0;
    p.value = withDelay(160, withTiming(1, { duration: 380 }));
  }, [nonce, p, reduced]);

  const flecks = [0.6, 1.5, 2.6, 3.7, 4.7, 5.7];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flecks.map((angle) => (
        <Splot key={angle} angle={angle} color={color} p={p} />
      ))}
    </View>
  );
}

function Splot({
  angle,
  color,
  p,
}: {
  angle: number;
  color: string;
  p: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * p.value * 34 },
      { translateY: Math.sin(angle) * p.value * 30 },
      { scale: 1 - p.value * 0.4 },
    ],
  }));
  return <Animated.View style={[styles.splot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  strike: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: '50%',
    height: 2,
    borderRadius: 1,
    transformOrigin: 'left',
  },
  circleSvg: {
    position: 'absolute',
    left: -7,
    top: -6,
  },
  stamp: {
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  stampText: {
    fontFamily: font.display,
    fontSize: 22,
    letterSpacing: 2,
  },
  splot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
