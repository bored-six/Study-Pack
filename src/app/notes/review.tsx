import { Redirect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import type { Credits } from '@/lib/aiNotes';
import { SKIP_LABEL, type ParsedQuestion, type SkippedLine } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import { candy, font, getColors, outlineOn, radius, shadow, subjectInkFor, useThemeStore } from '@/theme/tokens';

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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const [editing, setEditing] = useState(false);

  const editAnswer = (previous: string, next: string) => {
    const answers = question.answers.map((a) => (a === previous ? next : a));
    const correctAnswer =
      question.correctAnswer === previous ? next : question.correctAnswer;
    onRevise(index, { answers, correctAnswer });
  };

  const definition = question.kind === 'definition';
  // Only a hand-written question is a definition with no line behind it.
  const own = definition && question.sourceLine == null;

  return (
    <View
      style={[
        styles.card,
        { transform: [{ rotate: index % 2 === 0 ? '-0.4deg' : '0.4deg' }] },
      ]}>
      <View style={styles.cardTop}>
        <View style={[styles.kindPill, definition ? styles.kindDef : styles.kindBlank]}>
          <Text style={[styles.kindText, definition ? styles.kindTextDef : styles.kindTextBlank]}>
            {own ? 'YOUR QUESTION' : definition ? 'DEFINITION' : 'FILL THE BLANK'}
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
        {question.answers.map((answer, i) => {
          const correct = answer === question.correctAnswer;
          const tone = candy[i % candy.length];
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
              <View style={[styles.letterChip, { backgroundColor: tone.wash }]}>
                <Text style={styles.letterChipText}>{String.fromCharCode(65 + i)}</Text>
              </View>
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

/**
 * The lines that produced nothing, and the one offer to go back over them.
 *
 * The offer lives here rather than on a tab or a screen of its own because
 * this is where the shortfall is already reported — a student meets it at the
 * moment they are looking at what they did not get, and nowhere else.
 *
 * Dumb on purpose: everything it needs arrives as props, so the panel can be
 * driven through all of its states in a test without a store behind it.
 */
function SkippedPanel({
  skipped,
  credits,
  busy,
  added,
  error,
  canRescue,
  onRescue,
}: {
  skipped: SkippedLine[];
  credits: Credits | null;
  busy: boolean;
  /** Questions the last reading added, or null if none has run. */
  added: number | null;
  error: string | null;
  canRescue: boolean;
  onRescue: () => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const [open, setOpen] = useState(false);

  // A reading that cleared every skipped line still has something to say, so
  // the card stays for its own outcome rather than vanishing with the list.
  if (skipped.length === 0 && added == null && error == null) return null;

  const spent = credits != null && credits.left <= 0;
  const done = added != null;

  const label = busy
    ? 'Reading your notes…'
    : spent
      ? 'Readings come back Monday'
      : 'Read these with Nib';

  const countLine =
    credits == null
      ? '10 readings a week'
      : `${credits.left} of ${credits.of} left this week`;

  return (
    <View style={styles.skipCard}>
      {skipped.length > 0 ? (
        <>
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
        </>
      ) : null}

      {canRescue ? (
        <View style={[styles.rescue, skipped.length === 0 && styles.rescueAlone]}>
          {done ? (
            // Read once per draft: asking again reads the same notes and
            // spends a second reading to hand back what is already on screen.
            <View style={styles.rescueNote}>
              <Icon name="check" size={17} color={colors.leaf} strokeWidth={2.6} />
              <Text style={styles.rescueNoteText}>
                {added === 0
                  ? 'Nothing more to pull out of these notes.'
                  : `Added ${added} question${added === 1 ? '' : 's'}.`}
                {credits != null ? ` ${credits.left} of ${credits.of} left this week.` : ''}
              </Text>
            </View>
          ) : (
            <>
              <ChunkyButton
                label={label}
                icon={busy ? 'pencil' : spent ? 'clock' : 'spark'}
                variant="soft"
                size="sm"
                disabled={busy || spent}
                onPress={onRescue}
              />
              <Text style={styles.rescueCount}>{countLine}</Text>
              {error != null ? (
                <View style={[styles.rescueNote, styles.rescueNoteWarn]}>
                  <Icon name="alert" size={17} color={colors.coral} strokeWidth={2.6} />
                  <Text style={[styles.rescueNoteText, styles.rescueNoteTextWarn]}>{error}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function ReviewNotesScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const insets = useSafeAreaInsets();
  const {
    draft,
    stats,
    subjects,
    targetId,
    setTarget,
    addSubject,
    reviseDraftQuestion,
    removeDraftQuestion,
    saveDraft,
    clearDraft,
    source,
    rescue,
    rescuing,
    rescueAdded,
    rescueError,
    credits,
  } = useNotesStore();
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  // With nothing to assign to yet, the student names their first subject
  // here rather than being sent back to make one before they can save.
  const naming = subjects.length === 0;
  const picked = subjects.find((s) => s.id === targetId) ?? null;
  const subjectName = naming ? firstName.trim() : (picked?.name ?? '');

  const handleSave = useCallback(() => {
    setSaving(true);
    const run = async () => {
      if (naming) await addSubject(firstName);
      await saveDraft();
      router.dismissAll();
    };
    run().catch((e: unknown) => {
      setSaving(false);
      setFailure(e instanceof Error ? e.message : 'Please try again.');
    });
  }, [addSubject, firstName, naming, saveDraft]);

  const handleDiscard = useCallback(() => {
    clearDraft();
    setDiscarding(false);
    router.dismissAll();
  }, [clearDraft]);

  // Only reachable straight after a parse.
  if (stats == null) {
    return <Redirect href="/" />;
  }

  const empty = draft.length === 0;
  const ready = !empty && subjectName.length > 0 && !saving;
  const saveLabel = empty
    ? 'Nothing to save'
    : subjectName.length > 0
      ? `Save to ${subjectName}`
      : naming
        ? 'Name your subject'
        : 'Pick a subject';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <RuledPaper />
      <View style={styles.navRow}>
        <Pressable
          onPress={() => setDiscarding(true)}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headText}>
          <Text style={styles.title}>
            {draft.length} question{draft.length === 1 ? '' : 's'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subjectName.length > 0 ? `for ${subjectName}` : 'from your notes'}
          </Text>
          <Squiggle width={84} style={styles.squiggle} />
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
          <View style={styles.header}>
            <View style={styles.saveTo}>
              <Tape />
              <Text style={styles.saveToLabel}>SAVING TO</Text>
              {naming ? (
                <>
                  <Text style={styles.saveToHint}>
                    No subjects yet — name the one these belong to.
                  </Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Biology"
                    placeholderTextColor={colors.textFaint}
                    style={styles.nameInput}
                    maxLength={40}
                    returnKeyType="done"
                  />
                </>
              ) : (
                <View style={styles.chips}>
                  {subjects.map((subject) => {
                    const active = subject.id === targetId;
                    const wash = subject.color ?? colors.accentWash;
                    return (
                      <Pressable
                        key={subject.id}
                        onPress={() => setTarget(subject.id)}
                        style={({ pressed }) => [
                          styles.chip,
                          active && { backgroundColor: wash, ...shadow.card },
                          pressed && !active && styles.pressed,
                        ]}>
                        {active ? (
                          <Icon
                            name="check"
                            size={13}
                            color={subjectInkFor(subject.color)}
                            strokeWidth={2.8}
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.chipText,
                            active && { color: subjectInkFor(subject.color) },
                          ]}>
                          {subject.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.note}>
              <Text style={styles.noteText}>
                Read these before saving. Revise anything that came out wrong, or remove it.
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <SkippedPanel
            skipped={stats.skipped}
            credits={credits}
            busy={rescuing}
            added={rescueAdded}
            error={rescueError}
            canRescue={source != null}
            onRescue={() => {
              void rescue();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyBadge}>
              <Icon name="sprout" size={26} color={colors.ink} fill={colors.accentWash} />
            </View>
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
          label={saveLabel}
          icon="check"
          size="lg"
          disabled={!ready}
          onPress={handleSave}
        />
      </View>

      <ConfirmModal
        visible={discarding}
        title="Discard these questions?"
        message="Your notes will not be saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscarding(false)}
        onConfirm={handleDiscard}
      />
      <ConfirmModal
        visible={failure != null}
        title="Could not save"
        message={failure ?? undefined}
        confirmLabel="Got it"
        onCancel={() => setFailure(null)}
      />
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
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
    ...outlineOn(colors),
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
  squiggle: {
    marginTop: 2,
  },
  header: {
    gap: 12,
  },
  saveTo: {
    gap: 8,
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.card,
    padding: 14,
    marginTop: 8,
    ...shadow.card,
  },
  saveToLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.textDim,
  },
  saveToHint: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: -2,
  },
  nameInput: {
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.control,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: font.heading,
    fontSize: 15.5,
    color: colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.textDim,
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
    ...outlineOn(colors),
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
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.edge,
    paddingHorizontal: 10,
    paddingVertical: 3,
    transform: [{ rotate: '-1.5deg' }],
  },
  kindDef: {
    backgroundColor: '#DBEEFB',
  },
  kindBlank: {
    backgroundColor: '#EAE2FA',
  },
  kindText: {
    fontFamily: font.bodyHeavy,
    fontSize: 9.5,
    letterSpacing: 1,
  },
  kindTextDef: {
    color: '#2E6FA3',
  },
  kindTextBlank: {
    color: '#6C51A8',
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
    gap: 9,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  letterChip: {
    width: 24,
    height: 24,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 7,
    borderBottomLeftRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  letterChipText: {
    fontFamily: font.hero,
    fontSize: 13,
    color: colors.ink,
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
  // The offer sits under a hairline, so it reads as a reply to the list above
  // rather than another item in it.
  rescue: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: colors.lineSoft,
    gap: 8,
  },
  /** Nothing was skipped, so there is no list to be separated from. */
  rescueAlone: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  rescueCount: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    textAlign: 'center',
  },
  rescueNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.leafWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.control,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  rescueNoteWarn: {
    backgroundColor: colors.coralWash,
  },
  rescueNoteText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.text,
  },
  rescueNoteTextWarn: {
    color: colors.text,
  },
  empty: {
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 4,
    ...shadow.card,
  },
  emptyBadge: {
    width: 52,
    height: 52,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 15,
    borderBottomLeftRadius: 19,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    transform: [{ rotate: '-3deg' }],
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
