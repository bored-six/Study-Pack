import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import {
  buildCustomQuestion,
  CUSTOM_ISSUE_LABEL,
  CUSTOM_LIMITS,
  type CustomIssue,
} from '@/lib/customQuestion';
import { suggestDistractors } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import { font, getColors, outlineOn, radius, shadow, subjectInkFor, useThemeStore } from '@/theme/tokens';

const BLANK_DECOYS = ['', '', ''];

/** Mistakes to correct, as opposed to fields not filled in yet. */
const MISTAKES: CustomIssue[] = ['repeated_option', 'prompt_too_long', 'answer_too_long'];

export default function CustomQuestionScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const insets = useSafeAreaInsets();
  const { subjects, targetId, setTarget, poolFor, stageCustom, refresh } = useNotesStore();

  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [decoys, setDecoys] = useState<string[]>(BLANK_DECOYS);
  const [pool, setPool] = useState<string[]>([]);
  /** Bumped on every suggestion, so asking twice offers different terms. */
  const [reroll, setReroll] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  // Wrong answers are borrowed from the subject the question is going into,
  // so the pool follows whichever subject is picked.
  useEffect(() => {
    let live = true;
    if (!targetId) {
      setPool([]);
      return;
    }
    poolFor(targetId)
      .then((options) => {
        if (live) setPool(options);
      })
      .catch(() => {
        if (live) setPool([]);
      });
    return () => {
      live = false;
    };
  }, [targetId, poolFor]);

  const suggestions = useMemo(
    () => suggestDistractors(answer, pool, `${prompt}|${answer}|${reroll}`),
    [answer, pool, prompt, reroll]
  );

  const build = useMemo(
    () => buildCustomQuestion({ prompt, answer, decoys }),
    [prompt, answer, decoys]
  );

  const started = prompt.trim().length > 0 || answer.trim().length > 0;
  const mistakes = build.issues.filter((issue) => MISTAKES.includes(issue));
  const missing = build.issues.filter((issue) => !MISTAKES.includes(issue));

  /** Fills only the blanks, so a wrong answer already written is never lost. */
  const suggest = useCallback(() => {
    const spare = [...suggestions];
    setDecoys((current) =>
      current.map((decoy) => (decoy.trim() ? decoy : (spare.shift() ?? '')))
    );
    setReroll((n) => n + 1);
  }, [suggestions]);

  const editDecoy = useCallback((index: number, text: string) => {
    setDecoys((current) => current.map((decoy, i) => (i === index ? text : decoy)));
  }, []);

  const submit = useCallback(() => {
    if (!build.question) return;
    stageCustom(build.question, targetId);
    router.push('/notes/review');
  }, [build.question, stageCustom, targetId]);

  const picked = subjects.find((s) => s.id === targetId) ?? null;
  const canSuggest = answer.trim().length > 0 && suggestions.length > 0;

  const borrowHint = !picked
    ? subjects.length > 0
      ? 'Pick a subject above and we can borrow wrong answers from it.'
      : "You have no subjects yet, so there's nothing to borrow from — write three wrong answers."
    : pool.length === 0
      ? `${picked.name} has no questions yet, so there's nothing to borrow — write three wrong answers.`
      : canSuggest
        ? `Borrowed from ${picked.name}. Change any that don't fit.`
        : answer.trim().length === 0
          ? `Write the right answer and we'll borrow wrong ones from ${picked.name}.`
          : `${picked.name} doesn't have enough terms to borrow from yet — write them yourself.`;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <RuledPaper />
        <View style={styles.navRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Write</Text>
              <View style={styles.titleSticker}>
                <Text style={styles.titleStickerText}>a question!</Text>
              </View>
            </View>
            <Squiggle width={84} style={styles.squiggle} />
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.tip}>
            <Tape rotate="3deg" />
            <Icon name="bulb" size={18} color={colors.ink} fill={colors.goldWash} strokeWidth={1.9} />
            <Text style={styles.tipText}>
              You write the question and the right answer.{' '}
              <Text style={styles.tipStrong}>We fill in the wrong ones</Text> from terms this
              subject already knows.
            </Text>
          </View>

          {subjects.length > 0 ? (
            <View style={styles.card}>
              <Tape />
              <Text style={styles.cardLabel}>SUBJECT</Text>
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
                        style={[styles.chipText, active && { color: subjectInkFor(subject.color) }]}>
                        {subject.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Your question</Text>
          <View style={styles.inputBox}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              accessibilityLabel="Your question"
              placeholder="Which organelle releases energy from glucose?"
              placeholderTextColor={colors.textFaint}
              style={styles.promptInput}
              multiline
              maxLength={CUSTOM_LIMITS.maxPromptChars + 40}
              textAlignVertical="top"
            />
          </View>

          <Text style={styles.label}>The right answer</Text>
          <View style={styles.inputBox}>
            <TextInput
              value={answer}
              onChangeText={setAnswer}
              accessibilityLabel="The right answer"
              placeholder="Mitochondria"
              placeholderTextColor={colors.textFaint}
              style={styles.answerInput}
              maxLength={CUSTOM_LIMITS.maxAnswerChars + 20}
              returnKeyType="done"
            />
            <View style={styles.answerMark}>
              <Icon name="check" size={13} color={colors.leaf} strokeWidth={3} />
            </View>
          </View>

          {build.givesItselfAway ? (
            <View style={styles.warn}>
              <Icon name="alert" size={15} color={colors.gold} fill={colors.goldWash} strokeWidth={2} />
              <Text style={styles.warnText}>
                The question contains its answer, so it gives itself away. Fine if you meant it.
              </Text>
            </View>
          ) : null}

          <View style={styles.decoyHead}>
            <Text style={styles.label}>Wrong answers</Text>
            <Pressable
              onPress={suggest}
              disabled={!canSuggest}
              hitSlop={8}
              style={({ pressed }) => [
                styles.suggestBtn,
                !canSuggest && styles.suggestBtnOff,
                pressed && canSuggest && styles.pressed,
              ]}>
              <Icon
                name="spark"
                size={13}
                color={canSuggest ? colors.accentDeep : colors.disabledText}
                fill={canSuggest ? colors.accentWash : 'none'}
                strokeWidth={2}
              />
              <Text style={[styles.suggestText, !canSuggest && styles.suggestTextOff]}>
                Suggest
              </Text>
            </Pressable>
          </View>

          <View style={styles.decoyList}>
            {decoys.map((decoy, i) => (
              <View key={i} style={styles.inputBox}>
                <View style={styles.decoyMark} />
                <TextInput
                  value={decoy}
                  onChangeText={(text) => editDecoy(i, text)}
                  accessibilityLabel={`Wrong answer ${i + 1}`}
                  placeholder={`Wrong answer ${i + 1}`}
                  placeholderTextColor={colors.textFaint}
                  style={styles.decoyInput}
                  maxLength={CUSTOM_LIMITS.maxAnswerChars + 20}
                  returnKeyType="done"
                />
              </View>
            ))}
          </View>
          <Text style={styles.hint}>{borrowHint}</Text>

          {mistakes.map((issue) => (
            <Text key={issue} style={styles.mistake}>
              {CUSTOM_ISSUE_LABEL[issue]}
            </Text>
          ))}
          {started
            ? missing.map((issue) => (
                <Text key={issue} style={styles.missing}>
                  {CUSTOM_ISSUE_LABEL[issue]}
                </Text>
              ))
            : null}

          <ChunkyButton
            label="Review question"
            icon="bolt"
            size="lg"
            disabled={build.question == null}
            onPress={submit}
            style={styles.cta}
          />
          <Text style={styles.footnote}>
            Runs entirely on your phone — no internet, no AI, nothing uploaded.
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.accentWash,
    ...outlineOn(colors),
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 1,
    transform: [{ rotate: '-2.5deg' }],
    ...shadow.card,
  },
  titleStickerText: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 27,
    color: colors.ink,
  },
  squiggle: {
    marginTop: 1,
    marginLeft: 2,
  },
  content: {
    gap: 8,
  },
  tip: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.control,
    padding: 13,
    marginTop: 4,
    ...shadow.card,
  },
  tipText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
  },
  tipStrong: {
    fontFamily: font.bodyHeavy,
  },
  card: {
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.card,
    padding: 14,
    paddingTop: 18,
    marginTop: 10,
    ...shadow.card,
  },
  cardLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.textFaint,
    marginBottom: 9,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface2,
    ...outlineOn(colors),
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.textDim,
  },
  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textDim,
    marginTop: 10,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.control,
    paddingHorizontal: 13,
    ...shadow.card,
  },
  promptInput: {
    flex: 1,
    fontFamily: font.hero,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    paddingVertical: 12,
    minHeight: 76,
  },
  answerInput: {
    flex: 1,
    fontFamily: font.hero,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    paddingVertical: 12,
  },
  answerMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.leafWash,
    ...outlineOn(colors),
    borderColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decoyHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginTop: 10,
    ...shadow.card,
  },
  suggestBtnOff: {
    backgroundColor: colors.disabledBg,
    borderColor: colors.line,
  },
  suggestText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.accentDeep,
  },
  suggestTextOff: {
    color: colors.disabledText,
  },
  decoyList: {
    gap: 7,
    marginTop: 2,
  },
  decoyMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.line,
    marginRight: 9,
  },
  decoyInput: {
    flex: 1,
    fontFamily: font.hero,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    paddingVertical: 10,
  },
  hint: {
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textFaint,
    marginTop: 6,
  },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.goldWash,
    ...outlineOn(colors),
    borderRadius: radius.control,
    padding: 11,
    marginTop: 8,
  },
  warnText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.gold,
  },
  mistake: {
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    color: colors.coral,
    marginTop: 6,
  },
  missing: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: 6,
  },
  cta: {
    marginTop: 18,
  },
  footnote: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 10,
  },
  pressed: {
    opacity: 0.75,
  },
});
