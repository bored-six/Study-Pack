import { Redirect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { SKIP_LABEL, type ParsedQuestion, type SkippedLine } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

function QuestionCard({
  question,
  index,
  onRevise,
  onRemove,
}: {
  question: ParsedQuestion;
  index: number;
  onRevise: (index: number, patch: Partial<ParsedQuestion>) => void;
  onRemove: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  const editAnswer = (previous: string, next: string) => {
    const answers = question.answers.map((a) => (a === previous ? next : a));
    const correctAnswer =
      question.correctAnswer === previous ? next : question.correctAnswer;
    onRevise(index, { answers, correctAnswer });
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.kindPill}>
          <Text style={styles.kindText}>
            {question.kind === 'definition' ? 'DEFINITION' : 'FILL THE BLANK'}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => setEditing((v) => !v)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              editing && styles.iconBtnActive,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.iconBtnText}>{editing ? 'Done' : 'Revise'}</Text>
          </Pressable>
          <Pressable
            onPress={() => onRemove(index)}
            hitSlop={8}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
            <Icon name="cross" size={13} color={colors.coral} strokeWidth={2.8} />
          </Pressable>
        </View>
      </View>

      {editing ? (
        <TextInput
          value={question.prompt}
          onChangeText={(prompt) => onRevise(index, { prompt })}
          style={styles.promptInput}
          multiline
        />
      ) : (
        <Text style={styles.prompt}>{question.prompt}</Text>
      )}

      <View style={styles.options}>
        {question.answers.map((answer) => {
          const correct = answer === question.correctAnswer;
          return editing ? (
            <View key={answer} style={styles.optionEditRow}>
              <Pressable
                onPress={() => onRevise(index, { correctAnswer: answer })}
                hitSlop={6}
                style={[styles.mark, correct && styles.markCorrect]}>
                {correct ? (
                  <Icon name="check" size={11} color={colors.leaf} strokeWidth={3} />
                ) : null}
              </Pressable>
              <TextInput
                value={answer}
                onChangeText={(next) => editAnswer(answer, next)}
                style={[styles.optionInput, correct && styles.optionInputCorrect]}
              />
            </View>
          ) : (
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

      {editing ? (
        <Text style={styles.editHint}>Tap a circle to mark the correct answer.</Text>
      ) : null}
    </View>
  );
}

function SkippedPanel({ skipped }: { skipped: SkippedLine[] }) {
  const [open, setOpen] = useState(false);
  if (skipped.length === 0) return null;

  return (
    <View style={styles.skipCard}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.skipHead, pressed && styles.pressed]}>
        <Text style={styles.skipTitle}>
          Skipped {skipped.length} line{skipped.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.skipToggle}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.skipList}>
          {skipped.map((line, i) => (
            <View key={`${i}-${line.text}`} style={styles.skipRow}>
              <Text style={styles.skipText} numberOfLines={2}>
                "{line.text}"
              </Text>
              <Text style={styles.skipReason}>{SKIP_LABEL[line.reason]}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.skipHint}>
          These didn't have a clear fact to test — tap Show to see them.
        </Text>
      )}
    </View>
  );
}

export default function ReviewNotesScreen() {
  const insets = useSafeAreaInsets();
  const { draft, stats, subjects, targetId, reviseDraftQuestion, removeDraftQuestion, saveDraft, clearDraft } =
    useNotesStore();
  const [saving, setSaving] = useState(false);

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

  // Only reachable straight after a parse.
  if (stats == null) {
    return <Redirect href="/" />;
  }

  const subjectName = subjects.find((s) => s.id === targetId)?.name ?? 'your notes';
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
            for {subjectName}
          </Text>
        </View>
      </View>

      <FlatList
        data={draft}
        keyExtractor={(q, i) => `${i}-${q.sourceLine}`}
        renderItem={({ item, index }) => (
          <QuestionCard
            question={item}
            index={index}
            onRevise={reviseDraftQuestion}
            onRemove={removeDraftQuestion}
          />
        )}
        ListHeaderComponent={
          <View style={styles.note}>
            <Text style={styles.noteText}>
              Read these before saving. Revise anything that came out wrong, or remove it.
            </Text>
          </View>
        }
        ListFooterComponent={<SkippedPanel skipped={stats.skipped} />}
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
        keyboardShouldPersistTaps="handled"
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <ChunkyButton
          label={empty ? 'Nothing to save' : `Save to ${subjectName}`}
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  iconBtn: {
    backgroundColor: colors.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  iconBtnActive: {
    backgroundColor: colors.accent,
  },
  iconBtnText: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    color: colors.accentDeep,
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
  promptInput: {
    fontFamily: font.heading,
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.text,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
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
  optionEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markCorrect: {
    backgroundColor: colors.leafWash,
    borderColor: colors.leaf,
  },
  optionInput: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.text,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  optionInputCorrect: {
    backgroundColor: colors.leafWash,
    fontFamily: font.bodyBold,
    color: colors.leaf,
  },
  editHint: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  skipCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.card,
    padding: 13,
    marginTop: 4,
  },
  skipHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipTitle: {
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.textDim,
  },
  skipToggle: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.accentDeep,
  },
  skipHint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 4,
  },
  skipList: {
    marginTop: 10,
    gap: 9,
  },
  skipRow: {
    gap: 1,
  },
  skipText: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
    fontStyle: 'italic',
  },
  skipReason: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    color: colors.coral,
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
