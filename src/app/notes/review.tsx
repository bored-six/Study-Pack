import { Redirect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { SKIP_LABEL, type ParsedQuestion, type SkippedLine } from '@/lib/noteParser';
import { flagsFor, severityOf, type Flag } from '@/lib/questionFlags';
import { playSfx } from '@/lib/sfx';
import { useNotesStore } from '@/store/notes';
import {
  candy,
  derpRadius,
  font,
  getColors,
  onWash,
  outlineOn,
  radius,
  shadow,
  subjectInkFor,
  useThemeStore,
} from '@/theme/tokens';

/** Nib's own colour, fixed in both themes the way his own screen keeps it. */
const PERI = '#E3E7FB';

/**
 * What each kind of question is called, and the colour it wears.
 *
 * Three, not two. Nib writes definitions, fill-the-blanks AND lists; this
 * screen used to ask one question — "is it a definition?" — and label
 * everything else a fill-the-blank, so every list he wrote came out wrong.
 *
 * The washes are candy entries: fixed pastels in both themes, which is why
 * the ink on top of them is the fixed onWash ink and not the page's.
 */
const KIND_PILL = {
  definition: { label: 'DEFINITION', tone: candy[3] },
  cloze: { label: 'FILL THE BLANK', tone: candy[4] },
  enumeration: { label: 'LIST', tone: candy[1] },
} as const;

/** Stable across removals, unlike an index. */
function keyOf(q: ParsedQuestion): string {
  return `${q.prompt} ${q.correctAnswer}`;
}

/* -------------------------------------------------------------------------
 * One question
 * ---------------------------------------------------------------------- */

function QuestionCard({
  question,
  index,
  flag,
  onRevise,
  onRemove,
  onSettle,
}: {
  question: ParsedQuestion;
  index: number;
  /** Present only while Nib still has a doubt the student has not settled. */
  flag?: Flag | null;
  onRevise: (index: number, patch: Partial<ParsedQuestion>) => void;
  onRemove: (index: number) => void;
  /** Called when the student accepts it as it is, which retires the flag. */
  onSettle?: () => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const [editing, setEditing] = useState(false);

  const editAnswer = (previous: string, next: string) => {
    const answers = question.answers.map((a) => (a === previous ? next : a));
    const correctAnswer = question.correctAnswer === previous ? next : question.correctAnswer;
    onRevise(index, { answers, correctAnswer });
  };

  const definition = question.kind === 'definition';
  // A list is every item, all of them right — never four options with one
  // winner — so it cannot be drawn as multiple choice.
  const listed = question.kind === 'enumeration';
  const own = definition && question.sourceLine == null;
  const pill = KIND_PILL[question.kind] ?? KIND_PILL.definition;
  const flagged = flag != null;

  return (
    <View style={[styles.card, flagged && styles.cardFlagged]}>
      {flagged ? <Tape rotate="6deg" style={styles.tapeFlag} /> : null}

      <View style={styles.cardTop}>
        <View style={[styles.kindPill, { backgroundColor: pill.tone.wash }]}>
          <Text style={[styles.kindText, { color: pill.tone.ink }]}>
            {own ? 'YOUR QUESTION' : pill.label}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => setEditing((v) => !v)}
            hitSlop={8}
            accessibilityLabel={editing ? 'Done editing' : 'Revise this question'}
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
            accessibilityLabel="Remove this question"
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

      {/*
        His doubt, in his own hand, above the options rather than below them.
        A warning printed under the thing it warns about has already been
        missed by the time it is read.
      */}
      {flagged ? (
        <View style={styles.why}>
          <Icon name="alert" size={15} color={colors.coral} strokeWidth={2.5} />
          <Text style={styles.whyText}>{flag.says}</Text>
        </View>
      ) : null}

      <View style={styles.options}>
        {listed
          ? question.answers.map((item, i) =>
              editing ? (
                <View key={`${i}-${item}`} style={styles.optionEditRow}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>
                      {question.ordered === true ? i + 1 : '•'}
                    </Text>
                  </View>
                  <TextInput
                    value={item}
                    onChangeText={(next) => editAnswer(item, next)}
                    style={styles.optionInput}
                  />
                </View>
              ) : (
                <View key={`${i}-${item}`} style={styles.option}>
                  <View style={styles.bullet}>
                    <Text style={styles.bulletText}>
                      {question.ordered === true ? i + 1 : '•'}
                    </Text>
                  </View>
                  <Text style={styles.optionText}>{item}</Text>
                </View>
              )
            )
          : question.answers.map((answer, i) => {
              const correct = answer === question.correctAnswer;
              // The option he is worried about wears the worry, so the student
              // looks at the right line rather than re-reading the whole card.
              const culprit = flag?.culprit === answer;
              const tone = candy[i % candy.length];
              return editing ? (
                <View key={answer} style={styles.optionEditRow}>
                  <Pressable
                    onPress={() => onRevise(index, { correctAnswer: answer })}
                    hitSlop={6}
                    accessibilityLabel={`Mark "${answer}" as the correct answer`}
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
                <View
                  key={answer}
                  style={[
                    styles.option,
                    correct && styles.optionCorrect,
                    culprit && styles.optionCulprit,
                  ]}>
                  <View style={[styles.letterChip, { backgroundColor: tone.wash }]}>
                    <Text style={styles.letterChipText}>{String.fromCharCode(65 + i)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      correct && styles.optionTextCorrect,
                      culprit && styles.optionTextCulprit,
                    ]}>
                    {answer}
                  </Text>
                  {correct ? (
                    <Icon name="check" size={13} color={colors.leaf} strokeWidth={2.8} />
                  ) : null}
                </View>
              );
            })}
      </View>

      {listed ? (
        <Text style={styles.editHint}>
          {question.ordered === true
            ? 'All of these, in this order.'
            : 'All of these, in any order.'}
        </Text>
      ) : editing ? (
        <Text style={styles.editHint}>Tap a circle to mark the correct answer.</Text>
      ) : null}

      {/*
        Only a flagged card gets a verdict row. An unflagged one already has
        Revise and remove, and a third button would be a third way to do the
        same two things.
      */}
      {flagged && !editing ? (
        <View style={styles.verdictRow}>
          <Pressable
            onPress={() => onRemove(index)}
            accessibilityLabel="Bin this question"
            style={({ pressed }) => [styles.vAct, styles.vBin, pressed && styles.pressed]}>
            <Text style={styles.vBinText}>Bin</Text>
          </Pressable>
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityLabel="Fix this question"
            style={({ pressed }) => [styles.vAct, styles.vFix, pressed && styles.pressed]}>
            <Text style={styles.vFixText}>Fix</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              playSfx('tap');
              onSettle?.();
            }}
            accessibilityLabel="Keep this question as it is"
            style={({ pressed }) => [styles.vAct, styles.vKeep, pressed && styles.pressed]}>
            <Icon name="check" size={13} color={onWash.ink} strokeWidth={3} />
            <Text style={styles.vKeepText}>Keep</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------
 * The ones he is sure about — one object until asked otherwise
 * ---------------------------------------------------------------------- */

function SureStack({
  questions,
  open,
  onToggle,
  onOpenOne,
  openedKey,
  renderOpen,
}: {
  questions: { q: ParsedQuestion; index: number }[];
  open: boolean;
  onToggle: () => void;
  onOpenOne: (index: number) => void;
  /** Which row, if any, has been pulled open into a full card. */
  openedKey: string | null;
  renderOpen: (q: ParsedQuestion, index: number) => React.ReactNode;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
  if (questions.length === 0) return null;

  if (!open) {
    return (
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Open the ${questions.length} he is sure about`}
        style={({ pressed }) => [styles.stackWrap, pressed && styles.pressed]}>
        {/* Two blank leaves behind it, so a stack reads as a stack. */}
        <View style={[styles.stackLeaf, styles.stackLeaf3]} />
        <View style={[styles.stackLeaf, styles.stackLeaf2]} />
        <View style={styles.stackFront}>
          <Text style={styles.stackNum}>{questions.length}</Text>
          <Text style={styles.stackText}>he&apos;d stake his allowance on</Text>
          <Text style={styles.stackOpen}>Open</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.fan}>
      {questions.map(({ q, index }) => {
        const pill = KIND_PILL[q.kind] ?? KIND_PILL.definition;
        // Opening a row swaps the card in where the row was. Rendering it
        // below the list instead meant tapping the twelfth of fifteen put
        // the card somewhere off the bottom of the screen.
        if (keyOf(q) === openedKey) {
          return <View key={keyOf(q)}>{renderOpen(q, index)}</View>;
        }
        return (
          <Pressable
            key={keyOf(q)}
            onPress={() => onOpenOne(index)}
            accessibilityLabel={`Open "${q.prompt}"`}
            style={({ pressed }) => [styles.fanRow, pressed && styles.pressed]}>
            <View style={[styles.fanStripe, { backgroundColor: pill.tone.ink }]} />
            <View style={styles.fanMid}>
              <Text style={styles.fanQ} numberOfLines={1}>
                {q.prompt}
              </Text>
              <Text style={styles.fanA} numberOfLines={1}>
                {q.kind === 'enumeration' ? q.answers.join(' · ') : q.correctAnswer}
              </Text>
            </View>
            <View style={styles.fanBox}>
              <Icon name="check" size={11} color={onWash.ink} strokeWidth={3} />
            </View>
          </Pressable>
        );
      })}
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.fanClose, pressed && styles.pressed]}>
        <Text style={styles.stackOpen}>Close these</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The lines the scan produced nothing from, and why.
 *
 * It used to carry an offer to read them with Nib. That offer now lives in
 * two better places — the banner on Add notes, and Nib's own screen. A
 * student reviewing questions is finishing a job, not starting another.
 */
function SkippedPanel({ skipped }: { skipped: SkippedLine[] }) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
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
                &quot;{line.text}&quot;
              </Text>
              <Text style={styles.skipReason}>{SKIP_LABEL[line.reason]}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.skipHint}>
          These didn&apos;t have a clear fact to test — tap Show to see them.
        </Text>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------
 * The screen
 * ---------------------------------------------------------------------- */

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
  } = useNotesStore();

  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [stackOpen, setStackOpen] = useState(false);
  /**
   * Questions the student has looked at and kept anyway.
   *
   * Keyed by content rather than position, because binning one shifts every
   * index after it and a settled flag must not jump to its neighbour.
   */
  const [settled, setSettled] = useState<Set<string>>(new Set());
  /** One of the sure ones, pulled out of the stack to be read properly. */
  const [opened, setOpened] = useState<string | null>(null);

  const flags = useMemo(() => flagsFor(draft), [draft]);

  const { worth, sure } = useMemo(() => {
    const worthLooking: { q: ParsedQuestion; index: number; flag: Flag }[] = [];
    const heIsSure: { q: ParsedQuestion; index: number }[] = [];
    draft.forEach((q, index) => {
      const flag = flags[index];
      if (flag != null && !settled.has(keyOf(q))) worthLooking.push({ q, index, flag });
      else heIsSure.push({ q, index });
    });
    // Worst first. In a pile of five, the order is most of the value — a
    // question nobody can answer should not sit under three that are merely
    // built off a short line.
    worthLooking.sort((a, b) => severityOf(a.flag) - severityOf(b.flag));
    return { worth: worthLooking, sure: heIsSure };
  }, [draft, flags, settled]);

  const naming = subjects.length === 0;
  const picked = subjects.find((s) => s.id === targetId) ?? null;
  const subjectName = naming ? firstName.trim() : (picked?.name ?? '');

  const settle = useCallback((q: ParsedQuestion) => {
    setSettled((prev) => new Set(prev).add(keyOf(q)));
  }, []);

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
  if (stats == null) return <Redirect href="/" />;

  const empty = draft.length === 0;
  const ready = !empty && subjectName.length > 0 && !saving;
  const saveLabel = empty
    ? 'Nothing to save'
    : subjectName.length > 0
      ? `Save ${draft.length} to ${subjectName}`
      : naming
        ? 'Name your subject'
        : 'Pick a subject';

  /**
   * What he leads with. The whole screen is a consequence of this sentence:
   * which cards are laid out, and which are folded into a stack.
   */
  const verdict = empty
    ? 'Well, you binned the lot. Harsh, but fair.'
    : worth.length === 0
      ? "I'd bet on all of these. Save them and go."
      : `${sure.length === 0 ? 'None of these' : `${sure.length} of these`} I'd bet on. ${
          worth.length === 1 ? "One I'd look at" : `${worth.length} I'd look at`
        } if I were you.`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <RuledPaper />
      {/* Punched binder holes, as on Home. Decoration, never over content. */}
      <View pointerEvents="none" style={styles.holes}>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={styles.hole} />
        ))}
      </View>

      <View style={styles.column}>
        <View style={styles.navRow}>
          <Pressable
            onPress={() => setDiscarding(true)}
            hitSlop={10}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <Text style={styles.backArrow}>{'←'}</Text>
          </Pressable>
          <View style={styles.headText}>
            <Text style={styles.title}>
              {draft.length} question{draft.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {worth.length > 0
                ? `${worth.length} worth a look`
                : subjectName.length > 0
                  ? `for ${subjectName}`
                  : 'from your notes'}
            </Text>
            <Squiggle width={84} style={styles.squiggle} />
          </View>
        </View>

        <FlatList
          data={worth}
          keyExtractor={({ q }) => keyOf(q)}
          renderItem={({ item }) => (
            <QuestionCard
              question={item.q}
              index={item.index}
              flag={item.flag}
              onRevise={reviseDraftQuestion}
              onRemove={removeDraftQuestion}
              onSettle={() => settle(item.q)}
            />
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              {/* His verdict, first thing on the page. */}
              <View style={styles.verdict}>
                <Tape rotate="-4deg" style={styles.tapeOnVerdict} />
                <View style={styles.who}>
                  <Icon name="nib" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={2.1} />
                </View>
                <Text style={styles.verdictText}>{verdict}</Text>
              </View>

              {!empty ? (
                <View style={styles.split}>
                  <View style={[styles.splitCell, styles.splitOk]}>
                    <Text style={styles.splitNum}>{sure.length}</Text>
                    <Text style={styles.splitLab}>HE&apos;S SURE</Text>
                  </View>
                  <View style={[styles.splitCell, styles.splitCheck]}>
                    <Text style={styles.splitNum}>{worth.length}</Text>
                    <Text style={styles.splitLab}>WORTH A LOOK</Text>
                  </View>
                </View>
              ) : null}

              {worth.length > 0 ? <Text style={styles.sectionLabel}>Worth a look</Text> : null}
            </View>
          }
          ListFooterComponent={
            <View style={styles.footerBlock}>
              {sure.length > 0 ? (
                <Text style={styles.sectionLabel}>He&apos;s sure about these</Text>
              ) : null}
              <SureStack
                questions={sure}
                open={stackOpen}
                onToggle={() => setStackOpen((v) => !v)}
                onOpenOne={(index) => setOpened(keyOf(draft[index]))}
                openedKey={opened}
                renderOpen={(q, index) => (
                  <QuestionCard
                    question={q}
                    index={index}
                    onRevise={reviseDraftQuestion}
                    onRemove={(i) => {
                      setOpened(null);
                      removeDraftQuestion(i);
                    }}
                  />
                )}
              />
              <SkippedPanel skipped={stats.skipped} />
            </View>
          }
          ListEmptyComponent={
            empty ? (
              <View style={styles.empty}>
                <View style={styles.emptyBadge}>
                  <Icon name="sprout" size={26} color={colors.text} fill={colors.accentWash} />
                </View>
                <Text style={styles.emptyTitle}>Nothing left</Text>
                <Text style={styles.emptyBody}>
                  You removed every question. Go back and paste different notes.
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        {/*
          The subject and the save sit together and never move. Choosing a
          subject is a one-off, so it does not deserve the top of the screen —
          but it must never be a scroll away from the button it gates either.
        */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {naming ? (
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Name your first subject — Biology?"
              placeholderTextColor={colors.textFaint}
              style={styles.nameInput}
              maxLength={40}
              returnKeyType="done"
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled">
              {subjects.map((subject) => {
                const active = subject.id === targetId;
                const wash = subject.color ?? colors.accentWash;
                return (
                  <Pressable
                    key={subject.id}
                    onPress={() => setTarget(subject.id)}
                    accessibilityLabel={`Save to ${subject.name}`}
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
                      style={[styles.chipText, active && { color: subjectInkFor(subject.color) }]}>
                      {subject.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <ChunkyButton
            label={saveLabel}
            icon="check"
            size="lg"
            disabled={!ready}
            onPress={handleSave}
          />
        </View>
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

const getStyles = (colors: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    column: { flex: 1, paddingHorizontal: 16 },
    pressed: { opacity: 0.75 },

    /** Punched binder holes, as on Home. */
    holes: {
      position: 'absolute',
      left: 4,
      top: 128,
      bottom: 34,
      width: 14,
      justifyContent: 'space-around',
    },
    hole: {
      width: 11,
      height: 11,
      borderRadius: 999,
      backgroundColor: colors.track,
      borderWidth: 1.4,
      borderColor: colors.lineSoft,
    },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
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
    backArrow: { fontFamily: font.heading, fontSize: 19, lineHeight: 24, color: colors.text },
    headText: { flex: 1 },
    title: { fontFamily: font.hero, fontSize: 26, lineHeight: 32, color: colors.text },
    sub: { fontFamily: font.bodySemibold, fontSize: 12.5, color: colors.textFaint },
    squiggle: { marginTop: 2 },

    list: { gap: 12, paddingBottom: 12 },
    header: { gap: 10 },
    footerBlock: { gap: 10, marginTop: 4 },
    sectionLabel: {
      fontFamily: font.bodyHeavy,
      fontSize: 10,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.textFaint,
      marginTop: 4,
    },

    /* ---- his verdict ---------------------------------------------------- */
    verdict: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 13,
      marginTop: 8,
      transform: [{ rotate: '-0.5deg' }],
      ...shadow.card,
    },
    // Tape already centres itself at top -9; nothing to override here.
    tapeOnVerdict: {},
    who: {
      width: 32,
      height: 32,
      borderRadius: radius.control,
      backgroundColor: PERI,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-4deg' }],
    },
    verdictText: {
      flex: 1,
      fontFamily: font.hero,
      fontSize: 16.5,
      lineHeight: 23,
      color: colors.text,
    },

    split: { flexDirection: 'row', gap: 9 },
    splitCell: {
      flex: 1,
      ...outlineOn(colors),
      ...derpRadius,
      paddingVertical: 10,
      paddingHorizontal: 12,
      ...shadow.card,
    },
    splitOk: { backgroundColor: colors.leafWash },
    splitCheck: { backgroundColor: colors.coralWash, transform: [{ rotate: '0.6deg' }] },
    splitNum: { fontFamily: font.hero, fontSize: 26, lineHeight: 28, color: colors.text },
    splitLab: {
      fontFamily: font.bodyHeavy,
      fontSize: 9,
      letterSpacing: 0.9,
      color: colors.textDim,
      marginTop: 2,
    },

    /* ---- a card --------------------------------------------------------- */
    card: {
      position: 'relative',
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 14,
      gap: 10,
      ...shadow.card,
    },
    /** A flagged card is lifted and tilted, so it reads as pulled out. */
    cardFlagged: { ...shadow.pop, transform: [{ rotate: '-0.6deg' }] },
    /**
     * Off to one side, not centred like every other strip in the app.
     * alignSelf has to be cleared or it fights the `right` offset — Tape's
     * own style centres itself, and `left: undefined` did nothing about it.
     */
    tapeFlag: { top: -8, right: 18, alignSelf: 'auto' },

    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    kindPill: {
      borderRadius: radius.pill,
      ...outlineOn(colors),
      paddingHorizontal: 10,
      paddingVertical: 3,
      transform: [{ rotate: '-1.5deg' }],
      ...shadow.card,
    },
    kindText: { fontFamily: font.bodyHeavy, fontSize: 9.5, letterSpacing: 1 },
    iconBtn: {
      backgroundColor: colors.accentWash,
      ...outlineOn(colors),
      borderRadius: radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 4,
    },
    iconBtnActive: { backgroundColor: colors.accent },
    iconBtnText: { fontFamily: font.bodyHeavy, fontSize: 11, color: colors.accentDeep },
    removeBtn: {
      width: 28,
      height: 28,
      borderRadius: radius.control,
      backgroundColor: colors.coralWash,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },

    prompt: { fontFamily: font.heading, fontSize: 15.5, lineHeight: 21, color: colors.text },
    promptInput: {
      fontFamily: font.heading,
      fontSize: 15.5,
      lineHeight: 21,
      color: colors.text,
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      borderRadius: radius.control,
      paddingHorizontal: 11,
      paddingVertical: 9,
    },

    /** What he is worried about, in his own hand. */
    why: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.coralWash,
      ...outlineOn(colors),
      borderRadius: radius.control,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    whyText: { flex: 1, fontFamily: font.hero, fontSize: 15, lineHeight: 20, color: colors.text },

    options: { gap: 6 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      borderRadius: radius.control,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    optionCorrect: { backgroundColor: colors.leafWash },
    /** The one option his flag is actually about. */
    optionCulprit: { backgroundColor: colors.coralWash, borderColor: colors.coral },
    letterChip: {
      width: 24,
      height: 24,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 10,
      borderBottomRightRadius: 7,
      borderBottomLeftRadius: 9,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-3deg' }],
    },
    // candy is a fixed pastel in both themes, so its ink is fixed too.
    letterChipText: { fontFamily: font.hero, fontSize: 13, color: onWash.ink },
    /** A list's marker, where multiple choice has its lettered chip. */
    bullet: {
      width: 24,
      height: 24,
      ...derpRadius,
      backgroundColor: colors.leafWash,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-3deg' }],
    },
    bulletText: { fontFamily: font.hero, fontSize: 13, lineHeight: 17, color: colors.text },
    optionText: { flex: 1, fontFamily: font.body, fontSize: 13.5, color: colors.textDim },
    optionTextCorrect: { fontFamily: font.bodyBold, color: colors.leaf },
    optionTextCulprit: { fontFamily: font.bodyBold, color: colors.coral },

    optionEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    mark: {
      width: 22,
      height: 22,
      borderRadius: 11,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
    markCorrect: { backgroundColor: colors.leafWash, borderColor: colors.leaf },
    optionInput: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 13.5,
      color: colors.text,
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      borderRadius: radius.control,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    optionInputCorrect: {
      backgroundColor: colors.leafWash,
      fontFamily: font.bodyBold,
      color: colors.leaf,
    },
    editHint: { fontFamily: font.body, fontSize: 11.5, color: colors.textFaint },

    /* ---- bin / fix / keep ---------------------------------------------- */
    verdictRow: { flexDirection: 'row', gap: 8, marginTop: 1 },
    vAct: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      ...outlineOn(colors),
      borderRadius: radius.control,
      paddingVertical: 9,
      ...shadow.card,
    },
    vBin: { backgroundColor: colors.surface2 },
    vBinText: { fontFamily: font.heading, fontSize: 13, color: colors.coral },
    vFix: { backgroundColor: colors.surface2 },
    vFixText: { fontFamily: font.heading, fontSize: 13, color: colors.text },
    vKeep: { backgroundColor: colors.accent },
    vKeepText: { fontFamily: font.heading, fontSize: 13, color: onWash.ink },

    /* ---- the stack he is sure about ------------------------------------ */
    stackWrap: { height: 76, marginTop: 2 },
    stackLeaf: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 58,
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      ...shadow.card,
    },
    stackLeaf3: { top: 0, opacity: 0.5, transform: [{ rotate: '1.6deg' }] },
    stackLeaf2: { top: 5, opacity: 0.75, transform: [{ rotate: '-1.1deg' }] },
    stackFront: {
      position: 'absolute',
      top: 11,
      left: 0,
      right: 0,
      height: 60,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 13,
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      transform: [{ rotate: '-0.3deg' }],
      ...shadow.card,
    },
    stackNum: { fontFamily: font.hero, fontSize: 27, lineHeight: 30, color: colors.leaf },
    stackText: {
      flex: 1,
      fontFamily: font.bodySemibold,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textDim,
    },
    stackOpen: { fontFamily: font.bodyHeavy, fontSize: 11.5, color: colors.accentDeep },

    fan: { gap: 6 },
    fanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      borderRadius: radius.control,
      paddingHorizontal: 10,
      paddingVertical: 7,
      ...shadow.card,
    },
    fanStripe: { width: 5, alignSelf: 'stretch', borderRadius: 999 },
    fanMid: { flex: 1, minWidth: 0 },
    fanQ: { fontFamily: font.heading, fontSize: 12.5, lineHeight: 16, color: colors.text },
    fanA: { fontFamily: font.bodySemibold, fontSize: 11, color: colors.leaf },
    fanBox: {
      width: 21,
      height: 21,
      borderRadius: 7,
      backgroundColor: colors.accent,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
    fanClose: { alignItems: 'center', paddingVertical: 6 },

    /* ---- skipped -------------------------------------------------------- */
    skipCard: {
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 13,
      marginTop: 4,
      ...shadow.card,
    },
    skipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    skipTitle: { fontFamily: font.heading, fontSize: 14.5, color: colors.textDim },
    skipToggle: { fontFamily: font.bodyHeavy, fontSize: 12, color: colors.accentDeep },
    skipHint: { fontFamily: font.body, fontSize: 12, color: colors.textFaint, marginTop: 4 },
    skipList: { marginTop: 10, gap: 9 },
    skipRow: { gap: 1 },
    skipText: {
      fontFamily: font.body,
      fontSize: 12.5,
      lineHeight: 17,
      color: colors.textDim,
      fontStyle: 'italic',
    },
    skipReason: { fontFamily: font.bodyHeavy, fontSize: 11, color: colors.coral },

    /* ---- empty ---------------------------------------------------------- */
    empty: {
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 22,
      alignItems: 'center',
      gap: 4,
      ...shadow.card,
    },
    emptyBadge: {
      width: 52,
      height: 52,
      ...derpRadius,
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      transform: [{ rotate: '-3deg' }],
    },
    emptyTitle: { fontFamily: font.heading, fontSize: 16, color: colors.text },
    emptyBody: {
      fontFamily: font.body,
      fontSize: 13.5,
      color: colors.textDim,
      textAlign: 'center',
    },

    /* ---- the bottom bar ------------------------------------------------- */
    footer: { paddingTop: 10, gap: 9 },
    chips: { flexDirection: 'row', gap: 8, paddingRight: 4 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      borderRadius: radius.pill,
      paddingHorizontal: 15,
      paddingVertical: 8,
    },
    chipText: { fontFamily: font.bodyHeavy, fontSize: 13, color: colors.textDim },
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
  });
