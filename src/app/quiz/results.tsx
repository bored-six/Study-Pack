import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon, type IconName } from '@/components/Icon';
import { RuledPaper, Tape } from '@/components/notebook';
import { DIFFICULTY_LABEL } from '@/lib/types';
import { AchievementModal } from '@/components/AchievementModal';
import { useAchievementsStore } from '@/store/achievements';
import { useMomentsStore } from '@/store/moments';
import { useQuizStore } from '@/store/quiz';
import { font, getColors, outlineOn, radius, shadow, textPop, useThemeStore } from '@/theme/tokens';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ResultsScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const insets = useSafeAreaInsets();
  const { deck, questions, score, durationMs } = useQuizStore();
  const moment = useMomentsStore((s) => s.latest);
  const pending = useAchievementsStore((s) => s.pending);
  const clearPending = useAchievementsStore((s) => s.clearPending);
  const [revealing, setRevealing] = useState(false);
  const [revealIndex, setRevealIndex] = useState(0);

  // Only reachable by finishing a quiz; a cold deep link goes home.
  if (!deck || questions.length === 0) {
    return <Redirect href="/" />;
  }

  const total = questions.length;
  const pct = Math.round((score / total) * 100);
  const tone =
    pct >= 80
      ? { color: colors.leaf, wash: colors.leafWash, label: 'You crushed it!', icon: 'trophy' as IconName }
      : pct >= 50
        ? { color: colors.gold, wash: colors.goldWash, label: 'Solid effort', icon: 'star' as IconName }
        : { color: colors.coral, wash: colors.coralWash, label: 'Keep at it', icon: 'sprout' as IconName };

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
      ]}>
      <RuledPaper />
      <View style={styles.card}>
        <Tape />
        <View style={[styles.toneBadge, { backgroundColor: tone.wash }]}>
          <Icon name={tone.icon} size={32} color={colors.ink} fill={colors.surface} />
        </View>
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

        <View style={styles.savedRow}>
          <Icon name="check" size={13} color={colors.accentDeep} strokeWidth={2.6} />
          <Text style={styles.saved}>Saved to Progress on this device</Text>
        </View>
      </View>

      {moment ? (
        <View style={styles.moment}>
          <Icon name={moment.icon} size={22} color={colors.ink} fill={colors.goldWash} />
          <View style={styles.momentText}>
            <Text style={styles.momentTitle}>{moment.title}</Text>
            <Text style={styles.momentBody}>{moment.body}</Text>
          </View>
        </View>
      ) : null}

      {pending.length > 0 ? (
        <Pressable
          onPress={() => {
            setRevealIndex(0);
            setRevealing(true);
          }}
          style={({ pressed }) => [styles.achBanner, pressed && { opacity: 0.85 }]}>
          <Icon name="star" size={18} color={colors.ink} fill={colors.gold} />
          <Text style={styles.achBannerText}>
            You got {pending.length === 1 ? 'an achievement' : `${pending.length} achievements`} — press to open
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <ChunkyButton
          label="Try again"
          variant="soft"
          size="lg"
          onPress={() =>
            router.replace({ pathname: '/quiz/[deckId]', params: { deckId: deck.id } })
          }
        />
        <ChunkyButton label="Done" size="lg" onPress={() => router.back()} />
      </View>

      <AchievementModal
        visible={revealing}
        celebrate
        unlocks={pending}
        index={revealIndex}
        onNext={() => setRevealIndex((i) => i + 1)}
        onClose={() => {
          setRevealing(false);
          clearPending();
        }}
      />
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.card,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    ...shadow.pop,
  },
  toneBadge: {
    width: 64,
    height: 64,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 19,
    borderBottomLeftRadius: 23,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    transform: [{ rotate: '-4deg' }],
  },
  badge: {
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
  },
  badgeText: {
    fontFamily: font.heading,
    fontSize: 13.5,
  },
  score: {
    fontFamily: font.hero,
    fontSize: 60,
    lineHeight: 70,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    ...textPop(colors.accentWash, 4),
  },
  pct: {
    fontFamily: font.bodyHeavy,
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
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
  },
  metaDot: {
    color: colors.textFaint,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
  },
  saved: {
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    color: colors.accentDeep,
  },
  moment: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  momentText: { flex: 1 },
  momentTitle: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  momentBody: {
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textDim,
    marginTop: 3,
  },
  achBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.goldWash,
    ...outlineOn(colors),
    borderRadius: radius.control,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginTop: 12,
  },
  achBannerText: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 14.5,
    color: colors.text,
  },
  actions: {
    gap: 12,
  },
});
