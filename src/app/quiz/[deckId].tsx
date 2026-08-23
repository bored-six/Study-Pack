import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { RuledPaper } from '@/components/notebook';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useQuizStore } from '@/store/quiz';
import { candy, colors, font, outline, radius, shadow } from '@/theme/tokens';

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { status, deck, questions, index, selected, error, start, choose, advance } =
    useQuizStore();

  useEffect(() => {
    if (deckId) void start(deckId);
  }, [deckId, start]);

  const [quitting, setQuitting] = useState(false);

  const handleQuit = useCallback(() => setQuitting(true), []);

  const handleAdvance = useCallback(() => {
    void advance().then((result) => {
      if (result === 'finished') router.replace('/quiz/results');
    });
  }, [advance]);

  if (status === 'loading' || status === 'idle') {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.accentDeep} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.screen, styles.center, { padding: 24 }]}>
        <View style={styles.errorCard}>
          <View style={styles.errorBadge}>
            <Icon name="alert" size={26} color={colors.ink} fill={colors.coralWash} />
          </View>
          <Text style={styles.errorTitle}>Can't start this quiz</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <ChunkyButton
            label="Back to decks"
            size="lg"
            onPress={() => router.back()}
            style={styles.errorBtn}
          />
        </View>
      </View>
    );
  }

  const question = questions[index];
  if (!question) return null;

  const revealed = selected != null;
  const gotItRight = revealed && selected === question.correctAnswer;
  const isLast = index + 1 === questions.length;
  const progress = (index + (revealed ? 1 : 0)) / questions.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <RuledPaper />
      <View style={styles.header}>
        <Pressable
          onPress={handleQuit}
          hitSlop={12}
          style={({ pressed }) => [styles.quitBtn, pressed && styles.pressed]}>
          <Icon name="cross" size={15} color={colors.textDim} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.counter}>
          {index + 1} / {questions.length}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <OfflineBanner
        message="Offline — running from device storage"
        style={styles.offline}
      />

      <Text style={styles.deckName}>{deck?.name}</Text>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.prompt}>{question.prompt}</Text>

        <View style={styles.answers}>
          {question.answers.map((answer, i) => {
            const isCorrect = answer === question.correctAnswer;
            const isSelected = answer === selected;
            const showCorrect = revealed && isCorrect;
            const showWrong = revealed && isSelected && !isCorrect;
            const tone = candy[i % candy.length];
            return (
              <Pressable
                key={answer}
                disabled={revealed}
                onPress={() => choose(answer)}
                style={({ pressed }) => [
                  styles.answer,
                  showCorrect && styles.answerCorrect,
                  showWrong && styles.answerWrong,
                  revealed && !showCorrect && !showWrong && styles.answerFaded,
                  pressed && !revealed && styles.answerPressed,
                ]}>
                <View style={[styles.letterChip, { backgroundColor: tone.wash }]}>
                  <Text style={styles.letterChipText}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.answerText,
                    showCorrect && styles.answerTextCorrect,
                    showWrong && styles.answerTextWrong,
                  ]}>
                  {answer}
                </Text>
                {showCorrect ? (
                  <Icon name="check" size={17} color={colors.leaf} strokeWidth={2.8} />
                ) : null}
                {showWrong ? (
                  <Icon name="cross" size={15} color={colors.coral} strokeWidth={2.8} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <ConfirmModal
        visible={quitting}
        title="Quit quiz?"
        message="This run won't be saved."
        confirmLabel="Quit"
        cancelLabel="Keep going"
        destructive
        onCancel={() => setQuitting(false)}
        onConfirm={() => {
          setQuitting(false);
          router.back();
        }}
      />

      <View style={{ paddingBottom: insets.bottom + 16 }}>
        {revealed ? (
          <>
            <Text style={[styles.feedback, gotItRight ? styles.feedbackRight : styles.feedbackWrong]}>
              {gotItRight ? 'Nice one!' : 'Not quite'}
            </Text>
            <ChunkyButton
              label={isLast ? 'See results' : 'Next question'}
              size="lg"
              onPress={handleAdvance}
            />
          </>
        ) : (
          <Text style={styles.hint}>Tap an answer</Text>
        )}
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quitBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    fontFamily: font.heading,
    fontSize: 13.5,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    borderWidth: 1.5,
    borderColor: colors.edge,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  offline: {
    marginTop: 12,
  },
  deckName: {
    fontFamily: font.bodyHeavy,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: 14,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 16,
  },
  prompt: {
    fontFamily: font.heading,
    fontSize: 21,
    lineHeight: 28,
    color: colors.text,
    marginTop: 6,
    marginBottom: 18,
  },
  answers: {
    gap: 10,
  },
  answer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 12,
    ...shadow.card,
  },
  answerPressed: {
    backgroundColor: colors.accentWash,
  },
  answerCorrect: {
    backgroundColor: colors.leafWash,
  },
  answerWrong: {
    backgroundColor: colors.coralWash,
  },
  answerFaded: {
    opacity: 0.45,
  },
  letterChip: {
    width: 30,
    height: 30,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  letterChipText: {
    fontFamily: font.hero,
    fontSize: 17,
    color: colors.ink,
  },
  answerText: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  answerTextCorrect: {
    fontFamily: font.bodyHeavy,
    color: colors.leaf,
  },
  answerTextWrong: {
    fontFamily: font.bodyHeavy,
    color: colors.coral,
  },
  feedback: {
    fontFamily: font.hero,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  feedbackRight: {
    color: colors.leaf,
  },
  feedbackWrong: {
    color: colors.coral,
  },
  hint: {
    fontFamily: font.bodyBold,
    fontSize: 13.5,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: 16,
  },
  errorCard: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    ...shadow.card,
  },
  errorBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    transform: [{ rotate: '-3deg' }],
  },
  errorTitle: {
    fontFamily: font.heading,
    fontSize: 17,
    color: colors.text,
  },
  errorBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
  },
  errorBtn: {
    marginTop: 8,
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.7,
  },
});
