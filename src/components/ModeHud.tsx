import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PageCount, PencilProgress } from '@/components/deskdress';
import { Icon } from '@/components/Icon';
import { SURVIVAL_STRIKES, type ModeSpec } from '@/lib/mode';
import { font, getColors, radius, useThemeStore } from '@/theme/tokens';

/**
 * What the run screen says about where you are.
 *
 * Every mode used to share one readout — a pencil bar and "3 / 12" — which
 * is a lie in three of the five. Mastery's paper has no fixed length,
 * survival's has no end at all, and a sprint cares about the seconds on
 * this question rather than the position in the stack. Each mode now gets
 * the number it is actually being judged on.
 */

export interface HudState {
  /** 0..1, for the modes that walk a paper of known length. */
  progress: number;
  combo: number;
  /** Zero-based position in the paper. */
  index: number;
  total: number;
  /** Mastery: cards still in the pile, and cards retired out of it. */
  remaining: number;
  retired: number;
  /** Survival: misses so far, and questions answered. */
  strikes: number;
  answered: number;
  /** Milliseconds left on the whole paper, or null when there is no paper clock. */
  paperLeft: number | null;
  /** Seconds left on this question, or null when there is no question clock. */
  questionLeft: number | null;
}

export function clockText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function ModeHud({
  spec,
  state,
  style,
}: {
  spec: ModeSpec;
  state: HudState;
  style?: StyleProp<ViewStyle>;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  switch (spec.hud) {
    // --- mastery: the pile is the progress -------------------------------
    case 'pile': {
      const total = Math.max(1, state.remaining + state.retired);
      return (
        <View style={[styles.row, style]} accessibilityLabel={`${state.remaining} cards left in the pile`}>
          <Stack remaining={state.remaining} ink={spec.ink} edge={spec.edge} />
          <View style={styles.pileText}>
            <Text style={[styles.big, { color: spec.ink }]}>{state.remaining}</Text>
            <Text style={styles.small}>in the pile</Text>
          </View>
          <View style={styles.spacer} />
          <View style={[styles.pill, { backgroundColor: spec.wash, borderColor: spec.edge }]}>
            <Icon name="check" size={12} color={spec.ink} strokeWidth={2.6} />
            <Text style={[styles.pillText, { color: spec.ink }]}>
              {state.retired}/{total} learned
            </Text>
          </View>
        </View>
      );
    }

    // --- rapid: the seconds on this one ----------------------------------
    case 'fuse': {
      const seconds = state.questionLeft ?? 0;
      const low = seconds <= 5;
      return (
        <View style={[styles.row, style]} accessibilityLabel={`${seconds} seconds left`}>
          <View
            style={[
              styles.timerBox,
              { borderColor: low ? colors.coral : spec.edge, backgroundColor: low ? colors.coralWash : spec.wash },
            ]}>
            <Icon
              name="bolt"
              size={14}
              color={low ? colors.coral : spec.ink}
              fill={low ? colors.surface : '#FFFFFF'}
              strokeWidth={2.2}
            />
            <Text style={[styles.timerNum, { color: low ? colors.coral : spec.ink }]}>{seconds}</Text>
            <Text style={[styles.timerUnit, { color: low ? colors.coral : spec.ink }]}>s</Text>
          </View>
          <View style={styles.spacer} />
          <PageCount count={state.index + 1} total={state.total} />
        </View>
      );
    }

    // --- simulation: one clock, and how much of the paper is filled in ---
    case 'paper': {
      const left = state.paperLeft ?? 0;
      const low = left < 60_000;
      return (
        <View style={[styles.row, style]} accessibilityLabel={`${clockText(left)} left on the paper`}>
          <View
            style={[
              styles.timerBox,
              { borderColor: low ? colors.coral : spec.edge, backgroundColor: low ? colors.coralWash : spec.wash },
            ]}>
            <Icon
              name="clock"
              size={14}
              color={low ? colors.coral : spec.ink}
              strokeWidth={2.2}
            />
            <Text style={[styles.timerClock, { color: low ? colors.coral : spec.ink }]}>
              {clockText(left)}
            </Text>
          </View>
          <View style={styles.spacer} />
          <View style={[styles.pill, { backgroundColor: spec.wash, borderColor: spec.edge }]}>
            <Text style={[styles.pillText, { color: spec.ink }]}>
              {state.answered}/{state.total} filled in
            </Text>
          </View>
          <PageCount count={state.index + 1} total={state.total} />
        </View>
      );
    }

    // --- survival: lives, and how far you got ----------------------------
    case 'lives': {
      return (
        <View
          style={[styles.row, style]}
          accessibilityLabel={`${SURVIVAL_STRIKES - state.strikes} lives left`}>
          <View style={styles.hearts}>
            {Array.from({ length: SURVIVAL_STRIKES }, (_, i) => {
              const alive = i < SURVIVAL_STRIKES - state.strikes;
              return (
                <Icon
                  key={i}
                  name="heart"
                  size={19}
                  color={alive ? colors.coral : colors.disabledText}
                  fill={alive ? colors.coralWash : 'none'}
                  strokeWidth={2}
                />
              );
            })}
          </View>
          <View style={styles.spacer} />
          <View style={[styles.pill, { backgroundColor: spec.wash, borderColor: spec.edge }]}>
            <Icon name="spark" size={12} color={spec.ink} strokeWidth={2.2} />
            <Text style={[styles.pillText, { color: spec.ink }]}>
              {state.answered} survived
            </Text>
          </View>
        </View>
      );
    }

    // --- relaxed: the pencil walks the page ------------------------------
    default:
      return (
        <View
          style={[styles.row, style]}
          accessibilityLabel={`${spec.unit} ${state.index + 1} of ${state.total}`}>
          <PencilProgress progress={state.progress} combo={state.combo} />
          <PageCount count={state.index + 1} total={state.total} />
        </View>
      );
  }
}

/**
 * The pile, drawn as edges of stacked cards. Caps at six so a 40-card pile
 * doesn't push the rest of the header off the screen.
 */
function Stack({ remaining, ink, edge }: { remaining: number; ink: string; edge: string }) {
  const shown = Math.min(Math.max(remaining, 0), 6);
  return (
    <View style={stackStyles.wrap} pointerEvents="none">
      {Array.from({ length: shown }, (_, i) => (
        <View
          key={i}
          style={[
            stackStyles.card,
            {
              borderColor: edge,
              backgroundColor: i === shown - 1 ? ink : '#FFFFFF',
              bottom: i * 2.5,
              left: i * 1.5,
              opacity: 0.4 + (i / Math.max(1, shown - 1)) * 0.6,
            },
          ]}
        />
      ))}
    </View>
  );
}

const stackStyles = StyleSheet.create({
  wrap: {
    width: 26,
    height: 24,
    justifyContent: 'flex-end',
  },
  card: {
    position: 'absolute',
    width: 18,
    height: 13,
    borderWidth: 1.5,
    borderRadius: 3,
  },
});

const getStyles = (colors: any) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    spacer: {
      flex: 1,
    },
    pileText: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    big: {
      fontFamily: font.hero,
      fontSize: 22,
      lineHeight: 26,
      fontVariant: ['tabular-nums'],
    },
    small: {
      fontFamily: font.bodySemibold,
      fontSize: 10.5,
      color: colors.textDim,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1.5,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    pillText: {
      fontFamily: font.bodyHeavy,
      fontSize: 10.5,
      fontVariant: ['tabular-nums'],
    },
    timerBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 2,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    timerNum: {
      fontFamily: font.hero,
      fontSize: 22,
      lineHeight: 26,
      fontVariant: ['tabular-nums'],
    },
    timerUnit: {
      fontFamily: font.bodyHeavy,
      fontSize: 11,
      marginLeft: -2,
    },
    timerClock: {
      fontFamily: font.hero,
      fontSize: 19,
      lineHeight: 24,
      fontVariant: ['tabular-nums'],
    },
    hearts: {
      flexDirection: 'row',
      gap: 4,
    },
  });
