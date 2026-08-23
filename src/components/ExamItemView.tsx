import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Squiggle } from '@/components/notebook';
import { CircledWord } from '@/components/CircledWord';
import { InkSplat, PenStrike, PenTick, Stamp } from '@/components/penmarks';
import { Icon } from '@/components/Icon';
import { emptyDraft, type DraftValue } from '@/lib/draft';
import type {
  ChoiceItem,
  EnumerationItem,
  ExamItem,
  MatchingItem,
  ModifiedTrueFalseItem,
  TrueFalseItem,
  TypedItem,
} from '@/lib/exam';
import { checkAnswer, checkEnumeration } from '@/lib/grade';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

interface Props {
  item: ExamItem;
  /**
   * The answer so far. Omit and the component keeps its own — which is what
   * instant-feedback modes want. Exam simulation supplies it, because there
   * the answer has to survive leaving the question and coming back.
   */
  value?: DraftValue;
  /**
   * Told about every change, controlled or not, so instant modes can record
   * what was actually put down without giving up their own state.
   */
  onChange?: (value: DraftValue) => void;
  /**
   * Show right or wrong the moment the answer is committed. False defers
   * everything to the end of the paper: no colours, no verdict, no Check.
   */
  reveal?: boolean;
  /** Instant modes only — the student pressed Next after seeing the verdict. */
  onDone: (correct: boolean) => void;
}

type Draft<K extends DraftValue['kind']> = Extract<DraftValue, { kind: K }>;

interface Field<I extends ExamItem, K extends DraftValue['kind']> {
  item: I;
  draft: Draft<K>;
  setDraft: (value: DraftValue) => void;
  reveal: boolean;
  onDone: (correct: boolean) => void;
}

/** Shared feedback strip shown once an answer is locked in. */
function Verdict({
  correct,
  detail,
  onNext,
}: {
  correct: boolean;
  detail?: string;
  onNext: () => void;
}) {
  return (
    <View style={styles.verdictWrap}>
      <View style={[styles.verdict, correct ? styles.verdictGood : styles.verdictBad]}>
        <Icon
          name={correct ? 'check' : 'cross'}
          size={15}
          color={correct ? colors.leaf : colors.coral}
          strokeWidth={2.8}
        />
        <Text style={[styles.verdictText, { color: correct ? colors.leaf : colors.coral }]}>
          {correct ? 'Correct' : detail ? detail : 'Not quite'}
        </Text>
      </View>
      <ChunkyButton label="Next" icon="play" size="lg" onPress={onNext} />
    </View>
  );
}

function BlinkRing() {
  const pulse = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 750 }), withTiming(0, { duration: 750 })),
      -1,
      false
    );
  }, [pulse, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.5 }));

  // Sits behind the empty answer line, breathing like a cursor.
  return <Animated.View pointerEvents="none" style={[blinkStyles.ring, style]} />;
}

const blinkStyles = StyleSheet.create({
  ring: {
    position: 'absolute',
    left: -3,
    right: -3,
    height: 56,
    marginTop: -3,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.control + 3,
  },
});

function Prompt({ text }: { text: string }) {
  return <Text style={styles.prompt}>{text}</Text>;
}

/** Standing in for the verdict while answers are being withheld. */
function Recorded({ answered }: { answered: boolean }) {
  return (
    <Text style={styles.hint}>
      {answered ? 'Answer saved — you can change it before you submit.' : 'Nothing down yet'}
    </Text>
  );
}

// --- multiple choice ----------------------------------------------------

function Choice({ item, draft, setDraft, reveal, onDone }: Field<ChoiceItem, 'choice'>) {
  const picked = draft.picked;
  const revealed = reveal && picked != null;
  const correct = picked === item.correctAnswer;

  return (
    <View style={styles.body}>
      <Prompt text={item.prompt} />
      <View style={styles.options}>
        {item.options.map((option) => {
          const isCorrect = option === item.correctAnswer;
          const showGood = revealed && isCorrect;
          const showBad = revealed && option === picked && !isCorrect;
          return (
            <Pressable
              key={option}
              disabled={revealed}
              onPress={() => setDraft({ kind: 'choice', picked: option })}
              style={({ pressed }) => [
                styles.option,
                !reveal && picked === option && styles.optionPicked,
                showGood && styles.optionGood,
                showBad && styles.optionBad,
                revealed && !showGood && !showBad && styles.optionFade,
                pressed && !revealed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.optionText,
                  showGood && styles.optionTextGood,
                  showBad && styles.optionTextBad,
                ]}>
                {option}
              </Text>
              {showGood ? <Icon name="check" size={14} color={colors.leaf} strokeWidth={2.8} /> : null}
              {showBad ? <Icon name="cross" size={14} color={colors.coral} strokeWidth={2.8} /> : null}
              {revealed && !showGood ? (
                <PenStrike color={showBad ? colors.coral : colors.textFaint} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {revealed ? (
        <Verdict correct={correct} onNext={() => onDone(correct)} />
      ) : reveal ? (
        <Text style={styles.hint}>Pick an answer</Text>
      ) : (
        <Recorded answered={picked != null} />
      )}
    </View>
  );
}

// --- true / false -------------------------------------------------------

function TrueFalse({ item, draft, setDraft, reveal, onDone }: Field<TrueFalseItem, 'tf'>) {
  const picked = draft.picked;
  const revealed = reveal && picked != null;
  const correct = picked === item.isTrue;

  return (
    <View style={styles.body}>
      <View style={styles.stampZone}>
        <Text style={styles.statement}>{item.statement}</Text>
        {revealed ? (
          <>
            <View style={styles.stampOverlay} pointerEvents="none">
              <Stamp label={item.isTrue ? 'TRUE' : 'FALSE'} tone={correct ? 'right' : 'wrong'} />
            </View>
            <InkSplat color={correct ? colors.leaf : colors.coral} nonce={1} />
          </>
        ) : null}
      </View>
      <View style={styles.tfRow}>
        {[true, false].map((value) => {
          const chosen = picked === value;
          const isAnswer = item.isTrue === value;
          return (
            <Pressable
              key={String(value)}
              disabled={revealed}
              onPress={() => setDraft({ kind: 'tf', picked: value })}
              style={({ pressed }) => [
                styles.tfBtn,
                !reveal && chosen && styles.optionPicked,
                revealed && isAnswer && styles.optionGood,
                revealed && chosen && !isAnswer && styles.optionBad,
                revealed && !isAnswer && !chosen && styles.optionFade,
                pressed && !revealed && styles.pressed,
              ]}>
              <Text style={styles.tfText}>{value ? 'True' : 'False'}</Text>
            </Pressable>
          );
        })}
      </View>
      {revealed ? (
        <Verdict
          correct={correct}
          detail={item.isTrue ? 'That one was true' : 'That one was false'}
          onNext={() => onDone(correct)}
        />
      ) : reveal ? null : (
        <Recorded answered={picked != null} />
      )}
    </View>
  );
}

// --- modified true / false ---------------------------------------------

function ModifiedTrueFalse({
  item,
  draft,
  setDraft,
  reveal,
  onDone,
}: Field<ModifiedTrueFalseItem, 'mtf'>) {
  const { saidTrue, wordIndex, typed, done } = draft;

  // Calling a false statement true (or vice versa) ends it immediately —
  // but only when verdicts are on. Withholding them means saying "false"
  // always leads to the correction step, or the branch itself is the answer.
  const wrongCall = saidTrue != null && saidTrue !== item.isTrue;
  const correctWordPicked = wordIndex === item.falseWordIndex;
  const graded = checkAnswer(typed, item.correctWord);
  const finalCorrect = item.isTrue
    ? saidTrue === true
    : saidTrue === false && correctWordPicked && graded.correct;

  const patch = (next: Partial<Draft<'mtf'>>) => setDraft({ ...draft, ...next });

  if (saidTrue == null) {
    return (
      <View style={styles.body}>
        <Text style={styles.statement}>{item.words.join(' ')}</Text>
        <View style={styles.tfRow}>
          {[true, false].map((value) => (
            <Pressable
              key={String(value)}
              onPress={() =>
                patch({
                  saidTrue: value,
                  // Saying "false" opens the correction step; saying "true"
                  // is the whole answer either way.
                  done: reveal ? value !== item.isTrue || item.isTrue : value === true,
                })
              }
              style={({ pressed }) => [styles.tfBtn, pressed && styles.pressed]}>
              <Text style={styles.tfText}>{value ? 'True' : 'False'}</Text>
            </Pressable>
          ))}
        </View>
        {reveal ? null : <Recorded answered={false} />}
      </View>
    );
  }

  // Said false: now find and fix the word.
  if (!done) {
    return (
      <View style={styles.body}>
        <Text style={styles.stepLabel}>
          {wordIndex == null ? 'Which word is wrong? Tap it.' : 'What should it be?'}
        </Text>
        <View style={styles.wordWrap}>
          {item.words.map((word, i) => {
            const chosen = wordIndex === i;
            return (
              <Pressable
                key={`${i}-${word}`}
                // Locked in once picked, unless answers are being withheld —
                // then changing your mind is part of sitting the paper.
                disabled={reveal && wordIndex != null}
                onPress={() => patch({ wordIndex: i })}
                style={({ pressed }) => [
                  styles.word,
                  chosen && styles.wordChosen,
                  pressed && !(reveal && wordIndex != null) && styles.pressed,
                ]}>
                <Text style={[styles.wordText, chosen && styles.wordTextChosen]}>{word}</Text>
              </Pressable>
            );
          })}
        </View>

        {wordIndex != null ? (
          <>
            <TextInput
              value={typed}
              onChangeText={(text) => patch({ typed: text })}
              placeholder="Type the correct word"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={() => reveal && patch({ done: true })}
            />
            {reveal ? (
              <ChunkyButton
                label="Check"
                size="lg"
                disabled={typed.trim().length === 0}
                onPress={() => patch({ done: true })}
              />
            ) : null}
          </>
        ) : null}

        {reveal ? null : (
          <Pressable onPress={() => patch({ saidTrue: null, wordIndex: null, typed: '' })}>
            <Text style={styles.undo}>Start this one over</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (!reveal) {
    return (
      <View style={styles.body}>
        <Text style={styles.statement}>{item.words.join(' ')}</Text>
        <Recorded answered />
        <Pressable onPress={() => patch({ saidTrue: null, wordIndex: null, typed: '', done: false })}>
          <Text style={styles.undo}>Start this one over</Text>
        </Pressable>
      </View>
    );
  }

  const detail = wrongCall
    ? item.isTrue
      ? 'That statement was true'
      : 'That statement was false'
    : !correctWordPicked
      ? `The wrong word was "${item.words[item.falseWordIndex]}"`
      : graded.nearMiss
        ? `Close — you typed "${typed.trim()}", the answer was "${item.correctWord}"`
        : `The answer was "${item.correctWord}"`;

  return (
    <View style={styles.body}>
      <View style={styles.wordWrap}>
        {item.words.map((word, i) =>
          i === item.falseWordIndex && !item.isTrue ? (
            <CircledWord key={`${i}-${word}`} word={word} />
          ) : (
            <Text key={`${i}-${word}`} style={styles.statement}>
              {word}
            </Text>
          )
        )}
      </View>
      <Verdict correct={finalCorrect} detail={detail} onNext={() => onDone(finalCorrect)} />
    </View>
  );
}

// --- typed answers ------------------------------------------------------

function Typed({ item, draft, setDraft, reveal, onDone }: Field<TypedItem, 'typed'>) {
  const checked = reveal && draft.checked;
  const result = checkAnswer(draft.text, item.correctAnswer);

  return (
    <View style={styles.body}>
      <Prompt text={item.prompt} />
      {reveal && !checked && draft.text.trim().length === 0 ? <BlinkRing /> : null}
      <TextInput
        value={draft.text}
        onChangeText={(text) => setDraft({ kind: 'typed', text, checked: draft.checked })}
        editable={!checked}
        placeholder="Type your answer"
        placeholderTextColor={colors.textFaint}
        style={[
          styles.input,
          checked && (result.correct ? styles.inputGood : styles.inputBad),
          !reveal && draft.text.trim().length > 0 && styles.inputFilled,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={() =>
          reveal && draft.text.trim() && setDraft({ ...draft, checked: true })
        }
      />
      {checked && result.correct ? <Squiggle width={120} color={colors.leaf} /> : null}
      {checked ? (
        <Verdict
          correct={result.correct}
          detail={
            result.nearMiss
              ? `Close — you typed "${draft.text.trim()}", the answer was "${item.correctAnswer}"`
              : `The answer was "${item.correctAnswer}"`
          }
          onNext={() => onDone(result.correct)}
        />
      ) : reveal ? (
        <ChunkyButton
          label="Check"
          size="lg"
          disabled={draft.text.trim().length === 0}
          onPress={() => setDraft({ ...draft, checked: true })}
        />
      ) : (
        <Recorded answered={draft.text.trim().length > 0} />
      )}
    </View>
  );
}

// --- matching -----------------------------------------------------------

function Matching({ item, draft, setDraft, reveal, onDone }: Field<MatchingItem, 'matching'>) {
  const { pairs, activeTerm } = draft;
  const checked = reveal && draft.checked;

  const allPaired = Object.keys(pairs).length === item.terms.length;
  const correct = item.terms.every((_, i) => pairs[i] === item.correctIndexFor[i]);
  const takenMeanings = new Set(Object.values(pairs));

  /** Tapping a paired term releases it, so a mistap is never a dead end. */
  const tapTerm = (i: number) => {
    if (pairs[i] != null) {
      const next = { ...pairs };
      delete next[i];
      setDraft({ ...draft, pairs: next, activeTerm: i });
      return;
    }
    setDraft({ ...draft, activeTerm: activeTerm === i ? null : i });
  };

  return (
    <View style={styles.body}>
      <Text style={styles.stepLabel}>
        {activeTerm == null
          ? 'Tap a term, then tap its meaning.'
          : 'Now tap its meaning. Tap a paired term to undo it.'}
      </Text>

      <View style={styles.matchCols}>
        <View style={styles.matchCol}>
          {item.terms.map((term, i) => {
            const paired = pairs[i] != null;
            const good = checked && pairs[i] === item.correctIndexFor[i];
            const bad = checked && paired && !good;
            return (
              <Pressable
                key={term}
                disabled={checked}
                onPress={() => tapTerm(i)}
                style={({ pressed }) => [
                  styles.matchChip,
                  activeTerm === i && styles.matchActive,
                  paired && !checked && styles.matchPaired,
                  good && styles.optionGood,
                  bad && styles.optionBad,
                  pressed && !checked && styles.pressed,
                ]}>
                <Text style={styles.matchText} numberOfLines={2}>
                  {term}
                </Text>
                {paired ? <Text style={styles.matchNum}>{pairs[i] + 1}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.matchCol}>
          {item.meanings.map((meaning, j) => (
            <Pressable
              key={meaning}
              disabled={checked || activeTerm == null || takenMeanings.has(j)}
              onPress={() => {
                if (activeTerm == null) return;
                setDraft({
                  ...draft,
                  pairs: { ...pairs, [activeTerm]: j },
                  activeTerm: null,
                });
              }}
              style={({ pressed }) => [
                styles.matchChip,
                styles.matchMeaning,
                takenMeanings.has(j) && styles.matchPaired,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.matchNum}>{j + 1}</Text>
              <Text style={styles.matchText} numberOfLines={3}>
                {meaning}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {checked ? (
        <Verdict correct={correct} detail="Some pairs were wrong" onNext={() => onDone(correct)} />
      ) : reveal ? (
        <ChunkyButton
          label="Check"
          size="lg"
          disabled={!allPaired}
          onPress={() => setDraft({ ...draft, checked: true })}
        />
      ) : (
        <Recorded answered={allPaired} />
      )}
    </View>
  );
}

// --- enumeration --------------------------------------------------------

function Enumeration({ item, draft, setDraft, reveal, onDone }: Field<EnumerationItem, 'enum'>) {
  const checked = reveal && draft.checked;
  const result = checkEnumeration(draft.entries, item.items, item.ordered);

  return (
    <View style={styles.body}>
      <Prompt text={item.prompt} />
      {item.ordered ? <Text style={styles.stepLabel}>Order matters here.</Text> : null}

      <View style={styles.options}>
        {item.items.map((_, i) => {
          const outcome = checked ? result.results[i] : null;
          return (
            <View key={i} style={styles.enumRow}>
              {outcome?.matched != null ? (
                <PenTick size={18} />
              ) : (
                <Text style={styles.enumNum}>{i + 1}</Text>
              )}
              <TextInput
                value={draft.entries[i] ?? ''}
                onChangeText={(text) =>
                  setDraft({
                    ...draft,
                    entries: draft.entries.map((entry, k) => (k === i ? text : entry)),
                  })
                }
                editable={!checked}
                placeholder={checked ? item.items[i] : '…'}
                placeholderTextColor={colors.textFaint}
                style={[
                  styles.input,
                  styles.enumInput,
                  outcome?.matched != null && styles.inputGood,
                  checked && outcome?.matched == null && styles.inputBad,
                  !reveal && (draft.entries[i] ?? '').trim().length > 0 && styles.inputFilled,
                ]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          );
        })}
      </View>

      {checked ? (
        <Verdict
          correct={result.correct}
          detail={`You got ${result.matchedCount} of ${item.items.length}`}
          onNext={() => onDone(result.correct)}
        />
      ) : reveal ? (
        <ChunkyButton
          label="Check"
          size="lg"
          disabled={draft.entries.every((e) => e.trim().length === 0)}
          onPress={() => setDraft({ ...draft, checked: true })}
        />
      ) : (
        <Recorded answered={draft.entries.some((e) => e.trim().length > 0)} />
      )}
    </View>
  );
}

/** A draft that has drifted out of step with its item is simply started over. */
function coerce<K extends DraftValue['kind']>(
  item: ExamItem,
  draft: DraftValue,
  kind: K
): Draft<K> {
  return (draft.kind === kind ? draft : emptyDraft(item)) as Draft<K>;
}

export function ExamItemView({ item, value, onChange, reveal = true, onDone }: Props) {
  // Only used when the parent doesn't hold the answer itself. Keyed on the
  // item so advancing to the next question starts clean even if this
  // component is reused rather than remounted.
  const [own, setOwn] = useState(() => ({ id: item.id, value: emptyDraft(item) }));
  if (own.id !== item.id) setOwn({ id: item.id, value: emptyDraft(item) });

  const draft = value !== undefined ? value : own.value;
  const setDraft = (next: DraftValue) => {
    if (value === undefined) setOwn({ id: item.id, value: next });
    onChange?.(next);
  };

  const shared = { setDraft, reveal, onDone };

  switch (item.format) {
    case 'multiple_choice':
      return <Choice key={item.id} item={item} draft={coerce(item, draft, 'choice')} {...shared} />;
    case 'true_false':
      return <TrueFalse key={item.id} item={item} draft={coerce(item, draft, 'tf')} {...shared} />;
    case 'modified_true_false':
      return (
        <ModifiedTrueFalse key={item.id} item={item} draft={coerce(item, draft, 'mtf')} {...shared} />
      );
    case 'identification':
    case 'fill_blank':
      return <Typed key={item.id} item={item} draft={coerce(item, draft, 'typed')} {...shared} />;
    case 'matching':
      return (
        <Matching key={item.id} item={item} draft={coerce(item, draft, 'matching')} {...shared} />
      );
    case 'enumeration':
      return (
        <Enumeration key={item.id} item={item} draft={coerce(item, draft, 'enum')} {...shared} />
      );
  }
}

const styles = StyleSheet.create({
  stampZone: {
    position: 'relative',
  },
  stampOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
  body: {
    gap: 12,
  },
  prompt: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 26,
    color: colors.text,
  },
  statement: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 27,
    color: colors.text,
  },
  stepLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 12.5,
    color: colors.accentDeep,
  },
  hint: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
    textAlign: 'center',
  },
  undo: {
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    color: colors.accentDeep,
    textAlign: 'center',
    paddingVertical: 6,
  },
  options: {
    gap: 9,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...shadow.card,
  },
  /** Chosen, but not yet judged — exam simulation withholds the verdict. */
  optionPicked: {
    backgroundColor: colors.accentWash,
    borderColor: colors.accentEdge,
  },
  optionGood: {
    backgroundColor: colors.leafWash,
  },
  optionBad: {
    backgroundColor: colors.coralWash,
  },
  optionFade: {
    opacity: 0.5,
  },
  optionText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  optionTextGood: {
    fontFamily: font.bodyBold,
    color: colors.leaf,
  },
  optionTextBad: {
    fontFamily: font.bodyBold,
    color: colors.coral,
  },
  tfRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tfBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingVertical: 18,
    alignItems: 'center',
    ...shadow.card,
  },
  tfText: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  wordWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  word: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  wordChosen: {
    backgroundColor: colors.accent,
    borderColor: colors.ink,
  },
  wordText: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.text,
  },
  wordTextChosen: {
    fontFamily: font.bodyBold,
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: font.hero,
    fontSize: 17,
    color: colors.text,
    transform: [{ rotate: '-0.4deg' }],
  },
  /** Something is written here — the only signal a withheld paper gives. */
  inputFilled: {
    borderColor: colors.accentEdge,
  },
  inputGood: {
    backgroundColor: colors.leafWash,
    color: colors.leaf,
  },
  inputBad: {
    backgroundColor: colors.coralWash,
    color: colors.coral,
  },
  matchCols: {
    flexDirection: 'row',
    gap: 9,
  },
  matchCol: {
    flex: 1,
    gap: 8,
  },
  matchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 52,
  },
  matchMeaning: {
    backgroundColor: colors.surface2,
  },
  matchActive: {
    backgroundColor: colors.accent,
    borderColor: colors.ink,
  },
  matchPaired: {
    borderColor: colors.accentDeep,
  },
  matchText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 16.5,
    color: colors.text,
  },
  matchNum: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.accentDeep,
    fontVariant: ['tabular-nums'],
  },
  enumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  enumNum: {
    width: 18,
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  enumInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14.5,
  },
  verdictWrap: {
    gap: 10,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  verdictGood: {
    backgroundColor: colors.leafWash,
  },
  verdictBad: {
    backgroundColor: colors.coralWash,
  },
  verdictText: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.75,
  },
});
