import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, FlatList, TextInput, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { PromptModal } from '@/components/PromptModal';
import { SubjectSheet } from '@/components/SubjectSheet';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { OfflineBanner } from '@/components/OfflineBanner';
import type { Deck } from '@/lib/types';
import { updateSubject } from '@/lib/db';
import { colors, derpRadius, font, outline, radius, shadow, tabClearance } from '@/theme/tokens';
import { formatClock, joinDeckNames } from '@/lib/schedule';
import { usePlannerStore } from '@/store/planner';
import { useDecksStore } from '@/store/decks';
import { useNotesStore } from '@/store/notes';

function SectionHeading({ label }: { label: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const { decks, refresh } = useDecksStore();
  const { refresh: refreshPlanner, upcoming } = usePlannerStore();
  const {
    subjects: noteDecks,
    refresh: refreshNotes,
    remove: removeNoteDeck,
    addSubject,
  } = useNotesStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
  const [naming, setNaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return noteDecks;
    return noteDecks.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [noteDecks, searchQuery]);

  const carouselRef = useRef<FlatList>(null);

  const scrollLeft = () => {
    carouselRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const scrollRight = () => {
    carouselRef.current?.scrollToEnd({ animated: true });
  };

  const handleCreateSubject = useCallback(
    (name: string) => {
      setNaming(false);
      void addSubject(name);
    },
    [addSubject]
  );

  const handleSaveSubject = useCallback(
    async (deckId: string, name: string, color: string | null, icon: string | null) => {
      await updateSubject(deckId, name, color, icon);
      setEditing(null);
      void refreshNotes();
      void refreshPlanner();
    },
    [refreshNotes, refreshPlanner]
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

  const renderDeckCard = ({ item: deck, index }: { item: Deck; index: number }) => {
    const isEven = index % 2 === 0;
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/exam/[deckId]', params: { deckId: deck.id } })}
        onLongPress={() => setEditing(deck)}
        style={({ pressed }) => [
          styles.carouselCard,
          isEven ? styles.carouselCardRotateLeft : styles.carouselCardRotateRight,
          deck.color ? { backgroundColor: deck.color } : null,
          pressed && styles.pressed,
        ]}>
        <View style={styles.carouselIconWrap}>
          <Icon
            name={(deck.icon as IconName | null) ?? 'derpBook'}
            size={64}
            color={colors.ink}
            fill={colors.surface}
            strokeWidth={1.5}
          />
        </View>
        <Text style={styles.carouselTitle} numberOfLines={2}>
          {deck.name}
        </Text>
        <Text style={styles.carouselBody}>
          {deck.questionCount} q's
        </Text>
        <Pressable
          hitSlop={10}
          onPress={() => setEditing(deck)}
          style={({ pressed }) => [styles.editBtnAbs, pressed && styles.pressed]}>
          <Icon name="pencil" size={16} color={colors.textFaint} strokeWidth={1.9} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}>
        
        {/* HEADER */}
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={styles.kicker}>FLIPP</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Let's</Text>
              <View style={styles.titleSticker}>
                <Text style={styles.titleStickerText}>study!</Text>
              </View>
              <Icon name="derpBrain" size={38} color={colors.ink} fill={colors.accentWash} strokeWidth={1.5} />
            </View>
            <Squiggle style={styles.squiggle} />
            <Text style={styles.sub}>Your own notes, plus trivia to practice on.</Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={10}
            accessibilityLabel="Settings"
            style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
            <Icon name="gear" size={21} color={colors.ink} fill={colors.surface2} strokeWidth={1.9} />
          </Pressable>
        </View>

        <OfflineBanner message="Offline — everything saved still works" style={styles.banner} />

        {/* SEARCH BAR (Only if 10+ decks) */}
        {noteDecks.length >= 10 && (
          <View style={styles.searchWrapper}>
            <Icon name="globe" size={18} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects..."
              placeholderTextColor={colors.textFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {/* NEXT UP PLANNER */}
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
              <Text style={styles.cardTitleLine}>
                {joinDeckNames(nextSession.occurrences.map((o) => o.deckName))}
              </Text>
              <Text style={styles.cardBodyLine}>{nextLabel}</Text>
            </View>
            <Icon name="play" size={16} color={colors.accentDeep} />
          </Pressable>
        ) : null}

        <SectionHeading label="MY DECKS" />

        {/* CAROUSEL */}
        <View style={styles.carouselWrapper}>
          {Platform.OS === 'web' && noteDecks.length > 2 && (
            <Pressable onPress={scrollLeft} style={[styles.webArrow, styles.webArrowLeft]}>
              <Text style={styles.arrowText}>{'<'}</Text>
            </Pressable>
          )}

          <FlatList
            ref={carouselRef}
            horizontal
            data={filteredDecks}
            keyExtractor={d => d.id}
            renderItem={renderDeckCard}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            snapToInterval={180}
            decelerationRate="fast"
            ListEmptyComponent={
              <View style={styles.emptyDeck}>
                <Text style={styles.emptyText}>No subjects yet!</Text>
              </View>
            }
          />

          {Platform.OS === 'web' && noteDecks.length > 2 && (
            <Pressable onPress={scrollRight} style={[styles.webArrow, styles.webArrowRight]}>
              <Text style={styles.arrowText}>{'>'}</Text>
            </Pressable>
          )}
        </View>

        {/* ACTION GRID */}
        <View style={styles.actionGrid}>
          <Pressable onPress={() => setNaming(true)} style={({ pressed }) => [styles.actionBtn, styles.actionBtnNew, pressed && styles.pressed]}>
            <View style={[styles.actionIconWrap, styles.actionIconNew]}>
              <Icon name="derpPlus" size={32} color={colors.accentDeep} strokeWidth={2.5} />
            </View>
            <Text style={styles.actionLabel}>New Subject</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/notes/new')} style={({ pressed }) => [styles.actionBtn, styles.actionBtnNotes, pressed && styles.pressed]}>
            <View style={[styles.actionIconWrap, styles.actionIconNotes]}>
              <Icon name="derpBulb" size={32} color={colors.ink} fill={colors.surface} />
            </View>
            <Text style={styles.actionLabel}>Add Notes</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/trivia')} style={({ pressed }) => [styles.actionBtn, styles.actionBtnTrivia, pressed && styles.pressed]}>
            <View style={[styles.actionIconWrap, styles.actionIconTrivia]}>
              <Icon name="derpDice" size={32} color={colors.ink} fill={colors.surface} />
            </View>
            <Text style={styles.actionLabel}>Play Trivia</Text>
          </Pressable>
        </View>

      </ScrollView>

      <PromptModal
        visible={naming}
        title="New subject"
        message="What are you studying?"
        placeholder="Biology"
        confirmLabel="Create"
        onCancel={() => setNaming(false)}
        onConfirm={handleCreateSubject}
      />

      <SubjectSheet
        visible={editing != null}
        subject={editing}
        onClose={() => setEditing(null)}
        onSave={(deckId, name, color, icon) => void handleSaveSubject(deckId, name, color, icon)}
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
    paddingBottom: tabClearance + 20,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
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
    fontSize: 34,
    lineHeight: 44,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.accent,
    ...outline,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-3deg' }],
    ...shadow.card,
  },
  titleStickerText: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 4,
  },
  banner: {
    marginTop: 10,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
    transform: [{ rotate: '0.4deg' }],
    ...shadow.card,
  },
  searchInput: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 15,
    color: colors.text,
    marginLeft: 8,
    outlineStyle: 'none' as any,
  },
  sectionHead: {
    marginTop: 24,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: font.hero,
    fontSize: 24,
    color: colors.text,
  },
  carouselWrapper: {
    position: 'relative',
    marginHorizontal: -16, 
  },
  carouselContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
    gap: 16,
  },
  carouselCard: {
    width: 164,
    height: 220,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  carouselCardRotateLeft: { transform: [{ rotate: '-1.5deg' }] },
  carouselCardRotateRight: { transform: [{ rotate: '1deg' }] },
  carouselIconWrap: {
    marginBottom: 16,
  },
  carouselTitle: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 28,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  carouselBody: {
    fontFamily: font.bodySemibold,
    fontSize: 14,
    color: colors.textDim,
  },
  editBtnAbs: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDeck: {
    width: 164,
    height: 220,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.edge,
    ...derpRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: font.hero,
    fontSize: 18,
    color: colors.textFaint,
  },
  webArrow: {
    position: 'absolute',
    top: '40%',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    ...outline,
    ...shadow.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  webArrowLeft: { left: 4 },
  webArrowRight: { right: 4 },
  arrowText: {
    fontFamily: font.hero,
    fontSize: 20,
    color: colors.ink,
    lineHeight: 20,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  actionBtnNew: { transform: [{ rotate: '1deg' }] },
  actionBtnNotes: { transform: [{ rotate: '-1.5deg' }] },
  actionBtnTrivia: { transform: [{ rotate: '0.5deg' }] },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionIconNew: { backgroundColor: colors.surface, borderStyle: 'dashed', borderColor: colors.accentDeep },
  actionIconNotes: { backgroundColor: colors.accentWash },
  actionIconTrivia: { backgroundColor: colors.surface2 },
  actionLabel: {
    fontFamily: font.hero,
    fontSize: 18,
    lineHeight: 22,
    color: colors.text,
    textAlign: 'center',
  },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.goldWash,
    ...outline,
    ...derpRadius,
    padding: 14,
    marginTop: 18,
    transform: [{ rotate: '0.4deg' }],
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
  cardText: {
    flex: 1,
  },
  nextKicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    letterSpacing: 1.3,
    color: colors.gold,
  },
  cardTitleLine: {
    fontFamily: font.heading,
    fontSize: 16.5,
    lineHeight: 21,
    color: colors.text,
  },
  cardBodyLine: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
    marginTop: 1,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headText: {
    flex: 1,
  },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    transform: [{ rotate: '-4deg' }],
    ...shadow.card,
  },
  pressed: {
    opacity: 0.8,
  },
});
