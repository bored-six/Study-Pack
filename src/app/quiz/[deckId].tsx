import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuizStore } from '@/store/quiz';
import { colors, font, radius } from '@/theme/tokens';

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { status, deck, questions, index, selected, error, start, choose, advance } =
    useQuizStore();

  useEffect(() => {
    if (deckId) void start(deckId);
  }, [deckId, start]);

  const handleQuit = useCallback(() => {
    Alert.alert('Quit quiz?', "This run won't be saved.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Quit', style: 'destructive', onPress: () => router.back() },
    ]);
  }, []);

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
          <Text style={styles.errorTitle}>Can't start this quiz</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.nextBtn, pressed && styles.pressed]}>
            <Text style={styles.nextBtnText}>Back to decks</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const question = questions[index];
  if (!question) return null;

  const revealed = selected != null;
  const isLast = index + 1 === questions.length;
  const progress = (index + (revealed ? 1 : 0)) / questions.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={handleQuit} hitSlop={12} style={styles.quitBtn}>
          <Text style={styles.quitText}>✕</Text>
        </Pressable>
        <Text style={styles.counter}>
          {index + 1} / {questions.length}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <Text style={styles.deckName}>{deck?.name}</Text>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.prompt}>{question.prompt}</Text>

        <View style={styles.answers}>
          {question.answers.map((answer) => {
            const isCorrect = answer === question.correctAnswer;
            const isSelected = answer === selected;
            const showCorrect = revealed && isCorrect;
            const showWrong = revealed && isSelected && !isCorrect;
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
                  pressed && !revealed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.answerText,
                    showCorrect && styles.answerTextCorrect,
                    showWrong && styles.answerTextWrong,
                  ]}>
                  {answer}
                </Text>
                {showCorrect ? <Text style={styles.markCorrect}>✓</Text> : null}
                {showWrong ? <Text style={styles.markWrong}>✕</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 16 }}>
        {revealed ? (
          <Pressable
            onPress={handleAdvance}
            style={({ pressed }) => [styles.nextBtn, pressed && styles.pressed]}>
            <Text style={styles.nextBtnText}>{isLast ? 'See results' : 'Next question'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>Pick an answer</Text>
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
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quitText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.textDim,
  },
  counter: {
    fontFamily: font.bold,
    fontSize: 12.5,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accentDeep,
  },
  deckName: {
    fontFamily: font.semibold,
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
    fontFamily: font.semibold,
    fontSize: 20,
    lineHeight: 27,
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
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  answerCorrect: {
    backgroundColor: colors.leafWash,
    borderColor: 'rgba(59, 117, 39, 0.25)',
    borderWidth: 1,
  },
  answerWrong: {
    backgroundColor: colors.coralWash,
    borderColor: 'rgba(180, 79, 63, 0.22)',
    borderWidth: 1,
  },
  answerFaded: {
    opacity: 0.5,
  },
  answerText: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.text,
  },
  answerTextCorrect: {
    fontFamily: font.semibold,
    color: colors.leaf,
  },
  answerTextWrong: {
    fontFamily: font.semibold,
    color: colors.coral,
  },
  markCorrect: {
    fontFamily: font.bold,
    fontSize: 14,
    color: colors.leaf,
  },
  markWrong: {
    fontFamily: font.bold,
    fontSize: 14,
    color: colors.coral,
  },
  nextBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    paddingVertical: 13,
    alignItems: 'center',
  },
  nextBtnText: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.onAccent,
  },
  hint: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: 13,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  errorTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.text,
  },
  errorBody: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});
