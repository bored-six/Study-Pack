import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { colors, font, outline, shadow, textPop } from '@/theme/tokens';

interface Props {
  onDone: () => void;
}

const HOLD_MS = 2100;
const REDUCED_HOLD_MS = 1200;
const EXIT_MS = 320;

const POP_SPRING = { damping: 12, stiffness: 150 } as const;

/** Confetti dots scattered around the logo cluster, in candy inks. */
const DOTS = [
  { x: -104, y: -84, size: 13, color: '#5FD184', delay: 420 },
  { x: 96, y: -110, size: 10, color: '#BC5A2E', delay: 500 },
  { x: 122, y: -26, size: 8, color: '#A0731A', delay: 560 },
  { x: -126, y: 2, size: 9, color: '#2E6FA3', delay: 620 },
  { x: 82, y: 58, size: 12, color: '#6C51A8', delay: 680 },
  { x: -68, y: 92, size: 8, color: '#C24E38', delay: 740 },
] as const;

function Dot({
  x,
  y,
  size,
  color,
  delay,
  reduced,
}: (typeof DOTS)[number] & { reduced: boolean }) {
  const scale = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) {
      scale.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 190 }));
    }
  }, [delay, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { marginLeft: x, marginTop: y, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/**
 * Animated launch intro: the logo sticker springs in over the same paper
 * ground as the splash screen, then the whole overlay melts away into the
 * app. Tap anywhere to skip; honors the system reduce-motion setting.
 */
export function IntroOverlay({ onDone }: Props) {
  const reduced = useReducedMotion();
  const doneRef = useRef(false);

  const cardScale = useSharedValue(reduced ? 1 : 0.5);
  const cardRotate = useSharedValue(reduced ? -4 : -16);
  const cardOpacity = useSharedValue(reduced ? 1 : 0);
  const wordY = useSharedValue(reduced ? 0 : 18);
  const wordOpacity = useSharedValue(reduced ? 1 : 0);
  const tagOpacity = useSharedValue(reduced ? 1 : 0);
  const overlayOpacity = useSharedValue(1);
  const overlayScale = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    cardOpacity.value = withTiming(1, { duration: 140 });
    cardScale.value = withSpring(1, POP_SPRING);
    cardRotate.value = withSpring(-4, POP_SPRING);
    wordOpacity.value = withDelay(260, withTiming(1, { duration: 240 }));
    wordY.value = withDelay(260, withSpring(0, { damping: 14, stiffness: 160 }));
    tagOpacity.value = withDelay(620, withTiming(1, { duration: 300 }));
  }, [cardOpacity, cardRotate, cardScale, reduced, tagOpacity, wordOpacity, wordY]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    overlayScale.value = withTiming(1.05, { duration: EXIT_MS });
    overlayOpacity.value = withTiming(0, { duration: EXIT_MS }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, [onDone, overlayOpacity, overlayScale]);

  useEffect(() => {
    const timer = setTimeout(finish, reduced ? REDUCED_HOLD_MS : HOLD_MS);
    return () => clearTimeout(timer);
  }, [finish, reduced]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: overlayScale.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }, { rotate: `${cardRotate.value}deg` }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordY.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOpacity.value }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]}>
      <Pressable style={styles.fill} onPress={finish}>
        <View style={styles.cluster}>
          {DOTS.map((dot) => (
            <Dot key={`${dot.x},${dot.y}`} {...dot} reduced={reduced} />
          ))}
          <Animated.View style={[styles.sticker, cardStyle]}>
            <Icon name="cardsFilled" size={52} color={colors.accent} strokeWidth={1.6} />
          </Animated.View>
          <Animated.Text style={[styles.wordmark, wordStyle]}>StudyPack</Animated.Text>
          <Animated.View style={[styles.taglineRow, tagStyle]}>
            <Text style={styles.tagline}>Play · learn · streak</Text>
            <Icon name="flame" size={15} color={colors.ink} fill={colors.gold} strokeWidth={2.2} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cluster: {
    alignItems: 'center',
  },
  dot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  sticker: {
    width: 104,
    height: 104,
    borderRadius: 30,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
  },
  wordmark: {
    fontFamily: font.hero,
    fontSize: 42,
    lineHeight: 54,
    color: colors.text,
    marginTop: 18,
    ...textPop(colors.accentWash, 4),
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  tagline: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.textDim,
  },
});
