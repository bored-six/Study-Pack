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
import { colors, font, radius, shadow } from '@/theme/tokens';
import { useDecksStore } from '@/store/decks';

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
      <Text style={styles.kicker}>STUDYPACK</Text>
      <Text style={styles.title}>Pick a deck</Text>
      <Text style={styles.sub}>
        {decks.length > 0
          ? `${downloadedCount} of ${decks.length} saved for offline`
          : 'Quiz decks from Open Trivia DB'}
      </Text>

      <OfflineBanner
        message="Offline — showing your saved catalog"
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
              <View style={styles.emptyBadge}>
                <Icon name="alert" size={26} color={colors.coral} />
              </View>
              <Text style={styles.emptyTitle}>Couldn't load decks</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <ChunkyButton label="Try again" size="md" onPress={refresh} style={styles.retry} />
            </View>
          ) : status === 'ready' ? (
            <View style={styles.empty}>
              <View style={styles.emptyBadge}>
                <Icon name="sprout" size={26} color={colors.accentDeep} />
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
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  title: {
    fontFamily: font.display,
    fontSize: 30,
    lineHeight: 38,
    color: colors.text,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 1,
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
    marginBottom: 14,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accentEdge,
    ...shadow.pop,
  },
  chipText: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.textDim,
  },
  chipTextActive: {
    color: colors.onAccent,
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1.5,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
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
});
