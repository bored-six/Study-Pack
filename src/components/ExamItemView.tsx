import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
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

function Prompt({ text }: { text: string }) {
  return <Text style={styles.prompt}>{text}</Text>;
}

// --- multiple choice ----------------------------------------------------

function Choice({ item, onDone }: { item: ChoiceItem; onDone: (c: boolean) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const revealed = picked != null;

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
              onPress={() => setPicked(option)}
              style={({ pressed }) => [
                styles.option,
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
            </Pressable>
          );
        })}
      </View>
      {revealed ? (
        <Verdict
          correct={picked === item.correctAnswer}
          onNext={() => onDone(picked === item.correctAnswer)}
        />
      ) : (
        <Text style={styles.hint}>Pick an answer</Text>
      )}
    </View>
  );
}

// --- true / false -------------------------------------------------------

function TrueFalse({ item, onDone }: { item: TrueFalseItem; onDone: (c: boolean) => void }) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const revealed = picked != null;
  const correct = picked === item.isTrue;

  return (
    <View style={styles.body}>
      <Text style={styles.statement}>{item.statement}</Text>
      <View style={styles.tfRow}>
        {[true, false].map((value) => {
          const chosen = picked === value;
          const isAnswer = item.isTrue === value;
          return (
            <Pressable
              key={String(value)}
              disabled={revealed}
              onPress={() => setPicked(value)}
              style={({ pressed }) => [
                styles.tfBtn,
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
      ) : null}
    </View>
  );
}

// --- modified true / false ---------------------------------------------

function ModifiedTrueFalse({
  item,
  onDone,
}: {
  item: ModifiedTrueFalseItem;
  onDone: (c: boolean) => void;
}) {
  const [saidTrue, setSaidTrue] = useState<boolean | null>(null);
  const [wordIndex, setWordIndex] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);

  // Calling a false statement true (or vice versa) ends it immediately.
  const wrongCall = saidTrue != null && saidTrue !== item.isTrue;
  const correctWordPicked = wordIndex === item.falseWordIndex;
  const correctFix = checkAnswer(typed, item.correctWord).correct;
  const nearFix = checkAnswer(typed, item.correctWord).nearMiss;
  const finalCorrect = item.isTrue
    ? saidTrue === true
    : saidTrue === false && correctWordPicked && correctFix;

  if (saidTrue == null) {
    return (
      <View style={styles.body}>
        <Text style={styles.statement}>{item.words.join(' ')}</Text>
        <View style={styles.tfRow}>
          {[true, false].map((value) => (
            <Pressable
              key={String(value)}
              onPress={() => {
                setSaidTrue(value);
                if (value !== item.isTrue || item.isTrue) setDone(true);
              }}
              style={({ pressed }) => [styles.tfBtn, pressed && styles.pressed]}>
              <Text style={styles.tfText}>{value ? 'True' : 'False'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // Said false on a false statement: now find and fix the word.
  if (!wrongCall && !item.isTrue && !done) {
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
                disabled={wordIndex != null}
                onPress={() => setWordIndex(i)}
                style={({ pressed }) => [
                  styles.word,
                  chosen && styles.wordChosen,
                  pressed && wordIndex == null && styles.pressed,
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
              onChangeText={setTyped}
              placeholder="Type the correct word"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={() => setDone(true)}
            />
            <ChunkyButton
              label="Check"
              size="lg"
              disabled={typed.trim().length === 0}
              onPress={() => setDone(true)}
            />
          </>
        ) : null}
      </View>
    );
  }

  const detail = wrongCall
    ? item.isTrue
      ? 'That statement was true'
      : 'That statement was false'
    : !correctWordPicked
      ? `The wrong word was "${item.words[item.falseWordIndex]}"`
      : nearFix
        ? `Close — you typed "${typed.trim()}", the answer was "${item.correctWord}"`
        : `The answer was "${item.correctWord}"`;

  return (
    <View style={styles.body}>
      <Text style={styles.statement}>{item.words.join(' ')}</Text>
      <Verdict correct={finalCorrect} detail={detail} onNext={() => onDone(finalCorrect)} />
    </View>
  );
}

// --- typed answers ------------------------------------------------------

function Typed({ item, onDone }: { item: TypedItem; onDone: (c: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const result = checkAnswer(typed, item.correctAnswer);

  return (
    <View style={styles.body}>
      <Prompt text={item.prompt} />
      <TextInput
        value={typed}
        onChangeText={setTyped}
        editable={!checked}
        placeholder="Type your answer"
        placeholderTextColor={colors.textFaint}
        style={[
          styles.input,
          checked && (result.correct ? styles.inputGood : styles.inputBad),
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={() => typed.trim() && setChecked(true)}
      />
      {checked ? (
        <Verdict
          correct={result.correct}
          detail={
            result.nearMiss
              ? `Close — you typed "${typed.trim()}", the answer was "${item.correctAnswer}"`
              : `The answer was "${item.correctAnswer}"`
          }
          onNext={() => onDone(result.correct)}
        />
      ) : (
        <ChunkyButton
          label="Check"
          size="lg"
          disabled={typed.trim().length === 0}
          onPress={() => setChecked(true)}
        />
      )}
    </View>
  );
}

// --- matching -----------------------------------------------------------

function Matching({ item, onDone }: { item: MatchingItem; onDone: (c: boolean) => void }) {
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [activeTerm, setActiveTerm] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  const allPaired = Object.keys(pairs).length === item.terms.length;
  const correct = item.terms.every((_, i) => pairs[i] === item.correctIndexFor[i]);
  const takenMeanings = new Set(Object.values(pairs));

  return (
    <View style={styles.body}>
      <Text style={styles.stepLabel}>Tap a term, then tap its meaning.</Text>

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
                onPress={() => setActiveTerm(activeTerm === i ? null : i)}
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
                setPairs((p) => ({ ...p, [activeTerm]: j }));
                setActiveTerm(null);
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
        <Verdict
          correct={correct}
          detail="Some pairs were wrong"
          onNext={() => onDone(correct)}
        />
      ) : (
        <ChunkyButton
          label="Check"
          size="lg"
          disabled={!allPaired}
          onPress={() => setChecked(true)}
        />
      )}
    </View>
  );
}

// --- enumeration --------------------------------------------------------

function Enumeration({ item, onDone }: { item: EnumerationItem; onDone: (c: boolean) => void }) {
  const [entries, setEntries] = useState<string[]>(() => item.items.map(() => ''));
  const [checked, setChecked] = useState(false);
  const result = checkEnumeration(entries, item.items, item.ordered);

  return (
    <View style={styles.body}>
      <Prompt text={item.prompt} />
      {item.ordered ? <Text style={styles.stepLabel}>Order matters here.</Text> : null}

      <View style={styles.options}>
        {item.items.map((_, i) => {
          const outcome = checked ? result.results[i] : null;
          return (
            <View key={i} style={styles.enumRow}>
              <Text style={styles.enumNum}>{i + 1}</Text>
              <TextInput
                value={entries[i]}
                onChangeText={(text) =>
                  setEntries((prev) => prev.map((e, k) => (k === i ? text : e)))
                }
                editable={!checked}
                placeholder={checked ? item.items[i] : '…'}
                placeholderTextColor={colors.textFaint}
                style={[
                  styles.input,
                  styles.enumInput,
                  outcome?.matched != null && styles.inputGood,
                  checked && outcome?.matched == null && styles.inputBad,
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
      ) : (
        <ChunkyButton
          label="Check"
          size="lg"
          disabled={entries.every((e) => e.trim().length === 0)}
          onPress={() => setChecked(true)}
        />
      )}
    </View>
  );
}

// --- dispatcher ---------------------------------------------------------

export function ExamItemView({ item, onDone }: Props) {
  switch (item.format) {
    case 'multiple_choice':
      return <Choice key={item.id} item={item} onDone={onDone} />;
    case 'true_false':
      return <TrueFalse key={item.id} item={item} onDone={onDone} />;
    case 'modified_true_false':
      return <ModifiedTrueFalse key={item.id} item={item} onDone={onDone} />;
    case 'identification':
    case 'fill_blank':
      return <Typed key={item.id} item={item} onDone={onDone} />;
    case 'matching':
      return <Matching key={item.id} item={item} onDone={onDone} />;
    case 'enumeration':
      return <Enumeration key={item.id} item={item} onDone={onDone} />;
  }
}

const styles = StyleSheet.create({
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
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.text,
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
