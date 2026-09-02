import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import type { ModeSpec, OutroKind } from '@/lib/mode';
import { playSfx, type SfxName } from '@/lib/sfx';
import { font, getColors, useThemeStore } from '@/theme/tokens';

/**
 * The last half-second of a sitting.
 *
 * Every mode used to close identically: the page tore upward and the
 * report card slid in, whether you had just cleared a mastery pile or run
 * out of lives on the third question. Those are not the same feeling, and
 * this is the most emotional moment in the app to be spending on a shrug.
 *
 * Each mode now ends on its own image. They are short — under three
 * quarters of a second — because an ending you sit through twice is
 * charming and one you sit through fifty times is a loading screen.
 */

const OUTRO_MS = 700;
/** The overlay covers the stage well before it is done, so the swap is hidden. */
const COVER_AT = 460;

/** What each ending sounds like, built from the sounds already in the app. */
const VOICE: Record<OutroKind, { first: SfxName; second?: SfxName; secondAt?: number }> = {
  tear: { first: 'tear' },
  pile: { first: 'sticker_peel', second: 'tier_up', secondAt: 260 },
  burnout: { first: 'tick', second: 'stamp', secondAt: 200 },
  seal: { first: 'stamp', second: 'tear', secondAt: 240 },
  lastheart: { first: 'wrong', second: 'tear', secondAt: 280 },
};

/** The words across the middle. Short — this is a beat, not a screen. */
const CAPTION: Record<OutroKind, string> = {
  tear: 'pencils down',
  pile: 'pile cleared',
  burnout: "time's up",
  seal: 'sealed',
  lastheart: 'out of lives',
};

interface Props {
  spec: ModeSpec;
  /** Covered — safe to navigate away underneath. */
  onCovered: () => void;
}

export function ModeOutro({ spec, onCovered }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const reduced = useReducedMotion();
  /** One ending per sitting, for the same reason the load needed one. */
  const started = useRef(false);

  /** Drives the mode's own image, 0 → 1. */
  const play = useSharedValue(0);
  /** The wash closing over the stage. */
  const cover = useSharedValue(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (reduced) {
      onCovered();
      return;
    }

    const voice = VOICE[spec.outro];
    playSfx(voice.first);
    if (voice.second) setTimeout(() => playSfx(voice.second!), voice.secondAt ?? 250);

    play.value = withTiming(1, { duration: OUTRO_MS, easing: Easing.out(Easing.cubic) });
    cover.value = withDelay(
      140,
      withTiming(1, { duration: COVER_AT, easing: Easing.inOut(Easing.quad) })
    );

    // The handover is a timer, not an animation callback — a dropped frame
    // must never be the reason a finished sitting fails to leave.
    const covered = setTimeout(onCovered, 140 + COVER_AT);
    return () => clearTimeout(covered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: cover.value,
    transform: [{ translateY: (1 - cover.value) * 10 }],
  }));

  return (
    <View style={styles.fill} pointerEvents="none" accessibilityElementsHidden>
      <Animated.View
        style={[styles.cover, { backgroundColor: spec.wash }, coverStyle]}
      />

      <View style={styles.centre}>
        <Figure kind={spec.outro} spec={spec} play={play} colors={colors} />
        <Animated.Text style={[styles.caption, { color: spec.ink }, captionStyle]}>
          {CAPTION[spec.outro]}
        </Animated.Text>
      </View>
    </View>
  );
}

/** The image itself, one per ending. */
function Figure({
  kind,
  spec,
  play,
  colors,
}: {
  kind: OutroKind;
  spec: ModeSpec;
  play: SharedValue<number>;
  colors: any;
}) {
  const styles = getStyles(colors);

  // --- the last card lifts off the pile --------------------------------
  const lift = useAnimatedStyle(() => ({
    transform: [
      { translateY: -play.value * 62 },
      { rotate: `${play.value * 13}deg` },
      { scale: 1 + play.value * 0.08 },
    ],
    opacity: 1 - play.value * 0.75,
  }));

  // --- the fuse runs out ------------------------------------------------
  const burn = useAnimatedStyle(() => ({ width: `${Math.max(0, 1 - play.value) * 100}%` }));
  const spark = useAnimatedStyle(() => ({
    left: `${Math.max(0, 1 - play.value) * 100}%`,
    opacity: play.value > 0.92 ? 0 : 1,
    transform: [{ scale: 1 + Math.sin(play.value * 12) * 0.25 }],
  }));

  // --- the stamp comes down --------------------------------------------
  const press = useAnimatedStyle(() => ({
    transform: [
      { scale: 2.2 - Math.min(play.value * 3.4, 1.2) },
      { rotate: `${-16 + Math.min(play.value * 3.4, 1) * 8}deg` },
    ],
    opacity: Math.min(play.value * 4, 1),
  }));

  // --- the last heart breaks -------------------------------------------
  const leftHalf = useAnimatedStyle(() => ({
    transform: [
      { translateX: -play.value * 26 },
      { translateY: play.value * 30 },
      { rotate: `${-play.value * 34}deg` },
    ],
    opacity: 1 - play.value * 0.6,
  }));
  const rightHalf = useAnimatedStyle(() => ({
    transform: [
      { translateX: play.value * 26 },
      { translateY: play.value * 34 },
      { rotate: `${play.value * 38}deg` },
    ],
    opacity: 1 - play.value * 0.6,
  }));

  // --- the page tears off ----------------------------------------------
  const tear = useAnimatedStyle(() => ({
    transform: [
      { translateY: -play.value * 190 },
      { rotate: `${-play.value * 9}deg` },
    ],
    opacity: 1 - play.value * 0.55,
  }));

  switch (kind) {
    case 'pile':
      return (
        <View style={styles.figure}>
          {/* what stays behind: an empty table */}
          <View style={[styles.cardBack, { borderColor: spec.edge, opacity: 0.28 }]} />
          <Animated.View
            style={[styles.card, { borderColor: spec.edge, backgroundColor: colors.surface }, lift]}>
            <Icon name="check" size={26} color={spec.ink} strokeWidth={3} />
          </Animated.View>
        </View>
      );

    case 'burnout':
      return (
        <View style={styles.figure}>
          <View style={[styles.fuseTrack, { borderColor: spec.edge }]}>
            <Animated.View style={[styles.fuseFill, { backgroundColor: spec.ink }, burn]} />
            <Animated.View style={[styles.spark, { backgroundColor: colors.coral }, spark]} />
          </View>
        </View>
      );

    case 'seal':
      return (
        <View style={styles.figure}>
          <Animated.View style={[styles.sealBox, { borderColor: spec.ink }, press]}>
            <Text style={[styles.sealText, { color: spec.ink }]}>{spec.stamp}</Text>
          </Animated.View>
        </View>
      );

    case 'lastheart':
      return (
        <View style={styles.figure}>
          <Animated.View style={[styles.half, leftHalf]}>
            <Icon name="heart" size={54} color={colors.coral} fill={colors.coralWash} strokeWidth={2} />
          </Animated.View>
          <Animated.View style={[styles.half, styles.halfRight, rightHalf]}>
            <Icon name="heart" size={54} color={colors.coral} fill={colors.coralWash} strokeWidth={2} />
          </Animated.View>
        </View>
      );

    default:
      return (
        <View style={styles.figure}>
          <Animated.View
            style={[styles.page, { borderColor: spec.edge, backgroundColor: colors.surface }, tear]}>
            <View style={[styles.pageRule, { backgroundColor: spec.edge }]} />
            <View style={[styles.pageRule, { backgroundColor: spec.edge, width: '55%' }]} />
            <View style={[styles.pageRule, { backgroundColor: spec.edge, width: '72%' }]} />
          </Animated.View>
        </View>
      );
  }
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    fill: {
      ...StyleSheet.absoluteFill,
      zIndex: 80,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cover: {
      ...StyleSheet.absoluteFill,
    },
    centre: {
      alignItems: 'center',
      gap: 14,
    },
    figure: {
      width: 130,
      height: 108,
      alignItems: 'center',
      justifyContent: 'center',
    },
    caption: {
      fontFamily: font.hero,
      fontSize: 26,
      lineHeight: 30,
    },

    // pile
    card: {
      width: 74,
      height: 54,
      borderWidth: 2,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBack: {
      position: 'absolute',
      width: 74,
      height: 54,
      borderWidth: 2,
      borderRadius: 9,
      borderStyle: 'dashed',
    },

    // burnout
    fuseTrack: {
      width: 118,
      height: 14,
      borderWidth: 2,
      borderRadius: 999,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    fuseFill: {
      height: '100%',
    },
    spark: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: 6,
      marginLeft: -6,
    },

    // seal
    sealBox: {
      borderWidth: 3,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    sealText: {
      fontFamily: font.bodyHeavy,
      fontSize: 14,
      letterSpacing: 1.6,
    },

    // last heart
    half: {
      position: 'absolute',
      width: 27,
      overflow: 'hidden',
    },
    halfRight: {
      alignItems: 'flex-end',
    },

    // tear
    page: {
      width: 78,
      height: 62,
      borderWidth: 2,
      borderRadius: 8,
      padding: 9,
      gap: 6,
    },
    pageRule: {
      height: 3,
      borderRadius: 2,
      opacity: 0.4,
      width: '85%',
    },
  });
