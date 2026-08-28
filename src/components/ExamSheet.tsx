import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';

import { DeskProp, type DeskMood } from '@/components/deskdress';
import { Squiggle } from '@/components/notebook';
import type { ExamFormat } from '@/lib/exam';
import { font, getColors, outline, radius, shadow, useThemeStore } from '@/theme/tokens';

interface Props {
  format: ExamFormat;
  /** The format's name, handwritten at the top of the page. */
  title: string;
  /** The format's ink colour — used for the title underline. */
  accent: string;
  children: React.ReactNode;
  /** Eraser smudges left by wrong tries on this page. */
  smudges?: number;
  /** Star stickers earned this run — first-try-correct pages. */
  stars?: number;
  /** True after ~8s without input; the desk gets impatient. */
  idle?: boolean;
  /** The deskmate's mood — leaning in, wincing, or watching. */
  mood?: DeskMood;
  style?: StyleProp<ViewStyle>;
}

/**
 * The exam stage: a clean page under a clipboard clip. One airy sheet —
 * no rules behind the answers — with the format's name written across
 * the top so there is never a doubt what kind of paper this is. The
 * dog-eared corner marks the working page.
 */
export function ExamSheet({
  format,
  title,
  accent,
  children,
  smudges = 0,
  stars = 0,
  idle = false,
  mood = 'watch',
  style,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const shownStars = Math.min(stars, 7);
  return (
    <View style={[styles.board, style]}>
      <View style={styles.page}>
        <View style={styles.pageHead}>
          <Text style={styles.pageTitle}>{title}</Text>
          <Squiggle width={96} color={accent} />
        </View>

        {Array.from({ length: Math.min(smudges, 3) }, (_, i) => (
          <View key={i} style={[styles.smudge, SMUDGE_SPOTS[i]]} />
        ))}

        <View style={styles.content}>{children}</View>

        <View style={styles.dogEar} />
        <View style={styles.dogEarShade} />
      </View>

      {/* The clip holding the page down. */}
      <View style={styles.clip}>
        <View style={styles.clipHole} />
      </View>

      {stars > 0 ? (
        <View style={styles.starShelf} pointerEvents="none">
          {Array.from({ length: shownStars }, (_, i) => (
            <TwinkleStar key={i} index={i} newest={i === shownStars - 1} />
          ))}
          {stars > 7 ? <Text style={styles.starMore}>+{stars - 7}</Text> : null}
        </View>
      ) : null}

      <DeskProp format={format} idle={idle} mood={mood} />
    </View>
  );
}

/** A landed star that keeps twinkling — a slow shimmer, phased per star. */
function TwinkleStar({ index, newest }: { index: number; newest: boolean }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const reduced = useReducedMotion();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    shimmer.value = withDelay(
      index * 380,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1600 })
        ),
        -1,
        false
      )
    );
  }, [index, reduced, shimmer]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${(index % 3) * 7 - 7 + shimmer.value * 10}deg` },
      { scale: 1 + shimmer.value * 0.25 },
    ],
  }));

  return (
    <Animated.View
      entering={newest ? ZoomIn.springify().damping(9) : undefined}
      style={style}>
      <Icon name="star" size={24} color={colors.ink} fill={colors.gold} strokeWidth={1.7} />
    </Animated.View>
  );
}

/** Where erased mistakes end up — spread out, like a real messy page. */
const SMUDGE_SPOTS: ViewStyle[] = [
  { top: 64, right: 30, transform: [{ rotate: '-14deg' }] },
  { bottom: 46, left: 22, transform: [{ rotate: '9deg' }] },
  { top: '48%', right: 14, transform: [{ rotate: '-5deg' }] },
];

const getStyles = (colors: any) => StyleSheet.create({
  board: {
    backgroundColor: 'rgba(151, 106, 44, 0.12)',
    borderRadius: radius.card + 8,
    padding: 10,
    paddingTop: 20,
    paddingBottom: 16,
  },
  page: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    overflow: 'hidden',
    ...shadow.card,
  },
  pageHead: {
    alignItems: 'center',
    paddingTop: 22,
    gap: 2,
  },
  pageTitle: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  content: {
    padding: 16,
    paddingTop: 12,
  },
  starShelf: {
    position: 'absolute',
    left: 12,
    bottom: -8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  starMore: {
    fontFamily: font.hero,
    fontSize: 16,
    color: colors.gold,
    marginLeft: 2,
  },
  clip: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    width: 76,
    height: 26,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  clipHole: {
    width: 34,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(39, 54, 43, 0.18)',
  },
  smudge: {
    position: 'absolute',
    width: 46,
    height: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(39, 54, 43, 0.055)',
  },
  dogEar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderStyle: 'solid',
    borderRightWidth: 22,
    borderTopWidth: 22,
    borderRightColor: colors.bg,
    borderTopColor: 'transparent',
    width: 0,
    height: 0,
  },
  dogEarShade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderStyle: 'solid',
    borderLeftWidth: 22,
    borderBottomWidth: 22,
    borderBottomColor: colors.surface2,
    borderLeftColor: 'transparent',
    width: 0,
    height: 0,
  },
});
