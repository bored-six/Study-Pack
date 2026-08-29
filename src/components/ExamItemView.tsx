import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  FadeInDown,
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
import { tapCorrect, tapSelect, tapWrong } from '@/lib/haptics';
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
import { candy, font, getColors, onWash, outlineOn, radius, shadow, useThemeStore } from '@/theme/tokens';

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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  // The moment the verdict appears is the moment that deserves the sound —
  // every format funnels through here, so no type is ever silent.
  useEffect(() => {
    if (correct) tapCorrect();
    else tapWrong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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
  return <Animated.View pointerEvents="none" style={[getBlinkStyles(colors).ring, style]} />;
}

const getBlinkStyles = (colors: any) => StyleSheet.create({
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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  return <Text style={styles.prompt}>{text}</Text>;
}

/** Standing in for the verdict while answers are being withheld. */
function Recorded({ answered }: { answered: boolean }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  return (
    <Text style={styles.hint}>
      {answered ? 'Answer saved — you can change it before you submit.' : 'Nothing down yet'}
    </Text>
  );
}

// --- multiple choice ----------------------------------------------------

function Choice({ item, draft, setDraft, reveal, onDone }: Field<ChoiceItem, 'choice'>) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const picked = draft.picked;
  const revealed = reveal && picked != null;
  const correct = picked === item.correctAnswer;

  return (
    <View style={styles.body}>
      <Prompt text={item.prompt} />
      <View style={styles.hand}>
        {item.options.map((option, i) => {
          const isCorrect = option === item.correctAnswer;
          const showGood = revealed && isCorrect;
          const showBad = revealed && option === picked && !isCorrect;
          const dud = revealed && !showGood && !showBad;
          const rank = String.fromCharCode(65 + i);
          return (
            <Animated.View
              key={option}
              entering={FadeInDown.springify().damping(15).delay(80 + i * 90)}
              style={styles.dealSlot}>
            <Pressable
              disabled={revealed}
              accessibilityRole="radio"
              accessibilityState={{ checked: picked === option, disabled: revealed }}
              accessibilityLabel={option}
              onPress={() => {
                tapSelect();
                setDraft({ kind: 'choice', picked: option });
              }}
              style={({ pressed }) => [
                styles.answerLine,
                dud && styles.linePale,
                pressed && !revealed && styles.linePressed,
              ]}>
              {/* Ticked in pencil, the way you would on the page itself. */}
              <View
                style={[
                  styles.tickBox,
                  !reveal && picked === option && styles.tickBoxOn,
                  showGood && styles.tickBoxGood,
                  showBad && styles.tickBoxBad,
                ]}>
                {picked === option || showGood ? (
                  <Icon
                    name="check"
                    size={12}
                    color={showBad ? colors.coral : colors.surface}
                    strokeWidth={3.2}
                  />
                ) : (
                  <Text style={styles.tickRank}>{rank}</Text>
                )}
              </View>

              <View style={styles.lineTextWrap}>
                <Text
                  style={[
                    styles.lineText,
                    showGood && styles.optionTextGood,
                    showBad && styles.optionTextBad,
                  ]}>
                  {option}
                </Text>
                {dud || showBad ? (
                  <PenStrike color={showBad ? colors.coral : colors.textFaint} />
                ) : null}
              </View>

              {showGood ? <Icon name="check" size={16} color={colors.leaf} strokeWidth={3} /> : null}
            </Pressable>
            </Animated.View>
          );
        })}
      </View>
      {revealed ? (
        <Verdict correct={correct} onNext={() => onDone(correct)} />
      ) : reveal ? (
        <Text style={styles.hint}>Tick your answer</Text>
      ) : (
        <Recorded answered={picked != null} />
      )}
    </View>
  );
}

// --- true / false -------------------------------------------------------

function TrueFalse({ item, draft, setDraft, reveal, onDone }: Field<TrueFalseItem, 'tf'>) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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
      <View style={styles.tfHand}>
        {[true, false].map((value) => {
          const chosen = picked === value;
          const isAnswer = item.isTrue === value;
          return (
            <Animated.View
              key={String(value)}
              entering={FadeInDown.springify().damping(15).delay(value ? 100 : 200)}
              style={styles.tfSlot}>
            <Pressable
              disabled={revealed}
              onPress={() => {
                tapSelect();
                setDraft({ kind: 'tf', picked: value });
              }}
              style={({ pressed }) => [
                styles.tfCard,
                { transform: [{ rotate: value ? '-2deg' : '2deg' }] },
                value ? styles.tfCardTrue : styles.tfCardFalse,
                !reveal && chosen && styles.playCardPicked,
                revealed && isAnswer && styles.playCardGood,
                revealed && chosen && !isAnswer && styles.playCardBad,
                revealed && !isAnswer && !chosen && styles.playCardDud,
                pressed && !revealed && styles.playCardLift,
              ]}>
              <Icon
                name={value ? 'check' : 'cross'}
                size={30}
                color={value ? colors.leaf : colors.coral}
                strokeWidth={2.8}
              />
              <Text style={[styles.tfCardText, { color: value ? colors.leaf : colors.coral }]}>
                {value ? 'True' : 'False'}
              </Text>
            </Pressable>
            </Animated.View>
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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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
              onPress={() => {
                tapSelect();
                patch({
                  saidTrue: value,
                  // Saying "false" opens the correction step; saying "true"
                  // is the whole answer either way.
                  done: reveal ? value !== item.isTrue || item.isTrue : value === true,
                });
              }}
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
                onPress={() => {
                  tapSelect();
                  patch({ wordIndex: i });
                }}
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

  // Every wrong path names the correct word. Being told only what was wrong
  // leaves you knowing the statement was false and still not knowing the fact.
  const swapped = item.words[item.falseWordIndex];
  const detail = wrongCall
    ? item.isTrue
      ? 'That statement was true — nothing needed changing'
      : `That statement was false: "${swapped}" should be "${item.correctWord}"`
    : !correctWordPicked
      ? `The wrong word was "${swapped}" — it should be "${item.correctWord}"`
      : graded.nearMiss
        ? `Right word. You typed "${typed.trim()}", the answer was "${item.correctWord}"`
        : `Right word. The answer was "${item.correctWord}"`;

  return (
    <View style={styles.body}>
      <View style={styles.wordWrap}>
        {item.words.map((word, i) =>
          i === item.falseWordIndex && !item.isTrue ? (
            <View key={`${i}-${word}`} style={styles.fixWrap}>
              <Text style={styles.fixWord}>{item.correctWord}</Text>
              <CircledWord word={word} />
            </View>
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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const checked = reveal && draft.checked;
  const result = checkAnswer(draft.text, item.correctAnswer);

  const blankParts =
    item.format === 'fill_blank' ? item.prompt.split(/_{2,}/) : null;

  return (
    <View style={styles.body}>
      {checked && blankParts && blankParts.length > 1 ? (
        <Text style={styles.prompt}>
          {blankParts[0]}
          <Text style={[styles.fillWord, !result.correct && { color: colors.coral }]}>
            {item.correctAnswer}
          </Text>
          {blankParts.slice(1).join('_____')}
        </Text>
      ) : (
        <Prompt text={item.prompt} />
      )}
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
      {checked && result.correct ? (
        <View style={styles.goodRow}>
          <PenTick size={20} />
          <Squiggle width={120} color={colors.leaf} />
        </View>
      ) : null}
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

interface ChipBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A wobbly pen line between a term and its meaning — workbook style. */
function penPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y - 5}, ${midX} ${to.y + 5}, ${to.x} ${to.y}`;
}

function Matching({ item, draft, setDraft, reveal, onDone }: Field<MatchingItem, 'matching'>) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const { pairs, activeTerm } = draft;
  const checked = reveal && draft.checked;

  const allPaired = Object.keys(pairs).length === item.terms.length;
  const correct = item.terms.every((_, i) => pairs[i] === item.correctIndexFor[i]);
  const takenMeanings = new Set(Object.values(pairs));

  // Chip geometry, measured relative to the two columns, for the pen lines.
  const [termBoxes, setTermBoxes] = useState<Record<number, ChipBox>>({});
  const [meaningBoxes, setMeaningBoxes] = useState<Record<number, ChipBox>>({});
  const [cols, setCols] = useState<{ left: ChipBox | null; right: ChipBox | null }>({
    left: null,
    right: null,
  });

  const toneFor = (i: number) => candy[i % candy.length];

  /** Tapping a paired term releases it, so a mistap is never a dead end. */
  const tapTerm = (i: number) => {
    if (checked) return;
    tapSelect();
    if (pairs[i] != null) {
      const next = { ...pairs };
      delete next[i];
      setDraft({ ...draft, pairs: next, activeTerm: i });
      return;
    }
    setDraft({ ...draft, activeTerm: activeTerm === i ? null : i });
  };

  /**
   * A measured chip, or null when the event has nothing to measure.
   *
   * onLayout can fire with a null nativeEvent — a chip laid out as the view
   * is going away, or a recycled event. Reading through it crashed the whole
   * matching question, which is a hard failure for a missing pen line.
   */
  const box = (e: LayoutChangeEvent): ChipBox | null => {
    const layout = e?.nativeEvent?.layout;
    if (!layout) return null;
    return { x: layout.x, y: layout.y, w: layout.width, h: layout.height };
  };

  return (
    <View style={styles.body}>
      <Text style={styles.stepLabel}>
        {activeTerm == null
          ? 'Tap a term, then its meaning — a line joins them up.'
          : 'Now tap its meaning. Tap a joined term to unhook it.'}
      </Text>

      <View style={styles.matchCols}>
        <View
          style={styles.matchCol}
          onLayout={(e) => {
            const b = box(e);
            if (b) setCols((c) => ({ ...c, left: b }));
          }}>
          {item.terms.map((term, i) => {
            const paired = pairs[i] != null;
            const good = checked && pairs[i] === item.correctIndexFor[i];
            const bad = checked && paired && !good;
            const tone = toneFor(i);
            return (
              <Pressable
                key={term}
                disabled={checked}
                onLayout={(e) => {
                  const measured = box(e);
                  if (measured) setTermBoxes((b) => ({ ...b, [i]: measured }));
                }}
                onPress={() => tapTerm(i)}
                style={({ pressed }) => [
                  styles.matchChip,
                  activeTerm === i && styles.matchActive,
                  paired && !checked && {
                    backgroundColor: tone.wash,
                    borderColor: tone.ink,
                  },
                  good && styles.optionGood,
                  bad && styles.optionBad,
                  pressed && !checked && styles.pressed,
                ]}>
                <View style={styles.matchTextWrap}>
                  <Text
                    style={[styles.matchText, paired && !checked && styles.matchTextOnWash]}
                    numberOfLines={2}>
                    {term}
                  </Text>
                  {bad ? <PenStrike color={colors.coral} /> : null}
                </View>
                {good ? <PenTick size={15} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View
          style={styles.matchCol}
          onLayout={(e) => {
            const b = box(e);
            if (b) setCols((c) => ({ ...c, right: b }));
          }}>
          {item.meanings.map((meaning, j) => {
            const pairedTerm = Object.entries(pairs).find(([, v]) => v === j)?.[0];
            const tone = pairedTerm != null ? toneFor(Number(pairedTerm)) : null;
            return (
              <Pressable
                key={meaning}
                disabled={checked || activeTerm == null || takenMeanings.has(j)}
                onLayout={(e) => {
                  const measured = box(e);
                  if (measured) setMeaningBoxes((b) => ({ ...b, [j]: measured }));
                }}
                onPress={() => {
                  if (activeTerm == null) return;
                  tapSelect();
                  setDraft({
                    ...draft,
                    pairs: { ...pairs, [activeTerm]: j },
                    activeTerm: null,
                  });
                }}
                style={({ pressed }) => [
                  styles.matchChip,
                  styles.matchMeaning,
                  tone && !checked && { backgroundColor: tone.wash, borderColor: tone.ink },
                  activeTerm != null && !takenMeanings.has(j) && !checked && styles.matchInviting,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[styles.matchText, tone && !checked && styles.matchTextOnWash]}
                  numberOfLines={3}>
                  {meaning}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* The pen lines, drawn over the chips so mobile's narrow gap can't hide them. */}
        {cols.left && cols.right ? (
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Object.entries(pairs).map(([termKey, j]) => {
              const i = Number(termKey);
              const t = termBoxes[i];
              const m = meaningBoxes[j];
              if (!t || !m || !cols.left || !cols.right) return null;
              const from = {
                x: cols.left.x + t.x + t.w - 10,
                y: cols.left.y + t.y + t.h / 2,
              };
              const to = { x: cols.right.x + m.x + 10, y: cols.right.y + m.y + m.h / 2 };
              const good = checked && item.correctIndexFor[i] === j;
              const stroke = checked
                ? good
                  ? colors.leaf
                  : colors.coral
                : toneFor(i).ink;
              return (
                <Path
                  key={termKey}
                  d={penPath(from, to)}
                  stroke={stroke}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={checked && !good ? '5 6' : undefined}
                  fill="none"
                />
              );
            })}
          </Svg>
        ) : null}

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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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
                <PenTick size={18} delay={250 + i * 90} />
              ) : checked ? (
                <Icon name="cross" size={14} color={colors.coral} strokeWidth={2.8} />
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
                onSubmitEditing={() => tapSelect()}
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
              {checked && outcome?.matched == null ? (
                <Text style={styles.enumFix}>{item.items[i]}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {checked ? (
        <Verdict
          correct={result.correct}
          detail={
            result.extras.length > 0
              ? `You got ${result.matchedCount} of ${item.items.length}, and ${result.extras.length} that weren't on the list`
              : `You got ${result.matchedCount} of ${item.items.length}`
          }
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
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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

const getStyles = (colors: any) => StyleSheet.create({
  hand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dealSlot: {
    width: '100%',
  },

  /**
   * One answer, written on a ruled line.
   *
   * These were playing cards — two abreast, rotated, each with a rank in
   * two corners. On a pad they are lines: a pencil box at the margin and
   * the answer beside it, so choosing looks like ticking a page rather
   * than picking a card off a table.
   */
  answerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    // Two ruled lines to an answer, so the page's rhythm and the answers'
    // agree instead of drifting apart down the page.
    height: 44,
    paddingRight: 4,
  },
  linePale: {
    opacity: 0.42,
  },
  linePressed: {
    opacity: 0.65,
  },
  tickBox: {
    width: 24,
    height: 24,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
    // Not `flex: 0` — that hands it a zero basis and the row squashes it
    // to a sliver next to a flexible label.
    flexShrink: 0,
  },
  tickBoxOn: {
    backgroundColor: colors.accentDeep,
    borderColor: colors.accentDeep,
  },
  tickBoxGood: {
    backgroundColor: colors.leaf,
    borderColor: colors.leaf,
  },
  tickBoxBad: {
    borderColor: colors.coral,
  },
  tickRank: {
    fontFamily: font.hero,
    fontSize: 13,
    lineHeight: 16,
    color: colors.textFaint,
  },
  lineTextWrap: {
    flex: 1,
    position: 'relative',
  },
  lineText: {
    fontFamily: font.heading,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  playCard: {
    minHeight: 92,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: 16,
    padding: 8,
    justifyContent: 'center',
    ...shadow.card,
  },
  playCardPicked: {
    borderColor: colors.accentDeep,
    backgroundColor: colors.accentWash,
  },
  playCardGood: {
    backgroundColor: colors.leafWash,
    borderColor: 'rgba(59, 117, 39, 0.45)',
  },
  playCardBad: {
    backgroundColor: colors.coralWash,
    borderColor: 'rgba(194, 78, 56, 0.45)',
  },
  playCardDud: {
    opacity: 0.45,
  },
  playCardLift: {
    transform: [{ translateY: -4 }, { scale: 1.02 }],
  },
  cardRank: {
    position: 'absolute',
    top: 5,
    left: 9,
    fontFamily: font.hero,
    fontSize: 14,
    color: colors.textFaint,
  },
  rankGood: { color: colors.leaf },
  rankBad: { color: colors.coral },
  cardRankFlip: {
    top: undefined,
    left: undefined,
    bottom: 5,
    right: 9,
    transform: [{ rotate: '180deg' }],
  },
  cardTextWrap: {
    alignSelf: 'center',
    position: 'relative',
    maxWidth: '92%',
  },
  cardText: {
    fontFamily: font.heading,
    fontSize: 14.5,
    lineHeight: 19,
    color: colors.text,
    textAlign: 'center',
  },
  cardMark: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  tfHand: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tfSlot: {
    flex: 1,
    maxWidth: 150,
  },
  tfCard: {
    width: '100%',
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: 18,
    ...shadow.card,
  },
  tfCardTrue: {},
  tfCardFalse: {},
  tfCardText: {
    fontFamily: font.hero,
    fontSize: 22,
    lineHeight: 28,
  },
  fillWord: {
    fontFamily: font.hero,
    fontSize: 18,
    color: colors.leaf,
  },
  goodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fixWrap: {
    alignItems: 'center',
  },
  fixWord: {
    fontFamily: font.hero,
    fontSize: 14,
    lineHeight: 17,
    color: colors.leaf,
    transform: [{ rotate: '-3deg' }],
  },
  enumFix: {
    fontFamily: font.hero,
    fontSize: 14,
    color: colors.leaf,
    marginLeft: 6,
    flexShrink: 1,
  },
  matchInviting: {
    borderStyle: 'dashed',
    borderColor: colors.accentDeep,
  },
  matchTextWrap: {
    flex: 1,
    position: 'relative',
  },
  fillWordWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
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
    ...outlineOn(colors),
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
    ...outlineOn(colors),
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
    ...outlineOn(colors),
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
    gap: 26,
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
  /** A paired chip is painted with the pair's wash, so its text leaves the theme. */
  matchTextOnWash: {
    color: onWash.ink,
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
