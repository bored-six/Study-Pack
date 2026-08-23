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

import { DeckCard } from '@/components/DeckCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useOnline } from '@/hooks/useOnline';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Deck, type Difficulty } from '@/lib/types';
import { useDecksStore } from '@/store/decks';
import { colors, font, radius } from '@/theme/tokens';

export default function DecksScreen() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { decks, status, error, fromCache, refresh, downloading, downloadDeck, removeDownload } =
    useDecksStore();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(
    () => decks.filter((deck) => deck.difficulty === difficulty),
    [decks, difficulty]
  );
  const downloadedCount = useMemo(
    () => decks.filter((deck) => deck.downloadedAt != null).length,
    [decks]
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Decks</Text>
      <Text style={styles.sub}>
        {decks.length > 0
          ? `${downloadedCount} of ${decks.length} saved for offline`
          : 'Quiz decks from Open Trivia DB'}
      </Text>

      <OfflineBanner
        message="✈ Offline — showing your saved catalog"
        style={styles.cacheNote}
      />
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
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {DIFFICULTY_LABEL[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(deck) => deck.id}
        renderItem={({ item }) => (
          <DeckCard
            deck={item}
            downloading={downloading[item.id] === true}
            onDownload={handleDownload}
            onRemove={handleRemove}
            onStartQuiz={handleStartQuiz}
          />
        )}
        contentContainerStyle={styles.list}
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
              <Text style={styles.emptyTitle}>Couldn't load decks</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable
                onPress={refresh}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : status === 'ready' ? (
            <View style={styles.empty}>
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
  cacheNote: {
    marginTop: 10,
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cacheNoteText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.gold,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    color: colors.textDim,
  },
  chipTextActive: {
    color: colors.onAccent,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
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
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.onAccent,
  },
  pressed: {
    opacity: 0.7,
  },
});
