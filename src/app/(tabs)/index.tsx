import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckCard } from '@/components/DeckCard';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@/lib/types';
import { useDecksStore } from '@/store/decks';
import { colors, font, radius } from '@/theme/tokens';

export default function DecksScreen() {
  const insets = useSafeAreaInsets();
  const { decks, status, error, fromCache, refresh } = useDecksStore();
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Decks</Text>
      <Text style={styles.sub}>
        {decks.length > 0
          ? `${downloadedCount} of ${decks.length} saved for offline`
          : 'Quiz decks from Open Trivia DB'}
      </Text>

      {fromCache ? (
        <View style={styles.cacheNote}>
          <Text style={styles.cacheNoteText}>✈ Offline — showing your saved catalog</Text>
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
        renderItem={({ item }) => <DeckCard deck={item} />}
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
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
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
