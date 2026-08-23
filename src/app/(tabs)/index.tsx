import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { SubjectSheet } from '@/components/SubjectSheet';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { OfflineBanner } from '@/components/OfflineBanner';
import type { Deck } from '@/lib/types';
import { customizeDeck } from '@/lib/db';
import { colors, derpRadius, font, outline, radius, shadow, tabClearance } from '@/theme/tokens';
import { formatClock, joinDeckNames } from '@/lib/schedule';
import { usePlannerStore } from '@/store/planner';
import { useDecksStore } from '@/store/decks';
import { useNotesStore } from '@/store/notes';

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { decks, refresh } = useDecksStore();
  const { refresh: refreshPlanner, upcoming } = usePlannerStore();
  const {
    subjects: noteDecks,
    refresh: refreshNotes,
    remove: removeNoteDeck,
  } = useNotesStore();

  // Prefetch the catalog so the Trivia screen opens with data ready.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Notes change while you're away on the add flow, so re-read on focus.
  useFocusEffect(
    useCallback(() => {
      void refreshNotes();
      void refreshPlanner();
    }, [refreshNotes, refreshPlanner])
  );

  const downloadedCount = useMemo(
    () => decks.filter((deck) => deck.downloadedAt != null).length,
    [decks]
  );

  const [editing, setEditing] = useState<Deck | null>(null);

  const handleSaveLook = useCallback(
    async (deckId: string, color: string | null, icon: string | null) => {
      await customizeDeck(deckId, color, icon);
      setEditing(null);
      void refreshNotes();
    },
    [refreshNotes]
  );

  const handleDeleteSubject = useCallback(
    (deckId: string) => {
      setEditing(null);
      void removeNoteDeck(deckId);
    },
    [removeNoteDeck]
  );

  const nextSession = useMemo(() => upcoming()[0] ?? null, [upcoming]);
  const nextLabel = useMemo(() => {
    if (!nextSession) return '';
    const minutes = Math.round((nextSession.at - Date.now()) / 60_000);
    if (minutes <= 0) return 'Starting now';
    if (minutes < 60) return `In ${minutes} min`;
    if (minutes < 24 * 60) return `In ${Math.round(minutes / 60)} hr`;
    return new Date(nextSession.at).toLocaleDateString(undefined, {
      weekday: 'long',
    });
  }, [nextSession]);

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>FLIPP</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Let's</Text>
        <View style={styles.titleSticker}>
          <Text style={styles.titleStickerText}>study!</Text>
        </View>
      </View>
      <Squiggle style={styles.squiggle} />
      <Text style={styles.sub}>Your own notes, plus trivia to practice on.</Text>

      <OfflineBanner message="Offline — everything saved still works" style={styles.banner} />

      {nextSession ? (
        <Pressable
          onPress={() => router.push('/planner')}
          style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}>
          <Tape rotate="-3deg" />
          <View style={styles.nextBadge}>
            <Icon name="clock" size={24} color={colors.ink} fill={colors.goldWash} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.nextKicker}>NEXT UP · {formatClock(nextSession.at)}</Text>
            <Text style={styles.cardTitle}>
              {joinDeckNames(nextSession.occurrences.map((o) => o.deckName))}
            </Text>
            <Text style={styles.cardBody}>{nextLabel}</Text>
          </View>
          <Icon name="play" size={16} color={colors.accentDeep} />
        </Pressable>
      ) : null}

      {noteDecks.length > 0 ? <SectionHeading icon="book" label="MY SUBJECTS" /> : null}

      {noteDecks.map((deck) => (
        <Pressable
          key={deck.id}
          onPress={() =>
            // Subjects open the exam builder; trivia keeps the plain quiz.
            router.push({ pathname: '/exam/[deckId]', params: { deckId: deck.id } })
          }
          onLongPress={() => setEditing(deck)}
          style={({ pressed }) => [styles.noteDeckCard, pressed && styles.pressed]}>
          <View
            style={[
              styles.noteDeckBadge,
              deck.color ? { backgroundColor: deck.color } : null,
            ]}>
            <Icon
              name={(deck.icon as IconName | null) ?? 'book'}
              size={24}
              color={colors.ink}
              fill={colors.surface}
              strokeWidth={1.9}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {deck.name}
            </Text>
            <Text style={styles.cardBody}>
              {deck.questionCount} question{deck.questionCount === 1 ? '' : 's'} · always offline
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => setEditing(deck)}
            style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
            <Icon name="pencil" size={16} color={colors.textFaint} strokeWidth={1.9} />
          </Pressable>
          <Icon name="play" size={16} color={colors.accentDeep} />
        </Pressable>
      ))}

      <SectionHeading icon="note" label="ADD NOTES" />

      <Pressable
        onPress={() => router.push('/notes/new')}
        style={({ pressed }) => [styles.notesCard, pressed && styles.pressed]}>
        <Tape />
        <View style={styles.notesBadge}>
          <Icon name="bulb" size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>
            {noteDecks.length > 0 ? 'Add more notes' : 'Add your notes'}
          </Text>
          <Text style={styles.cardBody}>
            Paste notes from class and we'll turn them into a quiz you can take anywhere.
          </Text>
        </View>
      </Pressable>

      <SectionHeading icon="dice" label="TRIVIA" />

      <Pressable
        onPress={() => router.push('/trivia')}
        style={({ pressed }) => [styles.triviaCard, pressed && styles.pressed]}>
        <Tape rotate="3deg" />
        <View style={styles.triviaBadge}>
          <Icon name="dice" size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Browse trivia</Text>
          <Text style={styles.cardBody}>
            {decks.length > 0
              ? `${decks.length} practice decks${
                  downloadedCount > 0 ? ` · ${downloadedCount} saved offline` : ''
                }`
              : 'Practice decks from Open Trivia DB'}
          </Text>
        </View>
        <Icon name="play" size={16} color={colors.accentDeep} />
      </Pressable>
      </ScrollView>

      <SubjectSheet
        visible={editing != null}
        subject={editing}
        onClose={() => setEditing(null)}
        onSave={(deckId, color, icon) => void handleSaveLook(deckId, color, icon)}
        onDelete={handleDeleteSubject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: tabClearance,
  },
  squiggle: {
    marginTop: 2,
    marginLeft: 2,
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
  banner: {
    marginTop: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 11,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
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
  noteDeckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 10,
    ...shadow.card,
  },
  noteDeckBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.accentWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
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
  triviaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    ...shadow.card,
  },
  notesBadge: {
    width: 48,
    height: 48,
    ...derpRadius,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  triviaBadge: {
    width: 48,
    height: 48,
    ...derpRadius,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '3deg' }],
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: font.heading,
    fontSize: 16.5,
    lineHeight: 21,
    color: colors.text,
  },
  cardBody: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
    marginTop: 1,
  },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.goldWash,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    marginTop: 18,
    ...shadow.card,
  },
  nextBadge: {
    width: 48,
    height: 48,
    ...derpRadius,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  nextKicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    letterSpacing: 1.3,
    color: colors.gold,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
