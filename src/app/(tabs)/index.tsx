import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { PromptModal } from '@/components/PromptModal';
import { SubjectSheet } from '@/components/SubjectSheet';
import { RuledPaper } from '@/components/notebook';
import type { Deck } from '@/lib/types';
import { updateSubject } from '@/lib/db';
import { derpRadius, font, getColors, outlineOn, shadow, subjectInkFor, tabClearance, useThemeStore } from '@/theme/tokens';
import { formatClock, joinDeckNames } from '@/lib/schedule';
import { usePlannerStore } from '@/store/planner';
import { useNotesStore } from '@/store/notes';
import { useProgressStore } from '@/store/progress';
import { useAchievementsStore } from '@/store/achievements';
import { AchievementModal } from '@/components/AchievementModal';
import { BouncyPressable } from '@/components/BouncyPressable';

/** Search earns its seat once the binder has enough rows to lose one in. */
const SEARCH_THRESHOLD = 4;

/** Punched ring-binder holes down the left edge. Decoration only. */
function BinderHoles({ styles }: { styles: any }) {
  return (
    <View pointerEvents="none" style={styles.holes}>
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();

  const { refresh: refreshPlanner, upcoming } = usePlannerStore();
  const {
    subjects: noteDecks,
    refresh: refreshNotes,
    remove: removeNoteDeck,
    addSubject,
  } = useNotesStore();
  const masterySubjects = useProgressStore((s) => s.subjects);
  const refreshProgress = useProgressStore((s) => s.refresh);
  const { pending, clearPending, refresh: refreshAchievements } = useAchievementsStore();
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealing, setRevealing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshNotes();
      void refreshPlanner();
      void refreshProgress();
      void refreshAchievements();

      // If we land on the home screen and have pending achievements
      // (because the user skipped the banner in results), show them!
      if (pending.length > 0 && !revealing) {
        setRevealIndex(0);
        setRevealing(true);
      }
    }, [refreshNotes, refreshPlanner, refreshProgress, refreshAchievements, pending, revealing])
  );

  const [editing, setEditing] = useState<Deck | null>(null);
  const [naming, setNaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return noteDecks;
    return noteDecks.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [noteDecks, searchQuery]);

  const masteryByDeck = useMemo(
    () => new Map(masterySubjects.map((subject) => [subject.deckId, subject])),
    [masterySubjects]
  );

  const styles = getStyles(colors);

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

  const renderRow = (deck: Deck, index: number) => {
    const mastery = masteryByDeck.get(deck.id) ?? null;
    const ink = subjectInkFor(deck.color);
    return (
      <BouncyPressable
        key={deck.id}
        onPress={() => router.push({ pathname: '/exam/[deckId]', params: { deckId: deck.id } })}
        onLongPress={() => setEditing(deck)}
        style={[styles.row, index % 2 === 0 ? styles.rowTiltLeft : styles.rowTiltRight]}>
        <View style={[styles.rowTile, deck.color ? { backgroundColor: deck.color } : null]}>
          <Icon
            name={(deck.icon as IconName | null) ?? 'book'}
            size={27}
            color="#1A211C"
            fill="#FFFFFF"
            strokeWidth={1.6}
          />
        </View>
        <View style={styles.rowMid}>
          <Text style={styles.rowName} numberOfLines={1}>
            {deck.name}
          </Text>
          {mastery ? (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${mastery.percent}%`, backgroundColor: ink }]}>
                {Array.from({ length: 20 }, (_, i) => (
                  <View key={i} style={styles.stripe} />
                ))}
              </View>
            </View>
          ) : (
            <Text style={styles.rowHint}>No notes yet</Text>
          )}
        </View>
        <View style={styles.rowRight}>
          {mastery ? <Text style={[styles.rowPct, { color: ink }]}>{mastery.percent}%</Text> : null}
          <Text style={styles.rowCount}>
            {deck.questionCount} q
          </Text>
        </View>
        <BouncyPressable
          hitSlop={10}
          accessibilityLabel={`Edit ${deck.name}`}
          onPress={() => setEditing(deck)}
          style={styles.rowPen}>
          <Icon name="pencil" size={14} color={colors.textDim} strokeWidth={1.9} />
        </BouncyPressable>
      </BouncyPressable>
    );
  };

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <BinderHoles styles={styles} />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}>

        <View style={styles.headRow}>
          <Text style={styles.kicker}>FLIPP</Text>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={10}
            accessibilityLabel="Settings"
            style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}>
            <Icon name="gear" size={22} color={colors.ink} fill={colors.surface} strokeWidth={1.8} />
          </Pressable>
        </View>
        <Text style={styles.title}>My binder</Text>


        {nextSession ? (
          <BouncyPressable onPress={() => router.push('/planner')} style={styles.ribbon}>
            <Icon name="clock" size={17} color={colors.ink} fill={colors.goldWash} />
            <Text style={styles.ribbonText} numberOfLines={1}>
              Next: {joinDeckNames(nextSession.occurrences.map((o) => o.deckName))} · {formatClock(nextSession.at)}
            </Text>
            <Text style={styles.ribbonWhen}>{nextLabel}</Text>
            <Icon name="play" size={13} color={colors.gold} />
          </BouncyPressable>
        ) : null}

        {noteDecks.length >= SEARCH_THRESHOLD && (
          <View style={styles.searchWrapper}>
            <Icon name="globe" size={17} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects..."
              placeholderTextColor={colors.textFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        <View style={styles.dividerTab}>
          <Text style={styles.dividerText}>SUBJECTS · {noteDecks.length}</Text>
        </View>

        {filteredDecks.length > 0 ? (
          filteredDecks.map(renderRow)
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'Nothing matches' : 'No subjects yet!'}
            </Text>
            {!searchQuery.trim() && <Text style={styles.emptyHint}>Tap + Subject to start</Text>}
          </View>
        )}

        <View style={styles.actionRow}>
          <BouncyPressable onPress={() => setNaming(true)} style={[styles.actionBtn, styles.actionBtnNew]}>
            <Icon name="plus" size={22} color="#1A211C" strokeWidth={2.5} />
            <Text style={styles.actionLabel}>Subject</Text>
          </BouncyPressable>

          <BouncyPressable onPress={() => router.push('/notes/new')} style={[styles.actionBtn, styles.actionBtnNotes]}>
            <Icon name="bulb" size={22} color="#1A211C" fill="#FFFFFF" />
            <Text style={styles.actionLabel}>Add notes</Text>
          </BouncyPressable>
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
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingLeft: 32,
    paddingRight: 16,
    paddingBottom: tabClearance + 20,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  holes: {
    position: 'absolute',
    left: 11,
    top: 96,
    bottom: tabClearance,
    width: 13,
    justifyContent: 'space-evenly',
  },
  hole: {
    width: 13,
    height: 13,
    borderRadius: 999,
    backgroundColor: colors.track,
    borderWidth: 1.5,
    borderColor: colors.edge,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 34,
    lineHeight: 42,
    color: colors.text,
  },
  banner: {
    marginTop: 8,
  },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.goldWash,
    ...outlineOn(colors),
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 15,
    marginTop: 12,
    transform: [{ rotate: '-0.4deg' }],
    ...shadow.card,
  },
  ribbonText: {
    flex: 1,
    fontFamily: font.heading,
    fontSize: 13.5,
    color: colors.text,
  },
  ribbonWhen: {
    fontFamily: font.bodyBold,
    fontSize: 11,
    color: colors.gold,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 12,
    transform: [{ rotate: '0.3deg' }],
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
  dividerTab: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentWash,
    ...outlineOn(colors),
    borderTopLeftRadius: 8,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 2,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 14,
    paddingTop: 5,
    paddingBottom: 4,
    marginTop: 18,
    marginBottom: 10,
    transform: [{ rotate: '-1deg' }],
  },
  dividerText: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.accentDeep,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    ...derpRadius,
    paddingVertical: 11,
    paddingLeft: 11,
    paddingRight: 10,
    marginBottom: 10,
    ...shadow.card,
  },
  rowTiltLeft: { transform: [{ rotate: '-0.3deg' }] },
  rowTiltRight: { transform: [{ rotate: '0.3deg' }] },
  rowTile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
  },
  rowMid: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: font.heading,
    fontSize: 15.5,
    lineHeight: 19,
    color: colors.text,
  },
  bar: {
    height: 9,
    backgroundColor: colors.track,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginTop: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stripe: {
    width: 4,
    marginLeft: 8,
    height: 18,
    marginTop: -5,
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
    transform: [{ rotate: '20deg' }],
  },
  rowHint: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowPct: {
    fontFamily: font.hero,
    fontSize: 19,
    lineHeight: 21,
  },
  rowCount: {
    fontFamily: font.bodySemibold,
    fontSize: 10.5,
    color: colors.textFaint,
  },
  rowPen: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.edge,
    ...derpRadius,
    alignItems: 'center',
    paddingVertical: 26,
    marginBottom: 10,
  },
  emptyText: {
    fontFamily: font.hero,
    fontSize: 18,
    color: colors.textFaint,
  },
  emptyHint: {
    fontFamily: font.bodySemibold,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    ...outlineOn(colors),
    ...derpRadius,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.pop,
    gap: 8,
  },
  actionBtnNew: { backgroundColor: '#DDF3DC', transform: [{ rotate: '0.6deg' }] }, // mint
  actionBtnNotes: { backgroundColor: '#FCEBC0', transform: [{ rotate: '-0.8deg' }] }, // sun
  actionLabel: {
    fontFamily: font.hero,
    fontSize: 19,
    lineHeight: 22,
    color: '#1A211C',
  },
  triviaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFE5D2', // peach
    ...outlineOn(colors),
    ...derpRadius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
    transform: [{ rotate: '-0.5deg' }],
    ...shadow.pop,
  },
  triviaText: {
    flex: 1,
  },
  triviaTitle: {
    fontFamily: font.hero,
    fontSize: 21,
    lineHeight: 24,
    color: '#1A211C',
  },
  triviaKicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: '#BC5A2E',
  },
});
