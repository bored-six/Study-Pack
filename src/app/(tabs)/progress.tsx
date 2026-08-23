import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { type AttemptWithDeck } from '@/lib/db';
import { useProgressStore } from '@/store/progress';
import { colors, font, outline, radius, shadow, tabClearance } from '@/theme/tokens';

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
      <Text style={styles.kicker}>STUDYPACK</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Your</Text>
        <View style={styles.titleSticker}>
          <Text style={styles.titleStickerText}>progress</Text>
        </View>
      </View>
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
          <View style={styles.emptyBadge}>
            <Icon name="sprout" size={26} color={colors.ink} fill={colors.accentWash} />
          </View>
          <Text style={styles.emptyTitle}>No quizzes yet</Text>
          <Text style={styles.emptyBody}>
            Download a deck and take your first quiz — your scores and streak will live
            here, even offline.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.stats}>
            <View style={[styles.stat, styles.statStreak]}>
              <Icon name="flame" size={24} color={colors.ink} fill={colors.gold} />
              <Text style={[styles.statNum, { color: colors.gold }]}>{currentStreak}</Text>
              <Text style={styles.statLabel}>day streak</Text>
            </View>
            <View style={styles.stat}>
              <Icon name="trophy" size={24} color={colors.ink} fill={colors.accent} />
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
            <Icon name="bolt" size={13} color={colors.ink} fill={colors.gold} strokeWidth={2.2} />
            <Text style={styles.longestText}>Longest streak: {longestStreak}{' '}
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
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 32,
    lineHeight: 42,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.goldWash,
    ...outline,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-2.5deg' }],
    ...shadow.card,
  },
  titleStickerText: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadow.card,
  },
  statStreak: {
    backgroundColor: colors.goldWash,
    transform: [{ rotate: '-1deg' }],
  },
  statNum: {
    marginTop: 4,
    fontFamily: font.hero,
    fontSize: 32,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.textDim,
  },
  listCard: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    marginTop: 14,
    flexGrow: 0,
    flexShrink: 1,
    ...shadow.card,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  separator: {
    height: 1,
    backgroundColor: colors.lineSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
  },
  rowLeft: {
    flexShrink: 1,
  },
  rowName: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  rowWhen: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 1,
  },
  chip: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  longestPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.goldWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginTop: 12,
    marginBottom: tabClearance,
  },
  longestText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.gold,
  },
  empty: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
    ...shadow.card,
  },
  emptyBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
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
});
