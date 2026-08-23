import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AchievementModal } from '@/components/AchievementModal';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle } from '@/components/notebook';
import { type AttemptWithDeck } from '@/lib/db';
import { daysToNextTier, fireFor } from '@/lib/fire';
import { masteryLabel, type SubjectMastery } from '@/lib/mastery';
import { ACHIEVEMENTS, achievementById, type Unlock } from '@/lib/achievements';
import { useAchievementsStore } from '@/store/achievements';
import { useMomentsStore } from '@/store/moments';
import { useProgressStore } from '@/store/progress';
import { colors, font, radius, tabClearance } from '@/theme/tokens';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
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

/** Warm for shaky, green for solid — the bar reads before the number does. */
function masteryColor(percent: number): string {
  if (percent >= 85) return colors.leaf;
  if (percent >= 60) return colors.accentDeep;
  if (percent >= 30) return colors.gold;
  return colors.coral;
}

function SubjectRow({ subject }: { subject: SubjectMastery }) {
  const tone = masteryColor(subject.percent);
  const note =
    subject.unseen > 0
      ? `${subject.unseen} not seen yet`
      : subject.weak > 0
        ? `${subject.weak} to review`
        : 'all steady';

  return (
    <View style={styles.subjectRow}>
      <View style={styles.subjectHead}>
        <Text style={styles.subjectName} numberOfLines={1}>
          {subject.deckName}
        </Text>
        <Text style={[styles.subjectPct, { color: tone }]}>{subject.percent}%</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.barFill, { width: `${subject.percent}%`, backgroundColor: tone }]}
        />
      </View>
      <Text style={styles.subjectNote}>
        {masteryLabel(subject.percent)} · {note}
      </Text>
    </View>
  );
}

function AttemptRow({ attempt }: { attempt: AttemptWithDeck }) {
  return (
    <View style={styles.attemptRow}>
      <Text style={styles.attemptName} numberOfLines={1}>
        {attempt.deckName}
      </Text>
      <Text style={styles.attemptMeta}>
        {formatWhen(attempt.completedAt)} · {formatDuration(attempt.durationMs)}
      </Text>
      <Text style={styles.attemptScore}>
        {attempt.score}/{attempt.total}
      </Text>
    </View>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const {
    attempts,
    totalAttempts,
    subjects,
    weakCount,
    currentStreak,
    longestStreak,
    status,
    refresh,
  } = useProgressStore();
  const { log: moments, refresh: refreshMoments } = useMomentsStore();
  const { unlocked, refresh: refreshAchievements } = useAchievementsStore();
  const [viewing, setViewing] = useState<Unlock | null>(null);
  const [lockedTapped, setLockedTapped] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshMoments();
      void refreshAchievements();
    }, [refresh, refreshMoments, refreshAchievements])
  );

  if (status !== 'ready') {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator color={colors.accentDeep} />
      </View>
    );
  }

  const nothingYet = totalAttempts === 0 && subjects.length === 0;
  const fire = fireFor(currentStreak);
  const toNextFire = currentStreak > 0 ? daysToNextTier(currentStreak) : null;

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>FLIPP</Text>
        <Text style={styles.title}>Progress</Text>
        <Squiggle color={colors.gold} style={styles.squiggle} />

        {nothingYet ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing to show yet</Text>
            <Text style={styles.emptyBody}>
              Add your notes and take a quiz. Every answer counts towards how well you
              know each subject — so this fills in as you go.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.streak}>
              <View style={styles.streakRow}>
                <Icon name={fire.icon} size={30} color={colors.ink} fill={fire.color} />
                <Text style={styles.streakNum}>{currentStreak}</Text>
                <Text style={[styles.fireName, { color: fire.color }]}>{fire.name}</Text>
              </View>
              <Text style={styles.streakLabel}>
                day streak{longestStreak > currentStreak ? ` · best ${longestStreak}` : ''}
              </Text>
              {toNextFire != null ? (
                <Text style={styles.fireNext}>
                  {toNextFire} more {toNextFire === 1 ? 'day' : 'days'} and the fire grows.
                </Text>
              ) : null}
            </View>

            {subjects.length > 0 ? (
              <>
                <Text style={styles.section}>SUBJECTS</Text>
                {subjects.map((subject) => (
                  <SubjectRow key={subject.deckId} subject={subject} />
                ))}
              </>
            ) : null}

            {weakCount > 0 ? (
              <View style={styles.weak}>
                <Text style={styles.weakNum}>{weakCount}</Text>
                <Text style={styles.weakLabel}>
                  question{weakCount === 1 ? '' : 's'} keep tripping you up
                </Text>
              </View>
            ) : null}

            <Text style={styles.section}>
              ACHIEVEMENTS · {unlocked.length} OF {ACHIEVEMENTS.length} FOUND
            </Text>
            <View style={styles.achGrid}>
              {unlocked.map((unlock) => {
                const def = achievementById(unlock.id);
                if (!def) return null;
                return (
                  <Pressable
                    key={unlock.id}
                    onPress={() => setViewing(unlock)}
                    style={({ pressed }) => [styles.achTile, pressed && { opacity: 0.8 }]}>
                    <Icon name={def.icon} size={22} color={colors.ink} fill={colors.goldWash} strokeWidth={1.9} />
                    <Text style={styles.achTileText} numberOfLines={2}>
                      {def.title}
                    </Text>
                  </Pressable>
                );
              })}
              {ACHIEVEMENTS.filter((a) => !unlocked.some((u) => u.id === a.id)).map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => setLockedTapped(true)}
                  style={({ pressed }) => [styles.achTile, styles.achTileLocked, pressed && { opacity: 0.8 }]}>
                  <Icon name="question" size={22} color={colors.textFaint} fill={colors.surface2} strokeWidth={1.9} />
                </Pressable>
              ))}
            </View>

            {moments.length > 0 ? (
              <>
                <Text style={styles.section}>MOMENTS</Text>
                {moments.slice(0, 12).map((moment) => (
                  <View key={`${moment.id}:${moment.at}`} style={styles.moment}>
                    <Icon
                      name={moment.icon}
                      size={18}
                      color={colors.ink}
                      fill={colors.goldWash}
                    />
                    <View style={styles.momentText}>
                      <Text style={styles.momentTitle}>{moment.title}</Text>
                      <Text style={styles.momentBody}>{moment.body}</Text>
                      <Text style={styles.momentWhen}>{formatWhen(moment.at)}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {attempts.length > 0 ? (
              <>
                <Text style={styles.section}>RECENT</Text>
                {attempts.slice(0, 8).map((attempt) => (
                  <AttemptRow key={attempt.id} attempt={attempt} />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <AchievementModal
        visible={viewing != null}
        unlocks={viewing ? [viewing] : []}
        onClose={() => setViewing(null)}
      />
      <AchievementModal
        visible={lockedTapped}
        unlocks={[]}
        locked
        onClose={() => setLockedTapped(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingBottom: tabClearance },

  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  title: { fontFamily: font.hero, fontSize: 34, lineHeight: 44, color: colors.text },
  squiggle: { marginTop: 2, marginLeft: 2 },

  streak: { marginTop: 40 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakNum: {
    fontFamily: font.hero,
    fontSize: 52,
    lineHeight: 60,
    color: colors.text,
  },
  streakLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 14,
    color: colors.textFaint,
    marginTop: -2,
  },

  fireName: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  fireNext: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: 4,
  },
  achGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  achTile: {
    width: 76,
    minHeight: 68,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  achTileLocked: {
    backgroundColor: colors.surface2,
    borderStyle: 'dashed',
  },
  achTileText: {
    fontFamily: font.bodyBold,
    fontSize: 10,
    lineHeight: 12.5,
    color: colors.textDim,
    textAlign: 'center',
  },
  moment: {
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  momentText: { flex: 1 },
  momentTitle: {
    fontFamily: font.hero,
    fontSize: 17,
    lineHeight: 23,
    color: colors.text,
  },
  momentBody: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textDim,
    marginTop: 2,
  },
  momentWhen: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 5,
  },
  section: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textFaint,
    marginTop: 44,
    marginBottom: 14,
  },

  subjectRow: { marginBottom: 26 },
  subjectHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  subjectName: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  subjectPct: {
    fontFamily: font.hero,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 7,
  },
  barFill: { height: '100%', borderRadius: radius.pill },
  subjectNote: {
    fontFamily: font.body,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: 6,
  },

  weak: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
    marginTop: 18,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  weakNum: { fontFamily: font.hero, fontSize: 28, color: colors.coral },
  weakLabel: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 14,
    color: colors.textDim,
  },

  attemptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  attemptName: { flex: 1, fontFamily: font.bodyBold, fontSize: 14, color: colors.textDim },
  attemptMeta: { fontFamily: font.body, fontSize: 12, color: colors.textFaint },
  attemptScore: {
    fontFamily: font.hero,
    fontSize: 17,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    textAlign: 'right',
  },

  empty: { marginTop: 40 },
  emptyTitle: { fontFamily: font.hero, fontSize: 26, lineHeight: 34, color: colors.text },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textDim,
    marginTop: 8,
  },
});
