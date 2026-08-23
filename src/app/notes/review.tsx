import { Redirect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import type { ParsedQuestion } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

function QuestionCard({
  question,
  index,
  onRemove,
}: {
  question: ParsedQuestion;
  index: number;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.kindPill}>
          <Text style={styles.kindText}>
            {question.kind === 'definition' ? 'DEFINITION' : 'FILL THE BLANK'}
          </Text>
        </View>
        <Pressable
          onPress={() => onRemove(index)}
          hitSlop={10}
          style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
          <Icon name="cross" size={13} color={colors.coral} strokeWidth={2.8} />
        </Pressable>
      </View>

      <Text style={styles.prompt}>{question.prompt}</Text>

      <View style={styles.options}>
        {question.answers.map((answer) => {
          const correct = answer === question.correctAnswer;
          return (
            <View key={answer} style={[styles.option, correct && styles.optionCorrect]}>
              <Text style={[styles.optionText, correct && styles.optionTextCorrect]}>
                {answer}
              </Text>
              {correct ? (
                <Icon name="check" size={13} color={colors.leaf} strokeWidth={2.8} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ReviewNotesScreen() {
  const insets = useSafeAreaInsets();
  const { draft, stats, title, removeDraftQuestion, saveDraft, clearDraft } = useNotesStore();
  const [saving, setSaving] = useState(false);

  // Only reachable straight after a parse.
  if (stats == null) {
    return <Redirect href="/" />;
  }

  const handleSave = useCallback(() => {
    setSaving(true);
    saveDraft()
      .then(() => router.dismissAll())
      .catch((e: unknown) => {
        setSaving(false);
        Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
      });
  }, [saveDraft]);

  const handleDiscard = useCallback(() => {
    Alert.alert('Discard these questions?', 'Your notes will not be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          clearDraft();
          router.dismissAll();
        },
      },
    ]);
  }, [clearDraft]);

  const empty = draft.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.navRow}>
        <Pressable
          onPress={handleDiscard}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headText}>
          <Text style={styles.title}>
            {draft.length} question{draft.length === 1 ? '' : 's'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            from {title}
          </Text>
        </View>
      </View>

      <FlatList
        data={draft}
        keyExtractor={(q, i) => `${i}-${q.prompt}`}
        renderItem={({ item, index }) => (
          <QuestionCard question={item} index={index} onRemove={removeDraftQuestion} />
        )}
        ListHeaderComponent={
          <View style={styles.note}>
            <Text style={styles.noteText}>
              Read these before saving — delete any that came out wrong.
              {stats.droppedForOptions > 0
                ? ` We skipped ${stats.droppedForOptions} fact${
                    stats.droppedForOptions === 1 ? '' : 's'
                  } we couldn't build options for.`
                : ''}
              {stats.linesSkipped > 0
                ? ` ${stats.linesSkipped} line${
                    stats.linesSkipped === 1 ? '' : 's'
                  } had nothing to quiz.`
                : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing left</Text>
            <Text style={styles.emptyBody}>
              You removed every question. Go back and paste different notes.
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <ChunkyButton
          label={empty ? 'Nothing to save' : `Save ${draft.length} question${draft.length === 1 ? '' : 's'}`}
          icon="check"
          size="lg"
          disabled={empty || saving}
          onPress={handleSave}
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backArrow: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 24,
    color: colors.ink,
  },
  headText: {
    flex: 1,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
  },
  note: {
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    padding: 12,
    marginBottom: 4,
  },
  noteText: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.gold,
  },
  list: {
    gap: 12,
    paddingBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
    ...shadow.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kindPill: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  kindText: {
    fontFamily: font.bodyHeavy,
    fontSize: 9.5,
    letterSpacing: 1,
    color: colors.textDim,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.coralWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prompt: {
    fontFamily: font.heading,
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.text,
  },
  options: {
    gap: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  optionCorrect: {
    backgroundColor: colors.leafWash,
  },
  optionText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.textDim,
  },
  optionTextCorrect: {
    fontFamily: font.bodyBold,
    color: colors.leaf,
  },
  empty: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 4,
    ...shadow.card,
  },
  emptyTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.textDim,
    textAlign: 'center',
  },
  footer: {
    paddingTop: 10,
  },
  pressed: {
    opacity: 0.75,
  },
});
