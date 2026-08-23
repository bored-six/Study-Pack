import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { PlanQuizSheet, type PlanDraft } from '@/components/PlanQuizSheet';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { listPlayableDecks } from '@/lib/db';
import {
  AVAILABLE_LEADS,
  formatClock,
  joinDeckNames,
  LEAD_LABEL,
  SESSION_WINDOW_MIN,
  type Session,
} from '@/lib/schedule';
import { REPEAT_LABEL, type Deck } from '@/lib/types';
import { usePlannerStore } from '@/store/planner';
import { colors, derpRadius, font, outline, radius, shadow, tabClearance } from '@/theme/tokens';

function dayLabel(timestamp: number, now = Date.now()): string {
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diff = Math.round((day(timestamp) - day(now)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function countdown(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((timestamp - now) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hr`;
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

function NextUp({ session, onStart }: { session: Session; onStart: (s: Session) => void }) {
  const names = session.occurrences.map((o) => o.deckName);
  const count = new Set(session.occurrences.map((o) => o.deckId)).size;

  return (
    <View style={styles.nextCard}>
      <Tape />
      <Text style={styles.nextKicker}>NEXT UP</Text>
      <Text style={styles.nextTime}>{formatClock(session.at)}</Text>
      <Text style={styles.nextWhen}>
        {dayLabel(session.at)} · {countdown(session.at)}
      </Text>
      <Text style={styles.nextDecks}>
        {joinDeckNames(names)}
        {count > 1 ? ` — ${count} quizzes back to back` : ''}
      </Text>
      <ChunkyButton
        label="Start now"
        icon="play"
        size="lg"
        onPress={() => onStart(session)}
        style={styles.nextBtn}
      />
    </View>
  );
}

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const {
    schedules,
    leads,
    capability,
    armed,
    refresh,
    add,
    toggle,
    remove,
    setLeads,
    askPermission,
    upcoming,
  } = usePlannerStore();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Countdowns go stale while the screen sits open; re-read the clock on
  // focus rather than ticking a timer every second.
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      void refresh();
      void listPlayableDecks().then(setDecks);
    }, [refresh])
  );

  const sessions = useMemo(() => upcoming(now).slice(0, 8), [upcoming, now, schedules]);
  const next = sessions[0];

  const handleStart = useCallback((session: Session) => {
    const first = session.occurrences[0];
    if (first) {
      router.push({ pathname: '/quiz/[deckId]', params: { deckId: first.deckId } });
    }
  }, []);

  const handleSave = useCallback(
    async (draft: PlanDraft) => {
      setSheetOpen(false);

      // Catch collisions at authoring time: if this lands in an existing
      // slot, say so plainly instead of letting two reminders pile up.
      const clash = schedules.find(
        (s) => s.enabled && Math.abs(s.timeOfDay - draft.timeOfDay) <= SESSION_WINDOW_MIN
      );

      const save = async () => {
        await add(draft);
        if (capability === 'denied') {
          const result = await askPermission();
          if (result === 'denied') {
            Alert.alert(
              'Plan saved',
              "It'll show up here, but we can't remind you until notifications are on."
            );
          }
        }
      };

      if (clash) {
        Alert.alert(
          'Same time slot',
          `You already have ${clash.deckName} around ${formatClock(
            new Date().setHours(Math.floor(draft.timeOfDay / 60), draft.timeOfDay % 60, 0, 0)
          )}. They'll run as one session with a single reminder.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add it', onPress: () => void save() },
          ]
        );
        return;
      }

      await save();
    },
    [add, askPermission, capability, schedules]
  );

  const handleDelete = useCallback(
    (id: number, name: string) => {
      Alert.alert('Delete plan?', `${name} will stop reminding you.`, [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void remove(id) },
      ]);
    },
    [remove]
  );

  const toggleLead = useCallback(
    (lead: number) => {
      const next = leads.includes(lead) ? leads.filter((l) => l !== lead) : [...leads, lead];
      if (next.length === 0) return; // always keep at least one
      void setLeads(next);
    },
    [leads, setLeads]
  );

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>FLIPP</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Your</Text>
          <View style={styles.titleSticker}>
            <Text style={styles.titleStickerText}>planner</Text>
          </View>
        </View>
        <Squiggle color={colors.accent} style={styles.squiggle} />
        <Text style={styles.sub}>Pick your own study times. We'll nudge you.</Text>

        {capability === 'denied' ? (
          <Pressable onPress={() => void askPermission()} style={styles.permBanner}>
            <Icon name="bell" size={17} color={colors.ink} fill={colors.goldWash} />
            <Text style={styles.permText}>
              Reminders are off. Tap to turn them on — your plans stay saved either way.
            </Text>
          </Pressable>
        ) : null}

        {capability === 'unsupported' ? (
          <View style={styles.permBanner}>
            <Icon name="alert" size={17} color={colors.ink} fill={colors.goldWash} />
            <Text style={styles.permText}>
              Reminders need the phone app — plans still show up here.
            </Text>
          </View>
        ) : null}

        {next ? <NextUp session={next} onStart={handleStart} /> : null}

        {sessions.length > 1 ? (
          <>
            <Text style={styles.sectionLabel}>COMING UP</Text>
            {sessions.slice(1).map((session) => (
              <View key={session.at} style={styles.upcomingRow}>
                <View style={styles.upcomingTime}>
                  <Text style={styles.upcomingClock}>{formatClock(session.at)}</Text>
                  <Text style={styles.upcomingDay}>{dayLabel(session.at, now)}</Text>
                </View>
                <Text style={styles.upcomingDecks} numberOfLines={2}>
                  {joinDeckNames(session.occurrences.map((o) => o.deckName))}
                </Text>
                {session.occurrences.length > 1 ? (
                  <View style={styles.stackBadge}>
                    <Text style={styles.stackBadgeText}>×{session.occurrences.length}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionLabel}>YOUR PLANS</Text>
        {schedules.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyBadge}>
              <Icon name="calendar" size={26} color={colors.ink} fill={colors.accentWash} />
            </View>
            <Text style={styles.emptyTitle}>Nothing planned yet</Text>
            <Text style={styles.emptyBody}>
              Pick a deck and a time that actually suits you. Planning when you'll study
              makes you far likelier to follow through.
            </Text>
          </View>
        ) : (
          schedules.map((schedule) => (
            <View key={schedule.id} style={styles.planRow}>
              <View style={styles.planTime}>
                <Text style={styles.planClock}>
                  {formatClock(
                    new Date().setHours(
                      Math.floor(schedule.timeOfDay / 60),
                      schedule.timeOfDay % 60,
                      0,
                      0
                    )
                  )}
                </Text>
                <Text style={styles.planRepeat}>{REPEAT_LABEL[schedule.repeat]}</Text>
              </View>
              <Text style={styles.planDeck} numberOfLines={2}>
                {schedule.deckName}
              </Text>
              <Switch
                value={schedule.enabled}
                onValueChange={(value) => void toggle(schedule.id, value)}
                trackColor={{ true: colors.accent, false: colors.track }}
                thumbColor={colors.surface}
              />
              <Pressable
                onPress={() => handleDelete(schedule.id, schedule.deckName)}
                hitSlop={8}
                style={styles.deleteBtn}>
                <Icon name="trash" size={17} color={colors.textFaint} strokeWidth={1.9} />
              </Pressable>
            </View>
          ))
        )}

        <ChunkyButton
          label="Plan a quiz"
          icon="plus"
          size="lg"
          onPress={() => setSheetOpen(true)}
          style={styles.addBtn}
        />

        <Text style={styles.sectionLabel}>REMIND ME</Text>
        <View style={styles.leadChips}>
          {AVAILABLE_LEADS.map((lead) => {
            const active = leads.includes(lead);
            return (
              <Pressable
                key={lead}
                onPress={() => toggleLead(lead)}
                style={[styles.leadChip, active && styles.leadChipActive]}>
                <Text style={[styles.leadText, active && styles.leadTextActive]}>
                  {LEAD_LABEL[lead]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.leadNote}>
          Reminders for quizzes at the same time are merged into one, so nothing buzzes
          twice. Short lead times are approximate — Android may deliver them a few minutes
          late to save battery.
        </Text>
        {armed.length > 0 ? (
          <Text style={styles.armedNote}>
            {armed.length} reminder{armed.length === 1 ? '' : 's'} set
          </Text>
        ) : null}
      </ScrollView>

      <PlanQuizSheet
        visible={sheetOpen}
        decks={decks}
        onCancel={() => setSheetOpen(false)}
        onSave={(draft) => void handleSave(draft)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: tabClearance },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontFamily: font.hero, fontSize: 32, lineHeight: 42, color: colors.text },
  titleSticker: {
    backgroundColor: colors.accentWash,
    ...outline,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-2.5deg' }],
    ...shadow.card,
  },
  titleStickerText: { fontFamily: font.hero, fontSize: 24, lineHeight: 32, color: colors.ink },
  squiggle: { marginTop: 2, marginLeft: 2 },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 1,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.goldWash,
    borderWidth: 1.5,
    borderColor: 'rgba(172, 118, 28, 0.22)',
    borderRadius: radius.control,
    padding: 12,
    marginTop: 14,
  },
  permText: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.gold,
  },
  nextCard: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 18,
    marginTop: 18,
    ...shadow.pop,
  },
  nextKicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: colors.accentDeep,
  },
  nextTime: {
    fontFamily: font.hero,
    fontSize: 42,
    lineHeight: 50,
    color: colors.text,
  },
  nextWhen: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.gold,
    marginTop: -2,
  },
  nextDecks: {
    fontFamily: font.bodySemibold,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.textDim,
    marginTop: 6,
  },
  nextBtn: { marginTop: 14 },
  sectionLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.textFaint,
    marginTop: 22,
    marginBottom: 9,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.control,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 8,
  },
  upcomingTime: { width: 74 },
  upcomingClock: { fontFamily: font.hero, fontSize: 19, color: colors.text },
  upcomingDay: { fontFamily: font.bodySemibold, fontSize: 11, color: colors.textFaint },
  upcomingDecks: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 13.5,
    color: colors.textDim,
  },
  stackBadge: {
    backgroundColor: colors.accentWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stackBadgeText: { fontFamily: font.bodyHeavy, fontSize: 11.5, color: colors.accentDeep },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.control,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 8,
  },
  planTime: { width: 74 },
  planClock: { fontFamily: font.hero, fontSize: 19, color: colors.text },
  planRepeat: { fontFamily: font.bodySemibold, fontSize: 11, color: colors.textFaint },
  planDeck: { flex: 1, fontFamily: font.bodyBold, fontSize: 13.5, color: colors.text },
  deleteBtn: { padding: 2 },
  addBtn: { marginTop: 6 },
  emptyCard: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 4,
    ...shadow.card,
  },
  emptyBadge: {
    width: 52,
    height: 52,
    ...derpRadius,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    transform: [{ rotate: '-3deg' }],
  },
  emptyTitle: { fontFamily: font.heading, fontSize: 16, color: colors.text },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.textDim,
    textAlign: 'center',
  },
  leadChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  leadChip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  leadChipActive: { backgroundColor: colors.accent, ...shadow.card },
  leadText: { fontFamily: font.bodyHeavy, fontSize: 12, color: colors.textDim },
  leadTextActive: { color: colors.ink },
  leadNote: {
    fontFamily: font.body,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.textFaint,
    marginTop: 10,
  },
  armedNote: {
    fontFamily: font.bodyHeavy,
    fontSize: 11.5,
    color: colors.accentDeep,
    marginTop: 8,
  },
});
