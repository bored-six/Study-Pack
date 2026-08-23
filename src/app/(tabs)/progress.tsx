import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AttemptWithDeck } from '@/lib/db';
import { useProgressStore } from '@/store/progress';
import { colors, font, radius } from '@/theme/tokens';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function localDayIndex(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

function formatWhen(timestamp: number): string {
  const diff = localDayIndex(Date.now()) - localDayIndex(timestamp);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const date = new Date(timestamp);
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function scoreTone(score: number, total: number) {
  const pct = (score / total) * 100;
  if (pct >= 80) return { bg: colors.leafWash, fg: colors.leaf };
  if (pct >= 50) return { bg: colors.goldWash, fg: colors.gold };
  return { bg: colors.coralWash, fg: colors.coral };
}

function AttemptRow({ attempt }: { attempt: AttemptWithDeck }) {
  const tone = scoreTone(attempt.score, attempt.total);
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName} numberOfLines={1}>
          {attempt.deckName}
        </Text>
        <Text style={styles.rowWhen}>
          {formatWhen(attempt.completedAt)} · {formatDuration(attempt.durationMs)}
        </Text>
      </View>
      <View style={[styles.chip, { backgroundColor: tone.bg }]}>
        <Text style={[styles.chipText, { color: tone.fg }]}>
          {attempt.score}/{attempt.total}
        </Text>
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const {
    attempts,
    totalAttempts,
    bestPct,
    currentStreak,
    longestStreak,
    status,
    refresh,
  } = useProgressStore();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const empty = status === 'ready' && attempts.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.sub}>
        {totalAttempts > 0
          ? `${totalAttempts} ${totalAttempts === 1 ? 'quiz' : 'quizzes'} · saved on this device`
          : 'Saved on this device'}
      </Text>

      {status === 'loading' || status === 'idle' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentDeep} />
        </View>
      ) : empty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No quizzes yet</Text>
          <Text style={styles.emptyBody}>
            Download a deck and take your first quiz — your scores and streak will live
            here, even offline.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: colors.gold }]}>{currentStreak}</Text>
              <Text style={styles.statLabel}>
                {currentStreak === 1 ? 'day streak' : 'day streak'}
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: colors.accentDeep }]}>
                {bestPct != null ? `${bestPct}%` : '—'}
              </Text>
              <Text style={styles.statLabel}>best score</Text>
            </View>
          </View>

          <FlatList
            data={attempts}
            keyExtractor={(attempt) => String(attempt.id)}
            renderItem={({ item }) => <AttemptRow attempt={item} />}
            style={styles.listCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />

          <View style={styles.longestPill}>
            <Text style={styles.longestText}>▲ Longest streak: {longestStreak}{' '}
              {longestStreak === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 28,
    color: colors.text,
  },
  sub: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statNum: {
    fontFamily: font.bold,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: colors.textDim,
    marginTop: 1,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    marginTop: 12,
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.hairlineSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
  },
  rowLeft: {
    flexShrink: 1,
  },
  rowName: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: colors.text,
  },
  rowWhen: {
    fontFamily: font.medium,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 1,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: font.bold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  longestPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldWash,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 16,
  },
  longestText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    color: colors.gold,
  },
  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  emptyTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
  },
});
