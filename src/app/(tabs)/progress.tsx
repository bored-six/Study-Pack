import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AchievementModal } from '@/components/AchievementModal';
import { AchievementSticker } from '@/components/AchievementSticker';
import { FireflyJar } from '@/components/FireflyJar';
import { Icon } from '@/components/Icon';
import { RuledPaper } from '@/components/notebook';
import { ACHIEVEMENTS, achievementById, type Unlock } from '@/lib/achievements';
import { daysToNextTier, fireFor, FIRE_TIERS } from '@/lib/fire';
import { masteryLabel } from '@/lib/mastery';
import { useAchievementsStore } from '@/store/achievements';
import { dayKey, useProgressStore } from '@/store/progress';
import { subjectInkFor } from '@/theme/tokens';
import { derpRadius, font, outline, shadow, tabClearance, useThemeStore, getColors } from '@/theme/tokens';
import { useNotesStore } from '@/store/notes';

/** Days shown on the chart: 12 weeks, so it always fills the width. */
const CHART_WEEKS = 12;
const DAYS = CHART_WEEKS * 7;

function masteryColor(percent: number, colors: any): string {
  if (percent >= 85) return colors.leaf;
  if (percent >= 60) return colors.accentDeep;
  if (percent >= 30) return colors.gold;
  return colors.coral;
}

/** Four shades plus empty — enough to show shape, few enough to read. */
function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

interface Day {
  key: string;
  at: number;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const {
    totalAttempts,
    totalAnswers,
    subjects,
    weakCount,
    currentStreak,
    longestStreak,
    dayCounts,
    status,
    refresh,
  } = useProgressStore();
  const { unlocked, refresh: refreshAchievements } = useAchievementsStore();
  const { subjects: noteDecks, refresh: refreshNotes } = useNotesStore();

  const [viewing, setViewing] = useState<Unlock | null>(null);
  const [pickedDay, setPickedDay] = useState<Day | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshAchievements();
      void refreshNotes();
    }, [refresh, refreshAchievements, refreshNotes])
  );

  const iconFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const deck of noteDecks) map.set(deck.id, deck.icon ?? 'book');
    return map;
  }, [noteDecks]);

  const colourFor = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const deck of noteDecks) map.set(deck.id, deck.color ?? null);
    return map;
  }, [noteDecks]);

  /** Days on which at least one sticker was earned. */
  const pinnedDays = useMemo(() => {
    const set = new Set<string>();
    for (const unlock of unlocked) set.add(dayKey(unlock.at));
    return set;
  }, [unlocked]);

  const days: Day[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = dayKey(today.getTime());

    // End the grid on the last day of this week so columns stay aligned.
    const endOffset = 6 - ((today.getDay() + 6) % 7); // Monday-first week
    const out: Day[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const at = today.getTime() + (endOffset - i) * 86_400_000;
      const key = dayKey(at);
      const count = dayCounts[key] ?? 0;
      out.push({ key, at, count, level: heatLevel(count), isToday: key === todayKey });
    }
    return out;
  }, [dayCounts]);

  /** Columns of 7, Monday at the top — a wall planner, not a ribbon. */
  const columns = useMemo(() => {
    const cols: Day[][] = [];
    for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
    return cols;
  }, [days]);

  const monthMarks = useMemo(() => {
    const marks: { label: string; column: number }[] = [];
    let last = '';
    columns.forEach((col, index) => {
      const month = new Date(col[0].at).toLocaleDateString(undefined, { month: 'short' });
      if (month !== last) {
        marks.push({ label: month.toUpperCase(), column: index });
        last = month;
      }
    });
    return marks;
  }, [columns]);

  if (status !== 'ready') {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator color={colors.accentDeep} />
      </View>
    );
  }

  const nothingYet = totalAttempts === 0 && subjects.length === 0;
  const fire = fireFor(currentStreak);
  const toNext = daysToNextTier(currentStreak);
  const tierIndex = FIRE_TIERS.findIndex((t) => t.from === fire.from) + 1;
  const nextTier = FIRE_TIERS.find((t) => t.from > currentStreak);
  const tierSpan = nextTier ? nextTier.from - fire.from : 1;
  const tierProgress = nextTier
    ? Math.max(0.04, Math.min(1, (currentStreak - fire.from) / tierSpan))
    : 1;

  const overall =
    subjects.length > 0
      ? Math.round(subjects.reduce((sum, s) => sum + s.percent, 0) / subjects.length)
      : 0;

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.kicker}>FLIPP</Text>
        <Text style={styles.title}>My progress</Text>

        {nothingYet ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing to show yet</Text>
            <Text style={styles.emptyBody}>
              Add your notes and take a quiz. Every answer counts towards how well you know
              each subject — so this fills in as you go.
            </Text>
          </View>
        ) : (
          <>
            {/* ---- the streak ---- */}
            <View style={styles.streakCard}>
              <View style={styles.jarWrap}>
                <FireflyJar tier={fire} size={72} lit={currentStreak > 0} />
              </View>
              <View style={styles.streakText}>
                <Text style={styles.streakDays}>
                  {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
                </Text>
                <Text style={styles.streakTier}>
                  {fire.name.toUpperCase()} · TIER {tierIndex} OF {FIRE_TIERS.length}
                </Text>
                <View style={styles.tierTrack}>
                  <View style={[styles.tierFill, { width: `${tierProgress * 100}%` }]} />
                </View>
                <Text style={styles.tierLabel}>
                  {toNext != null && nextTier
                    ? `${toNext} ${toNext === 1 ? 'day' : 'days'} to ${nextTier.name}`
                    : 'The jar is full.'}
                </Text>
              </View>
            </View>

            {/* ---- the wall chart ---- */}
            <View style={styles.dividerTab}>
              <Text style={styles.dividerText}>THE WALL CHART</Text>
            </View>

            <View style={styles.chartCard}>
              {pickedDay ? (
                <Pressable style={styles.dayPop} onPress={() => setPickedDay(null)}>
                  <Text style={styles.dayPopDate}>
                    {new Date(pickedDay.at)
                      .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
                      .toUpperCase()}
                  </Text>
                  <Text style={styles.dayPopTitle}>
                    {pickedDay.count === 0
                      ? 'Nothing'
                      : `${pickedDay.count} ${pickedDay.count === 1 ? 'round' : 'rounds'}`}
                  </Text>
                  {pinnedDays.has(pickedDay.key) ? (
                    <Text style={styles.dayPopBody}>A sticker landed here</Text>
                  ) : null}
                </Pressable>
              ) : null}

              <View style={styles.monthRow}>
                {monthMarks.map((mark) => (
                  <Text
                    key={mark.label + mark.column}
                    style={[styles.monthLabel, { left: `${(mark.column / CHART_WEEKS) * 100}%` }]}>
                    {mark.label}
                  </Text>
                ))}
              </View>

              <View style={styles.chartRow}>
                <View style={styles.dayRail}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <Text key={i} style={styles.dayRailText}>
                      {d}
                    </Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {columns.map((col, ci) => (
                    <View key={ci} style={styles.gridCol}>
                      {col.map((day) => (
                        <Pressable
                          key={day.key}
                          onPress={() => setPickedDay(day)}
                          accessibilityLabel={`${day.key}, ${day.count} rounds`}
                          style={[
                            styles.cell,
                            day.level > 0 && { backgroundColor: heatColor(day.level, colors) },
                            day.isToday && styles.cellToday,
                          ]}>
                          {pinnedDays.has(day.key) ? <View style={styles.pin} /> : null}
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.chartFoot}>
                <View style={styles.keyRow}>
                  <Text style={styles.keyText}>Quiet</Text>
                  {[0, 1, 2, 3, 4].map((l) => (
                    <View
                      key={l}
                      style={[
                        styles.keySwatch,
                        l > 0 && { backgroundColor: heatColor(l as 1 | 2 | 3 | 4, colors) },
                      ]}
                    />
                  ))}
                  <Text style={styles.keyText}>Busy</Text>
                </View>
                <View style={styles.keyRow}>
                  <View style={styles.pinKey} />
                  <Text style={[styles.keyText, { color: colors.gold }]}>sticker earned</Text>
                </View>
              </View>
            </View>

            {/* ---- the numbers ---- */}
            <View style={styles.numbers}>
              <View style={[styles.numCard, styles.numCard1]}>
                <Text style={styles.numValue}>{totalAnswers}</Text>
                <Text style={styles.numLabel}>ANSWERS</Text>
              </View>
              <View style={[styles.numCard, styles.numCard2]}>
                <Text style={styles.numValue}>{longestStreak}</Text>
                <Text style={styles.numLabel}>BEST RUN</Text>
              </View>
              <View style={[styles.numCard, styles.numCard3]}>
                <Text style={styles.numValue}>{overall}%</Text>
                <Text style={styles.numLabel}>OVERALL</Text>
              </View>
            </View>

            {/* ---- the album ---- */}
            <View style={[styles.dividerTab, styles.dividerTabWarm]}>
              <Text style={[styles.dividerText, { color: colors.gold }]}>
                THE ALBUM · {unlocked.length} OF {ACHIEVEMENTS.length}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push('/album')}
              accessibilityLabel="Open the album"
              style={({ pressed }) => [styles.albumStrip, pressed && { opacity: 0.85 }]}>
              {recentStickers(unlocked).map((entry) => (
                <AchievementSticker
                  key={entry.id}
                  family={entry.family}
                  icon={entry.icon}
                  size={38}
                  isDark={isDark}
                />
              ))}
              {unlocked.length === 0 ? (
                <Text style={styles.albumEmpty}>None yet — they find you as you go</Text>
              ) : null}
              {unlocked.length > 5 ? (
                <Text style={styles.albumMore}>+{unlocked.length - 5}</Text>
              ) : null}
              <View style={styles.albumChev}>
                <Icon name="play" size={13} color={colors.gold} />
              </View>
            </Pressable>

            {/* ---- weak spots ---- */}
            {weakCount > 0 ? (
              <View style={styles.tripCard}>
                <Icon name="bolt" size={24} color="#1A211C" fill={colors.coralWash} />
                <View style={styles.tripText}>
                  <Text style={styles.tripNum}>
                    {weakCount} {weakCount === 1 ? 'question' : 'questions'}
                  </Text>
                  <Text style={styles.tripLabel}>You missed these recently</Text>
                </View>
              </View>
            ) : null}

            {/* ---- mastery ---- */}
            {subjects.length > 0 ? (
              <>
                <View style={[styles.dividerTab, styles.dividerTabPlain]}>
                  <Text style={[styles.dividerText, { color: colors.textFaint }]}>
                    MASTERY · {subjects.length}
                  </Text>
                </View>
                {subjects.map((subject, index) => {
                  const wash = colourFor.get(subject.deckId) ?? null;
                  const ink = wash ? subjectInkFor(wash) : masteryColor(subject.percent, colors);
                  return (
                    <View
                      key={subject.deckId}
                      style={[
                        styles.mRow,
                        index % 2 === 0 ? styles.tiltLeft : styles.tiltRight,
                      ]}>
                      <View style={[styles.mTile, wash ? { backgroundColor: wash } : null]}>
                        <Icon
                          name={(iconFor.get(subject.deckId) as any) ?? 'book'}
                          size={23}
                          color="#1A211C"
                          fill="#FFFFFF"
                          strokeWidth={1.6}
                        />
                      </View>
                      <View style={styles.mMid}>
                        <Text style={styles.mName} numberOfLines={1}>
                          {subject.deckName}
                        </Text>
                        <Text style={styles.mLabel}>{masteryLabel(subject.percent)}</Text>
                        <View style={styles.bar}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${subject.percent}%`, backgroundColor: ink },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.mPct, { color: ink }]}>{subject.percent}</Text>
                    </View>
                  );
                })}
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
    </View>
  );
}

function heatColor(level: 1 | 2 | 3 | 4 | 0, colors: any): string {
  switch (level) {
    case 1:
      return colors.leafWash;
    case 2:
      return '#C8E7B4';
    case 3:
      return '#8FD08A';
    case 4:
      return '#4FB26A';
    default:
      return colors.track;
  }
}

/** The five most recent unlocks, newest first, for the home strip. */
function recentStickers(unlocked: readonly Unlock[]) {
  return [...unlocked]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map((unlock) => {
      const def = achievementById(unlock.id);
      return def ? { id: unlock.id, family: def.family, icon: def.icon } : null;
    })
    .filter((x): x is { id: string; family: any; icon: any } => x != null);
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: 16,
    paddingBottom: tabClearance + 24,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.accentDeep,
    paddingTop: 6,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 34,
    lineHeight: 42,
    color: colors.text,
  },

  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.goldWash,
    ...outline,
    ...derpRadius,
    padding: 11,
    marginTop: 12,
    transform: [{ rotate: '-0.4deg' }],
    ...shadow.card,
  },
  jarWrap: {
    width: 76,
    height: 76,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 21,
    borderBottomRightRadius: 17,
    borderBottomLeftRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '2deg' }],
    overflow: 'hidden',
  },
  streakText: { flex: 1 },
  streakDays: {
    fontFamily: font.hero,
    fontSize: 28,
    lineHeight: 30,
    color: colors.text,
  },
  streakTier: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.gold,
    marginTop: 2,
  },
  tierTrack: {
    height: 7,
    backgroundColor: colors.track,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginTop: 6,
    overflow: 'hidden',
  },
  tierFill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: 999,
  },
  tierLabel: {
    fontFamily: font.bodyBold,
    fontSize: 10,
    color: colors.gold,
    marginTop: 3,
  },

  dividerTab: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentWash,
    ...outline,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 2,
    borderBottomLeftRadius: 2,
    paddingHorizontal: 14,
    paddingTop: 5,
    paddingBottom: 4,
    marginTop: 18,
    marginBottom: 9,
    transform: [{ rotate: '-1deg' }],
  },
  dividerTabWarm: { backgroundColor: colors.goldWash },
  dividerTabPlain: { backgroundColor: colors.surface2 },
  dividerText: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.accentDeep,
  },

  chartCard: {
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    padding: 11,
    ...shadow.card,
    transform: [{ rotate: '-0.3deg' }],
  },
  monthRow: {
    height: 13,
    marginLeft: 16,
    marginBottom: 2,
  },
  monthLabel: {
    position: 'absolute',
    fontFamily: font.bodyHeavy,
    fontSize: 8,
    letterSpacing: 0.6,
    color: colors.textFaint,
  },
  chartRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dayRail: {
    width: 12,
    justifyContent: 'space-between',
  },
  dayRailText: {
    fontFamily: font.bodyHeavy,
    fontSize: 7,
    color: colors.textFaint,
    lineHeight: 9,
    textAlign: 'center',
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  gridCol: {
    flex: 1,
    gap: 3,
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 2.5,
    backgroundColor: colors.track,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: {
    borderWidth: 2,
    borderColor: colors.coral,
  },
  pin: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.goldWash,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  chartFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  keyText: {
    fontFamily: font.bodyBold,
    fontSize: 9,
    color: colors.textFaint,
  },
  keySwatch: {
    width: 9,
    height: 9,
    borderRadius: 2.5,
    backgroundColor: colors.track,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  pinKey: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.goldWash,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  dayPop: {
    position: 'absolute',
    right: 10,
    top: -6,
    zIndex: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    transform: [{ rotate: '1.5deg' }],
    ...shadow.pop,
  },
  dayPopDate: {
    fontFamily: font.bodyHeavy,
    fontSize: 8.5,
    letterSpacing: 1,
    color: colors.textFaint,
  },
  dayPopTitle: {
    fontFamily: font.hero,
    fontSize: 17,
    lineHeight: 20,
    color: colors.text,
  },
  dayPopBody: {
    fontFamily: font.bodySemibold,
    fontSize: 10,
    color: colors.gold,
  },

  numbers: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 11,
  },
  numCard: {
    flex: 1,
    backgroundColor: colors.surface,
    ...outline,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 14,
    paddingVertical: 8,
    alignItems: 'center',
    ...shadow.card,
  },
  numCard1: { transform: [{ rotate: '-1deg' }] },
  numCard2: { transform: [{ rotate: '1deg' }], backgroundColor: '#DBEEFB' },
  numCard3: { transform: [{ rotate: '-0.5deg' }], backgroundColor: '#EAE2FA' },
  numValue: {
    fontFamily: font.hero,
    fontSize: 23,
    lineHeight: 25,
    color: '#1A211C',
  },
  numLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 8,
    letterSpacing: 0.8,
    color: '#5D6F5C',
  },

  albumStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    paddingVertical: 9,
    paddingHorizontal: 11,
    transform: [{ rotate: '0.3deg' }],
    ...shadow.card,
  },
  albumEmpty: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    color: colors.textFaint,
  },
  albumMore: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    color: colors.textFaint,
  },
  albumChev: {
    marginLeft: 'auto',
  },

  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.coralWash,
    ...outline,
    ...derpRadius,
    padding: 12,
    marginTop: 12,
    transform: [{ rotate: '0.4deg' }],
    ...shadow.card,
  },
  tripText: { flex: 1 },
  tripNum: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 22,
    color: '#1A211C',
  },
  tripLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 11,
    color: '#BC5A2E',
  },

  mRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 12,
    marginBottom: 9,
    ...shadow.card,
  },
  tiltLeft: { transform: [{ rotate: '-0.3deg' }] },
  tiltRight: { transform: [{ rotate: '0.3deg' }] },
  mTile: {
    width: 42,
    height: 42,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 11,
    borderBottomLeftRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
  },
  mMid: { flex: 1, minWidth: 0 },
  mName: {
    fontFamily: font.heading,
    fontSize: 15,
    lineHeight: 18,
    color: colors.text,
  },
  mLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 10.5,
    color: colors.textFaint,
  },
  bar: {
    height: 8,
    backgroundColor: colors.track,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    marginTop: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  mPct: {
    fontFamily: font.hero,
    fontSize: 19,
    lineHeight: 21,
  },

  emptyCard: { marginTop: 30 },
  emptyTitle: { fontFamily: font.hero, fontSize: 26, lineHeight: 34, color: colors.text },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textDim,
    marginTop: 8,
  },
});
