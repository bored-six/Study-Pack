import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { PlanQuizSheet, type PlanDraft } from '@/components/PlanQuizSheet';
import { RuledPaper, Squiggle } from '@/components/notebook';
import { listDecks } from '@/lib/db';
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
import { colors, font, radius, tabClearance } from '@/theme/tokens';

/** Wall-clock label for a minutes-past-midnight value. */
function clockFor(timeOfDay: number): string {
  return formatClock(
    new Date().setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0, 0)
  );
}

function countdown(timestamp: number, now: number): string {
  const minutes = Math.round((timestamp - now) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(minutes / (60 * 24));
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

export default function PlannerScreen() {
  const insets = useSafeAreaInsets();
  const {
    schedules,
    leads,
    capability,
    refresh,
    add,
    toggle,
    remove,
    setLeads,
    askPermission,
    upcoming,
  } = usePlannerStore();

  const [subjects, setSubjects] = useState<Deck[]>([]);
  const [planning, setPlanning] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      void refresh();
      void listDecks('notes').then((decks) =>
        setSubjects(decks.filter((deck) => deck.questionCount > 0))
      );
    }, [refresh])
  );

  const next: Session | undefined = useMemo(
    () => upcoming(now)[0],
    [upcoming, now, schedules]
  );

  const handleSave = useCallback(
    async (draft: PlanDraft) => {
      setPlanning(false);

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
          `You already have ${clash.deckName} around ${clockFor(
            draft.timeOfDay
          )}. They'll run together as one session, with a single reminder.`,
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
      Alert.alert('Delete this plan?', `${name} will stop reminding you.`, [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void remove(id) },
      ]);
    },
    [remove]
  );

  const toggleLead = useCallback(
    (lead: number) => {
      const next = leads.includes(lead) ? leads.filter((l) => l !== lead) : [...leads, lead];
      if (next.length === 0) return;
      void setLeads(next);
    },
    [leads, setLeads]
  );

  const leadSummary = [...leads]
    .sort((a, b) => b - a)
    .map((lead) => (lead === 0 ? 'at start' : `${lead} min before`))
    .join(', ');

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>FLIPP</Text>
        <Text style={styles.title}>Planner</Text>
        <Squiggle color={colors.accent} style={styles.squiggle} />

        {next ? (
          <View style={styles.next}>
            <Text style={styles.nextLabel}>NEXT UP</Text>
            <Text style={styles.nextTime}>{formatClock(next.at)}</Text>
            <Text style={styles.nextDeck}>
              {joinDeckNames(next.occurrences.map((o) => o.deckName))}
            </Text>
            <Text style={styles.nextWhen}>{countdown(next.at, now)}</Text>
            <ChunkyButton
              label="Start now"
              size="lg"
              onPress={() => {
                const first = next.occurrences[0];
                if (first) {
                  router.push({
                    pathname: '/quiz/[deckId]',
                    params: { deckId: first.deckId },
                  });
                }
              }}
              style={styles.startBtn}
            />
          </View>
        ) : (
          <View style={styles.next}>
            <Text style={styles.nextTime}>Nothing planned</Text>
            <Text style={styles.nextWhen}>
              Pick a subject and a time that suits you. Deciding when you'll study makes
              you far likelier to actually do it.
            </Text>
          </View>
        )}

        {schedules.length > 0 ? (
          <View style={styles.plans}>
            {schedules.map((schedule) => (
              <Pressable
                key={schedule.id}
                onLongPress={() => handleDelete(schedule.id, schedule.deckName)}
                style={styles.planRow}>
                <View style={styles.planLeft}>
                  <Text style={[styles.planTime, !schedule.enabled && styles.dimmed]}>
                    {clockFor(schedule.timeOfDay)}
                  </Text>
                  <Text style={[styles.planMeta, !schedule.enabled && styles.dimmed]}>
                    {schedule.deckName} · {REPEAT_LABEL[schedule.repeat]}
                  </Text>
                </View>
                <Switch
                  value={schedule.enabled}
                  onValueChange={(value) => void toggle(schedule.id, value)}
                  trackColor={{ true: colors.accent, false: colors.track }}
                  thumbColor={colors.surface}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        <ChunkyButton
          label="Plan a quiz"
          icon="plus"
          size="lg"
          onPress={() => setPlanning(true)}
          style={styles.addBtn}
        />

        <Pressable onPress={() => setTuning(true)} style={styles.settingsRow}>
          <View style={styles.settingsText}>
            <Text style={styles.settingsLabel}>Reminders</Text>
            <Text style={styles.settingsValue}>
              {capability === 'denied' ? 'Turned off' : leadSummary}
            </Text>
          </View>
          <Icon name="bell" size={18} color={colors.textFaint} fill={colors.surface2} />
        </Pressable>

        {schedules.length > 0 ? (
          <Text style={styles.hint}>Hold a plan to delete it.</Text>
        ) : null}
      </ScrollView>

      <PlanQuizSheet
        visible={planning}
        subjects={subjects}
        onCancel={() => setPlanning(false)}
        onSave={(draft) => void handleSave(draft)}
      />

      <Modal visible={tuning} animationType="slide" transparent onRequestClose={() => setTuning(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTuning(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Remind me</Text>

            {capability === 'denied' ? (
              <ChunkyButton
                label="Turn on notifications"
                size="lg"
                onPress={() => void askPermission()}
                style={styles.permBtn}
              />
            ) : null}

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

            <Text style={styles.sheetNote}>
              Quizzes planned for the same time share one reminder, so nothing buzzes twice.
              Short lead times are approximate — Android may deliver them a few minutes late
              to save battery.
            </Text>

            <ChunkyButton
              label="Done"
              size="lg"
              onPress={() => setTuning(false)}
              style={styles.doneBtn}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: tabClearance },

  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 34,
    lineHeight: 44,
    color: colors.text,
  },
  squiggle: { marginTop: 2, marginLeft: 2 },

  next: { marginTop: 40 },
  nextLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.accentDeep,
    marginBottom: 4,
  },
  nextTime: {
    fontFamily: font.hero,
    fontSize: 52,
    lineHeight: 60,
    color: colors.text,
  },
  nextDeck: {
    fontFamily: font.bodyBold,
    fontSize: 17,
    color: colors.textDim,
    marginTop: 2,
  },
  nextWhen: {
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textFaint,
    marginTop: 4,
  },
  startBtn: { marginTop: 24 },

  plans: { marginTop: 44 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  planLeft: { flex: 1, paddingRight: 12 },
  planTime: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  planMeta: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 1,
  },
  dimmed: { opacity: 0.4 },

  addBtn: { marginTop: 36 },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  settingsText: { flex: 1 },
  settingsLabel: {
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  settingsValue: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 1,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 18,
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 18,
  },
  sheetTitle: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
    marginBottom: 18,
  },
  permBtn: { marginBottom: 18 },
  leadChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  leadChip: {
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  leadChipActive: { backgroundColor: colors.accent },
  leadText: { fontFamily: font.bodyBold, fontSize: 13, color: colors.textDim },
  leadTextActive: { color: colors.ink },
  sheetNote: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textFaint,
    marginTop: 18,
  },
  doneBtn: { marginTop: 26 },
});
