import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { DeckCard } from '@/components/DeckCard';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useOnline } from '@/hooks/useOnline';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Deck, type Difficulty } from '@/lib/types';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';
import { useDecksStore } from '@/store/decks';

/** What each difficulty actually means, so the levels aren't just labels. */
const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: 'Warm-up questions — good for a quick round.',
  medium: 'A fair challenge. Most people land here.',
  hard: 'Specialist territory. Expect to miss a few.',
};

export default function TriviaScreen() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { decks, status, error, fromCache, refresh, downloading, downloadDeck, removeDownload } =
    useDecksStore();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  // Home already prefetches the catalog; only fetch here on a cold entry.
  useEffect(() => {
    if (decks.length === 0) void refresh();
  }, [decks.length, refresh]);

  /** Downloaded decks float to the top — they're the ones playable offline. */
  const visible = useMemo(() => {
    const filtered = decks.filter((deck) => deck.difficulty === difficulty);
    return [...filtered].sort((a, b) => {
      const aSaved = a.downloadedAt != null ? 0 : 1;
      const bSaved = b.downloadedAt != null ? 0 : 1;
      if (aSaved !== bSaved) return aSaved - bSaved;
      return a.name.localeCompare(b.name);
    });
  }, [decks, difficulty]);

  const savedHere = useMemo(
    () => visible.filter((deck) => deck.downloadedAt != null).length,
    [visible]
  );

  const handleDownload = useCallback(
    (deck: Deck) => {
      downloadDeck(deck).catch((e: unknown) => {
        Alert.alert(
          `Couldn't download ${deck.name}`,
          e instanceof Error ? e.message : 'Something went wrong — try again.'
        );
      });
    },
    [downloadDeck]
  );

  const handleStartQuiz = useCallback((deck: Deck) => {
    router.push({ pathname: '/quiz/[deckId]', params: { deckId: deck.id } });
  }, []);

  const handleRemove = useCallback(
    (deck: Deck) => {
      Alert.alert('Remove download?', `${deck.name} will no longer work offline.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeDownload(deck.id),
        },
      ]);
    },
    [removeDownload]
  );

  const header = (
    <View>
      <Text style={styles.sub}>
        Practice decks from Open Trivia DB
        {savedHere > 0 ? ` · ${savedHere} saved on this level` : ''}
      </Text>

      <OfflineBanner message="Offline — saved decks still play" style={styles.cacheNote} />
      {fromCache && online ? (
        <View style={styles.cacheNote}>
          <Text style={styles.cacheNoteText}>
            Couldn't reach Open Trivia DB — showing your saved catalog
          </Text>
        </View>
      ) : null}

      <View style={styles.chips}>
        {DIFFICULTIES.map((level) => {
          const active = level === difficulty;
          return (
            <Pressable
              key={level}
              onPress={() => setDifficulty(level)}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && !active && styles.chipPressed,
              ]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {DIFFICULTY_LABEL[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.levelHint}>{DIFFICULTY_HINT[difficulty]}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.navRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Trivia</Text>
          <View style={styles.titleSticker}>
            <Icon name="dice" size={19} color={colors.ink} strokeWidth={2.2} />
          </View>
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(deck) => deck.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <DeckCard
            deck={item}
            tilt={index % 2 === 0 ? 'left' : 'right'}
            downloading={downloading[item.id] === true}
            onDownload={handleDownload}
            onRemove={handleRemove}
            onStartQuiz={handleStartQuiz}
          />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={status === 'loading'}
            onRefresh={refresh}
            tintColor={colors.accentDeep}
            colors={[colors.accentDeep]}
          />
        }
        ListEmptyComponent={
          status === 'error' ? (
            <View style={styles.empty}>
              <View style={styles.emptyBadge}>
                <Icon name="alert" size={26} color={colors.ink} fill={colors.coralWash} />
              </View>
              <Text style={styles.emptyTitle}>Couldn't load trivia</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <ChunkyButton label="Try again" size="md" onPress={refresh} style={styles.retry} />
            </View>
          ) : status === 'ready' ? (
            <View style={styles.empty}>
              <View style={styles.emptyBadge}>
                <Icon name="sprout" size={26} color={colors.ink} fill={colors.accentWash} />
              </View>
              <Text style={styles.emptyTitle}>No decks here yet</Text>
              <Text style={styles.emptyBody}>Pull down to refresh the catalog.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface,
    ...outline,
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
    gap: 9,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 30,
    lineHeight: 40,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.accent,
    ...outline,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 5,
    transform: [{ rotate: '-4deg' }],
    ...shadow.card,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: 2,
  },
  cacheNote: {
    marginTop: 10,
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cacheNoteText: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.gold,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipActive: {
    backgroundColor: colors.accent,
    ...shadow.card,
  },
  chipText: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.textDim,
  },
  chipTextActive: {
    color: colors.ink,
  },
  levelHint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 9,
    marginBottom: 13,
  },
  list: {
    gap: 13,
    paddingTop: 3,
  },
  empty: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
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
  retry: {
    marginTop: 10,
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.75,
  },
});
