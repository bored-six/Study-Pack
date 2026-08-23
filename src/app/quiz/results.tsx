import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DIFFICULTY_LABEL } from '@/lib/types';
import { useQuizStore } from '@/store/quiz';
import { colors, font, radius } from '@/theme/tokens';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { deck, questions, score, durationMs } = useQuizStore();

  // Only reachable by finishing a quiz; a cold deep link goes home.
  if (!deck || questions.length === 0) {
    return <Redirect href="/" />;
  }

  const total = questions.length;
  const pct = Math.round((score / total) * 100);
  const tone =
    pct >= 80
      ? { color: colors.leaf, wash: colors.leafWash, label: 'Excellent' }
      : pct >= 50
        ? { color: colors.gold, wash: colors.goldWash, label: 'Solid effort' }
        : { color: colors.coral, wash: colors.coralWash, label: 'Keep practicing' };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
      ]}>
      <View style={styles.card}>
        <View style={[styles.badge, { backgroundColor: tone.wash }]}>
          <Text style={[styles.badgeText, { color: tone.color }]}>{tone.label}</Text>
        </View>
        <Text style={styles.score}>
          {score}/{total}
        </Text>
        <Text style={styles.pct}>{pct}% correct</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{deck.name}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{DIFFICULTY_LABEL[deck.difficulty]}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{formatDuration(durationMs)}</Text>
        </View>

        <Text style={styles.saved}>✓ Saved to Progress on this device</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() =>
            router.replace({ pathname: '/quiz/[deckId]', params: { deckId: deck.id } })
          }
          style={({ pressed }) => [styles.btnWash, pressed && styles.pressed]}>
          <Text style={styles.btnWashText}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
          <Text style={styles.btnPrimaryText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  badgeText: {
    fontFamily: font.bold,
    fontSize: 12.5,
  },
  score: {
    fontFamily: font.bold,
    fontSize: 52,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  pct: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.textDim,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  metaText: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.textFaint,
  },
  metaDot: {
    color: colors.textFaint,
  },
  saved: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.accentDeep,
    marginTop: 14,
  },
  actions: {
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.onAccent,
  },
  btnWash: {
    backgroundColor: colors.accentWash,
    borderRadius: radius.control,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnWashText: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.accentDeep,
  },
  pressed: {
    opacity: 0.7,
  },
});
