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
import { Icon, type IconName } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useOnline } from '@/hooks/useOnline';
import { DIFFICULTIES, DIFFICULTY_LABEL, type Deck, type Difficulty } from '@/lib/types';
import { colors, font, outline, radius, shadow, tabClearance, textPop } from '@/theme/tokens';
import { useDecksStore } from '@/store/decks';

/** What each difficulty actually means, so the levels aren't just labels. */
const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: 'Warm-up questions — good for a quick round.',
  medium: 'A fair challenge. Most people land here.',
  hard: 'Specialist territory. Expect to miss a few.',
};

function SectionHeading({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionBadge}>
        <Icon name={icon} size={14} color={colors.ink} strokeWidth={2.4} />
      </View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

export default function DecksScreen() {
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { decks, status, error, fromCache, refresh, downloading, downloadDeck, removeDownload } =
    useDecksStore();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Downloaded decks float to the top — they're the ones playable offline. */
  const trivia = useMemo(() => {
    const filtered = decks.filter((deck) => deck.difficulty === difficulty);
    return [...filtered].sort((a, b) => {
      const aSaved = a.downloadedAt != null ? 0 : 1;
      const bSaved = b.downloadedAt != null ? 0 : 1;
      if (aSaved !== bSaved) return aSaved - bSaved;
      return a.name.localeCompare(b.name);
    });
  }, [decks, difficulty]);

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

  const handleAddNotes = useCallback(() => {
    Alert.alert(
      'Add your notes',
      "Coming next: paste your class notes and Study Pack turns them into quiz questions — no internet, no AI needed.",
      [{ text: 'Got it' }]
    );
  }, []);

  const header = (
    <View>
      <Text style={styles.kicker}>STUDY PACK</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Let's</Text>
        <View style={styles.titleSticker}>
          <Text style={styles.titleStickerText}>study!</Text>
        </View>
      </View>
      <Text style={styles.sub}>Your own notes, plus trivia to practice on.</Text>

      <OfflineBanner message="Offline — everything saved still works" style={styles.cacheNote} />
      {fromCache && online ? (
        <View style={styles.cacheNote}>
          <Text style={styles.cacheNoteText}>
            Couldn't reach Open Trivia DB — showing your saved catalog
          </Text>
        </View>
      ) : null}

      <SectionHeading icon="book" label="MY NOTES" />
      <Pressable
        onPress={handleAddNotes}
        style={({ pressed }) => [styles.notesCard, pressed && styles.pressed]}>
        <View style={styles.notesBadge}>
          <Icon name="bulb" size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
        </View>
        <View style={styles.notesText}>
          <Text style={styles.notesTitle}>Add your notes</Text>
          <Text style={styles.notesBody}>
            Paste notes from class and we'll turn them into a quiz you can take anywhere.
          </Text>
        </View>
      </Pressable>

      <SectionHeading icon="dice" label="TRIVIA" />
      <Text style={styles.sectionSub}>
        Practice decks from Open Trivia DB
        {downloadedCount > 0 ? ` · ${downloadedCount} saved offline` : ''}
      </Text>

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
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <FlatList
        data={trivia}
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
    ...textPop(colors.accent, 3),
  },
  titleSticker: {
    backgroundColor: colors.accent,
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  sectionLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.text,
  },
  sectionRule: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.lineSoft,
  },
  sectionSub: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: -4,
  },
  notesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accentWash,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    ...shadow.card,
  },
  notesBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  notesText: {
    flex: 1,
  },
  notesTitle: {
    fontFamily: font.heading,
    fontSize: 16.5,
    lineHeight: 21,
    color: colors.text,
  },
  notesBody: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
    marginTop: 1,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
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
    paddingBottom: tabClearance,
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
    borderColor: colors.ink,
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
    opacity: 0.8,
  },
});
