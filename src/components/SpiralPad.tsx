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
import type { ExamFormat } from '@/lib/exam';
import type { PaperStock } from '@/lib/mode';
import { font, getColors, shadow, useThemeStore } from '@/theme/tokens';

/**
 * The stage: a spiral-bound pad, seen head on.
 *
 * What was here before was a sheet, under a clip, on a board, on the
 * screen's own ruled paper — three nested containers before you reached a
 * word, and the answers sat in the middle of the screen where a thumb has
 * to reach up for them. The character was never the problem; the
 * structure was.
 *
 * A pad is one object. The rings and the torn perforation under them say
 * "one page at a time" without a counter, the red margin and the rules are
 * structure rather than wallpaper, and the tear that already plays at the
 * end of a sitting stops being a flourish and becomes what the pad is for.
 */

/**
 * The page follows the theme; the binding does not.
 *
 * A cartridge face is a small object and keeps its colour at night. A page
 * is not an object, it is the surface you read a paragraph off — and a
 * blazing cream sheet at midnight is the reason people turn dark mode on.
 * So the paper is `colors.surface`, and only the metal rings, which really
 * are objects, stay the colour metal is.
 */
const RING = '#C9CDC4';
const RING_EDGE = 'rgba(39, 54, 43, 0.35)';
const RING_HOLE = 'rgba(39, 54, 43, 0.45)';

/** Where the writing starts, and the height of one ruled line. */
export const RULE_HEIGHT = 22;
const MARGIN_X = 30;

interface Props {
  format: ExamFormat;
  /** The format's name, written at the top of the page. */
  title: string;
  /** The format's ink — used for the underline under the title. */
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
  /** What this mode's paper is. Ruled unless the mode says otherwise. */
  stock?: PaperStock;
  /** The mode's rubber stamp, printed in the corner. */
  stamp?: string;
  /** The stamp's ink — the mode's colour, not the page's. */
  stampInk?: string;
  style?: StyleProp<ViewStyle>;
}

export function SpiralPad({
  format,
  title,
  accent,
  children,
  smudges = 0,
  stars = 0,
  idle = false,
  mood = 'watch',
  stock = 'ruled',
  stamp,
  stampInk,
  style,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const shownStars = Math.min(stars, 7);

  return (
    <View style={[styles.pad, style]}>
      {/* The binding: rings through the torn edge of the page. */}
      <View style={styles.rings} pointerEvents="none">
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={styles.ring}>
            <View style={styles.ringHole} />
          </View>
        ))}
      </View>

      <View style={styles.page}>
        {/* Where the last page came away. */}
        <View style={styles.perforation} pointerEvents="none">
          {Array.from({ length: 26 }, (_, i) => (
            <View key={i} style={styles.tooth} />
          ))}
        </View>

        <Stock kind={stock} />

        {stamp ? (
          <View style={[styles.stamp, { borderColor: stampInk ?? accent }]} pointerEvents="none">
            <Text style={[styles.stampText, { color: stampInk ?? accent }]}>{stamp}</Text>
          </View>
        ) : null}

        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <View style={[styles.underline, { backgroundColor: accent }]} />
        </View>

        {Array.from({ length: Math.min(smudges, 3) }, (_, i) => (
          <View key={i} style={[styles.smudge, SMUDGE_SPOTS[i]]} />
        ))}

        <View style={styles.content}>{children}</View>
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

/**
 * What is printed on the page.
 *
 * Faint by design — it says which game you are in at a glance and then
 * gets out of the way of the words. The red margin is the one line that
 * stays legible, because on a pad it is structure: everything is written
 * to the right of it.
 */
function Stock({ kind }: { kind: PaperStock }) {
  const isDark = useThemeStore((s) => s.isDark);
  const stockStyles = getStockStyles(getColors(isDark));

  if (kind === 'card') {
    return <View style={stockStyles.fill} pointerEvents="none" />;
  }

  if (kind === 'grid') {
    return (
      <View style={stockStyles.fill} pointerEvents="none">
        {Array.from({ length: 20 }, (_, i) => (
          <View key={`h${i}`} style={[stockStyles.rule, { top: 12 + i * RULE_HEIGHT }]} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <View key={`v${i}`} style={[stockStyles.ruleV, { left: i * RULE_HEIGHT }]} />
        ))}
      </View>
    );
  }

  if (kind === 'ticket') {
    return (
      <View style={stockStyles.fill} pointerEvents="none">
        {Array.from({ length: 16 }, (_, i) => (
          <View key={`l${i}`} style={[stockStyles.perf, { left: -5, top: 22 + i * RULE_HEIGHT }]} />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <View key={`r${i}`} style={[stockStyles.perf, { right: -5, top: 22 + i * RULE_HEIGHT }]} />
        ))}
      </View>
    );
  }

  return (
    <View style={stockStyles.fill} pointerEvents="none">
      {Array.from({ length: 20 }, (_, i) => (
        <View key={i} style={[stockStyles.rule, { top: 12 + i * RULE_HEIGHT }]} />
      ))}
      <View style={[stockStyles.margin, kind === 'foolscap' && stockStyles.marginBold]} />
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
    <Animated.View entering={newest ? ZoomIn.springify().damping(9) : undefined} style={style}>
      <Icon name="star" size={24} color={colors.ink} fill={colors.gold} strokeWidth={1.7} />
    </Animated.View>
  );
}

/** Where erased mistakes end up — spread out, like a real worked page. */
const SMUDGE_SPOTS: ViewStyle[] = [
  { top: 84, right: 30, transform: [{ rotate: '-14deg' }] },
  { bottom: 46, left: 34, transform: [{ rotate: '9deg' }] },
  { top: '48%', right: 14, transform: [{ rotate: '-5deg' }] },
];

const getStockStyles = (colors: any) =>
  StyleSheet.create({
    fill: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
    rule: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.line,
    },
    ruleV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: colors.lineSoft,
    },
    margin: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: MARGIN_X,
      width: 1.5,
      backgroundColor: colors.coral,
      opacity: 0.5,
    },
    /** Exam simulation rules its own margin harder — it is a real paper. */
    marginBold: { width: 2, opacity: 0.72 },
    perf: {
      position: 'absolute',
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.lineSoft,
    },
  });

const getStyles = (colors: any) =>
  StyleSheet.create({
    pad: {
      paddingTop: 11,
    },

    // --- the binding ------------------------------------------------------
    rings: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 18,
      marginBottom: -9,
      zIndex: 3,
    },
    ring: {
      width: 11,
      height: 20,
      borderRadius: 6,
      backgroundColor: RING,
      borderWidth: 1,
      borderColor: RING_EDGE,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 3,
      ...shadow.card,
    },
    ringHole: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: RING_HOLE,
    },

    // --- the page ---------------------------------------------------------
    page: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.edge,
      borderRadius: 4,
      overflow: 'hidden',
      paddingTop: 16,
      ...shadow.pop,
    },
    perforation: {
      position: 'absolute',
      top: 5,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    tooth: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.edge,
    },

    head: {
      alignItems: 'center',
      paddingTop: 8,
      gap: 4,
    },
    title: {
      fontFamily: font.hero,
      fontSize: 23,
      lineHeight: 28,
      color: colors.text,
    },
    underline: {
      height: 2.5,
      width: 74,
      borderRadius: 2,
      opacity: 0.7,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 18,
      paddingLeft: MARGIN_X + 10,
    },

    stamp: {
      position: 'absolute',
      top: 12,
      right: 11,
      borderWidth: 2,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      opacity: 0.42,
      transform: [{ rotate: '-8deg' }],
      zIndex: 2,
    },
    stampText: {
      fontFamily: font.bodyHeavy,
      fontSize: 8,
      letterSpacing: 1.1,
    },
    smudge: {
      position: 'absolute',
      width: 46,
      height: 14,
      borderRadius: 8,
      backgroundColor: 'rgba(39, 54, 43, 0.055)',
    },

    starShelf: {
      position: 'absolute',
      left: 12,
      bottom: -10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      zIndex: 4,
    },
    starMore: {
      fontFamily: font.hero,
      fontSize: 16,
      color: colors.gold,
      marginLeft: 2,
    },
  });
