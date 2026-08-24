import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ExamDebrief } from '@/components/ExamDebrief';
import { Icon } from '@/components/Icon';
import { buildDebrief, type NextStep } from '@/lib/debrief';
import { correctText, draftText, itemPrompt } from '@/lib/draft';
import { FORMAT_LABEL, type ExamFormat } from '@/lib/exam';
import { MODES } from '@/lib/mode';
import { useExamStore } from '@/store/exam';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function ExamResultsScreen() {
  const insets = useSafeAreaInsets();
  const {
    status,
    deck,
    mode,
    items,
    drafts,
    retired,
    results,
    deckAnswers,
    durationMs,
    reset,
  } = useExamStore();

  const byFormat = useMemo(() => {
    const map = new Map<ExamFormat, { right: number; total: number }>();
    for (const result of results) {
      const entry = map.get(result.format) ?? { right: 0, total: 0 };
      entry.total++;
      if (result.correct) entry.right++;
      map.set(result.format, entry);
    }
    return [...map.entries()];
  }, [results]);

  // deckAnswers is this subject's history as it stood when the sitting was
  // loaded, so it still says what the student knew walking in — that is what
  // makes "you fixed three you used to miss" possible to say at all.
  const debrief = useMemo(
    () => buildDebrief({ mode, items, results, history: deckAnswers, durationMs }),
    [mode, items, results, deckAnswers, durationMs]
  );

  if (status !== 'finished' || !deck) {
    return <Redirect href="/" />;
  }

  const spec = MODES[mode];
  const score = results.filter((r) => r.correct).length;
  const total = results.length;
  const pct = total === 0 ? 0 : Math.round((score / total) * 100);

  // The number that mattered depends on what you were playing. Survival is
  // about how long you lasted; mastery is about how much of the pile is
  // gone. Only a straight sitting is really about the score.
  const hero =
    spec.repetition === 'until_out'
      ? { big: String(total), small: `question${total === 1 ? '' : 's'} survived` }
      : spec.repetition === 'until_retired'
        ? { big: `${retired}/${items.length}`, small: 'retired from the pile' }
        : { big: `${score}/${total}`, small: `${pct}% correct` };

  const cleared = retired >= items.length;
  // The tone still colours the card; the words on it come from the debrief,
  // so the line at the top is about this paper rather than this bracket.
  const tone =
    spec.repetition === 'until_out'
      ? total >= 25
        ? { color: colors.leaf, wash: colors.leafWash }
        : total >= 12
          ? { color: colors.gold, wash: colors.goldWash }
          : { color: colors.coral, wash: colors.coralWash }
      : spec.repetition === 'until_retired'
        ? cleared
          ? { color: colors.leaf, wash: colors.leafWash }
          : { color: colors.gold, wash: colors.goldWash }
        : pct >= 80
          ? { color: colors.leaf, wash: colors.leafWash }
          : pct >= 50
            ? { color: colors.gold, wash: colors.goldWash }
            : { color: colors.coral, wash: colors.coralWash };

  /**
   * Sends the student where the note told them to go. Everything routes back
   * through the builder rather than starting a sitting from here: it reloads
   * the subject, and they get to see what they are about to sit.
   */
  const goNext = (next: NextStep) => {
    if (next.action === 'none') return;
    const deckId = deck.id;
    reset();
    router.replace({
      pathname: '/exam/[deckId]',
      params: {
        deckId,
        mode: next.action === 'format' ? 'relaxed' : next.action,
        ...(next.format ? { format: next.format } : {}),
      },
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20 }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={[styles.badge, { backgroundColor: tone.wash }]}>
            <Text style={[styles.badgeText, { color: tone.color }]}>{debrief.headline}</Text>
          </View>
          <Text style={styles.score}>{hero.big}</Text>
          <Text style={styles.pct}>{hero.small}</Text>
          <Text style={styles.meta}>
            {spec.name} · {deck.name} · {formatDuration(durationMs)}
          </Text>
          <Text style={styles.saved}>Saved to Progress on this device</Text>
        </View>

        <ExamDebrief debrief={debrief} onAction={goNext} />

        {spec.feedback === 'deferred' ? (
          <>
            <Text style={styles.breakdownLabel}>YOUR PAPER, MARKED</Text>
            <View style={styles.paper}>
              {items.map((item, i) => {
                const ok = results.find((r) => r.itemId === item.id)?.correct ?? false;
                return (
                  <View key={item.id} style={styles.paperRow}>
                    <View style={[styles.paperMark, ok ? styles.markGood : styles.markBad]}>
                      <Icon
                        name={ok ? 'check' : 'cross'}
                        size={11}
                        color={ok ? colors.leaf : colors.coral}
                        strokeWidth={3}
                      />
                    </View>
                    <View style={styles.paperText}>
                      <Text style={styles.paperPrompt} numberOfLines={3}>
                        {i + 1}. {itemPrompt(item)}
                      </Text>
                      <Text style={styles.paperYours} numberOfLines={2}>
                        You put: {draftText(item, drafts[item.id] ?? null)}
                      </Text>
                      {ok ? null : (
                        <Text style={styles.paperRight} numberOfLines={3}>
                          Answer: {correctText(item)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.breakdownLabel}>BY QUESTION TYPE</Text>
        <View style={styles.breakdown}>
          {byFormat.map(([format, entry]) => {
            const share = entry.right / entry.total;
            const color =
              share >= 0.8 ? colors.leaf : share >= 0.5 ? colors.gold : colors.coral;
            return (
              <View key={format} style={styles.breakRow}>
                <Text style={styles.breakName}>{FORMAT_LABEL[format]}</Text>
                <View style={styles.breakTrack}>
                  <View
                    style={[styles.breakFill, { width: `${share * 100}%`, backgroundColor: color }]}
                  />
                </View>
                <Text style={[styles.breakScore, { color }]}>
                  {entry.right}/{entry.total}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        <ChunkyButton
          label="Another exam"
          variant="soft"
          size="lg"
          onPress={() => {
            reset();
            router.replace({ pathname: '/exam/[deckId]', params: { deckId: deck.id } });
          }}
        />
        <ChunkyButton
          label="Done"
          size="lg"
          onPress={() => {
            reset();
            router.dismissAll();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  content: {
    paddingBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 26,
    alignItems: 'center',
    gap: 5,
    ...shadow.pop,
  },
  badge: {
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  badgeText: {
    fontFamily: font.hero,
    fontSize: 21,
    lineHeight: 26,
    textAlign: 'center',
  },
  score: {
    fontFamily: font.hero,
    fontSize: 54,
    lineHeight: 62,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pct: {
    fontFamily: font.bodyHeavy,
    fontSize: 15,
    color: colors.textDim,
  },
  meta: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: 10,
  },
  saved: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.accentDeep,
    marginTop: 8,
  },
  breakdownLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.textDim,
    marginTop: 24,
    marginBottom: 10,
  },
  paper: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    gap: 14,
    ...shadow.card,
  },
  paperRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  paperMark: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  markGood: {
    backgroundColor: colors.leafWash,
  },
  markBad: {
    backgroundColor: colors.coralWash,
  },
  paperText: {
    flex: 1,
    gap: 2,
  },
  paperPrompt: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  paperYours: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textDim,
  },
  paperRight: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.leaf,
  },
  breakdown: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
    ...shadow.card,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakName: {
    width: 108,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    color: colors.textDim,
  },
  breakTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  breakFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  breakScore: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    width: 34,
    textAlign: 'right',
  },
  actions: {
    paddingTop: 10,
    gap: 10,
  },
});
