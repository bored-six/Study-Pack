import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { PlanQuizSheet, type PlanDraft } from '@/components/PlanQuizSheet';
import { RuledPaper } from '@/components/notebook';
import { listDecks, readSetting } from '@/lib/db';
import {
  AVAILABLE_LEADS,
  formatClock,
  isSpent,
  LEAD_LABEL,
  SESSION_WINDOW_MIN,
  type Session,
} from '@/lib/schedule';
import { REPEAT_LABEL, type Deck, type Schedule } from '@/lib/types';
import { usePlannerStore } from '@/store/planner';
import { derpRadius, font, getColors, outlineOn, shadow, tabClearance, useThemeStore } from '@/theme/tokens';

function clockFor(timeOfDay: number): string {
  const d = new Date();
  d.setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0, 0);
  return formatClock(d.getTime());
}

function formatTimeTile(timeOfDay: number): { time: string; period: string } {
  const d = new Date();
  d.setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0, 0);

  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const parts = formatter.formatToParts(d);
    let hour = '';
    let minute = '';
    let dayPeriod = '';
    let separator = ':';

    for (const part of parts) {
      if (part.type === 'hour') hour = part.value;
      else if (part.type === 'minute') minute = part.value;
      else if (part.type === 'dayPeriod') dayPeriod = part.value;
      else if (part.type === 'literal' && part.value.trim() && !dayPeriod) separator = part.value;
    }

    if (hour && minute) {
      return {
        time: `${hour}${separator.trim() || ':'}${minute}`,
        period: dayPeriod ? dayPeriod.toUpperCase() : '',
      };
    }
  } catch {
    // Fallback if formatToParts is unavailable
  }

  const raw = formatClock(d.getTime());
  const normalized = raw.replace(/[\u202F\u00A0\s]+/g, ' ').trim();
  const match = normalized.match(/^([0-9]{1,2}:[0-9]{2})\s*([A-Za-z]+)?$/);
  if (match) {
    return {
      time: match[1],
      period: match[2] ? match[2].toUpperCase() : '',
    };
  }

  const parts = normalized.split(' ');
  if (parts.length >= 2) {
    if (/\d/.test(parts[0])) {
      return { time: parts[0], period: parts[1].toUpperCase() };
    }
    return { time: parts[1], period: parts[0].toUpperCase() };
  }

  return { time: normalized, period: '' };
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

function DerpToggle({ value, onChange, label }: { value: boolean; onChange: (on: boolean) => void; label: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={[
        styles.derpToggle,
        { backgroundColor: value ? colors.accent : colors.surface, borderColor: colors.ink }
      ]}>
      <View style={[
        styles.derpToggleThumb,
        {
          left: value ? 22 : 2,
          backgroundColor: value ? colors.surface : colors.ink,
          borderColor: value ? colors.ink : 'transparent',
          borderWidth: value ? 2 : 0,
        }
      ]} />
    </Pressable>
  );
}

export default function PlannerScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
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
  const [clashDraft, setClashDraft] = useState<{ draft: PlanDraft; withName: string } | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const [kept, setKept] = useState(0);
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
      void readSetting('plans_kept_total').then((value) =>
        setKept(Number(value ?? 0) || 0)
      );
    }, [refresh])
  );

  const next: Session | undefined = useMemo(() => upcoming(now)[0], [upcoming, now, schedules]);

  const active = useMemo(() => schedules.filter((s) => s.enabled), [schedules]);
  const paused = useMemo(() => schedules.filter((s) => !s.enabled), [schedules]);

  const saveDraft = useCallback(async (draft: PlanDraft) => {
    await add(draft);
    if (capability === 'denied') {
      const result = await askPermission();
      if (result === 'denied') {
        setNotice({ title: 'Plan saved', message: "It'll show up here, but we can't remind you until notifications are on." });
      }
    }
  }, [add, askPermission, capability]);

  const handleSave = useCallback(async (draft: PlanDraft) => {
    setPlanning(false);
    const clash = schedules.find((s) => s.enabled && Math.abs(s.timeOfDay - draft.timeOfDay) <= SESSION_WINDOW_MIN);
    if (clash) {
      setClashDraft({ draft, withName: clash.deckName });
      return;
    }
    await saveDraft(draft);
  }, [saveDraft, schedules]);

  const toggleLead = useCallback((lead: number) => {
    const nextLeads = leads.includes(lead) ? leads.filter((l) => l !== lead) : [...leads, lead];
    if (nextLeads.length === 0) return;
    void setLeads(nextLeads);
  }, [leads, setLeads]);

  const renderRow = (schedule: Schedule, index: number) => {
    const isNext = next?.occurrences.some((o) => o.scheduleId === schedule.id) ?? false;
    const isDone = isSpent(schedule, now);

    let statusText = REPEAT_LABEL[schedule.repeat];
    if (!schedule.enabled) statusText = 'Paused';
    else if (isNext) statusText = `Upcoming (${countdown(next!.at, now)})`;
    else if (isDone) statusText = 'Done for today';

    const tileWash = !schedule.enabled
      ? '#DEDDD4'
      : isNext
        ? '#FBD5CC'
        : isDone
          ? '#E2E5E0'
          : '#DDF3DC';

    const { time, period } = formatTimeTile(schedule.timeOfDay);

    return (
      <Pressable
        key={schedule.id}
        onLongPress={() => setDeleting({ id: schedule.id, name: schedule.deckName })}
        accessibilityLabel={`${schedule.deckName} plan`}
        style={[
          styles.row,
          index % 2 === 0 ? styles.rowTiltLeft : styles.rowTiltRight,
          !schedule.enabled && styles.rowOff,
        ]}>
        <View style={[styles.timeTile, { backgroundColor: tileWash }]}>
          <Text style={styles.timeNum} numberOfLines={1} adjustsFontSizeToFit>{time}</Text>
          {period ? <Text style={styles.timeAmPm} numberOfLines={1}>{period}</Text> : null}
        </View>
        <View style={styles.rowMid}>
          <Text
            style={[styles.rowName, schedule.enabled && isDone && { textDecorationLine: 'line-through' }]}
            numberOfLines={1}>
            {schedule.deckName}
          </Text>
          <Text style={styles.rowStatus} numberOfLines={1}>{statusText}</Text>
        </View>
        <DerpToggle label={`Toggle ${schedule.deckName}`} value={schedule.enabled} onChange={(val) => void toggle(schedule.id, val)} />
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <View pointerEvents="none" style={styles.holes}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={styles.hole} />
        ))}
      </View>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: tabClearance + 20 }]}
        showsVerticalScrollIndicator={false}>

        <View style={styles.headRow}>
          <Text style={styles.kicker}>FLIPP</Text>
          {kept > 0 ? (
            <View style={styles.keptChip}>
              <Text style={styles.keptText}>{kept} {kept === 1 ? 'plan' : 'plans'} kept</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title}>My planner</Text>

        {schedules.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="calendar" size={40} color={colors.ink} fill={colors.bg} />
            <Text style={styles.emptyTitle}>Nothing planned yet!</Text>
            <Text style={styles.emptySub}>Schedule a quiz to build a habit.</Text>
          </View>
        ) : (
          <>
            {active.length > 0 ? (
              <>
                <View style={styles.dividerTab}>
                  <Text style={styles.dividerText}>PLANS · {active.length}</Text>
                </View>
                {active.map(renderRow)}
              </>
            ) : null}

            {paused.length > 0 ? (
              <>
                <View style={[styles.dividerTab, styles.dividerTabPaused]}>
                  <Text style={[styles.dividerText, { color: colors.textFaint }]}>PAUSED · {paused.length}</Text>
                </View>
                {paused.map(renderRow)}
              </>
            ) : null}

            <View style={styles.remCard}>
              <Icon name="bell" size={20} color={colors.ink} fill={colors.goldWash} />
              <Text style={styles.remLabel}>REMIND ME</Text>
              <View style={styles.leadChips}>
                {AVAILABLE_LEADS.map((lead) => {
                  const activeLead = leads.includes(lead);
                  return (
                    <Pressable
                      key={lead}
                      onPress={() => toggleLead(lead)}
                      style={[styles.leadChip, activeLead && styles.leadChipActive]}>
                      <Text style={[styles.leadText, activeLead && styles.leadTextActive]}>{LEAD_LABEL[lead]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {capability === 'denied' ? (
              <Pressable onPress={() => void askPermission()} hitSlop={6}>
                <Text style={styles.permText}>Notifications are off — tap to turn on</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Pressable
          onPress={() => setPlanning(true)}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}>
          <Text style={styles.addBtnText}>+ Add a plan</Text>
        </Pressable>
        {schedules.length > 0 ? (
          <Text style={styles.holdHint}>Hold a plan to delete it</Text>
        ) : null}

      </ScrollView>

      <ConfirmModal visible={clashDraft != null} title="Same time slot" message={clashDraft ? `You already have ${clashDraft.withName} around ${clockFor(clashDraft.draft.timeOfDay)}. They'll run together as one session, with a single reminder.` : undefined} confirmLabel="Add it" onCancel={() => setClashDraft(null)} onConfirm={() => { const draft = clashDraft?.draft; setClashDraft(null); if (draft) void saveDraft(draft); }} />
      <ConfirmModal visible={notice != null} title={notice?.title ?? ''} message={notice?.message} confirmLabel="Got it" onCancel={() => setNotice(null)} />
      <ConfirmModal visible={deleting != null} title="Delete this plan?" message={deleting ? `${deleting.name} will stop reminding you.` : undefined} confirmLabel="Delete" cancelLabel="Keep" destructive onCancel={() => setDeleting(null)} onConfirm={() => { const id = deleting?.id; setDeleting(null); if (id != null) void remove(id); }} />
      <PlanQuizSheet visible={planning} subjects={subjects} onCancel={() => setPlanning(false)} onSave={(draft) => void handleSave(draft)} />
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: {
    paddingLeft: 32,
    paddingRight: 16,
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
    minHeight: 30,
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  keptChip: {
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    ...shadow.card,
    transform: [{ rotate: '2deg' }],
  },
  keptText: {
    fontFamily: font.heading,
    fontSize: 12.5,
    color: colors.text,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 34,
    lineHeight: 42,
    color: colors.text,
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
    marginTop: 16,
    marginBottom: 10,
    transform: [{ rotate: '-1deg' }],
  },
  dividerTabPaused: {
    backgroundColor: colors.surface2,
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
    gap: 11,
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    ...derpRadius,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 12,
    marginBottom: 10,
    ...shadow.card,
  },
  rowTiltLeft: { transform: [{ rotate: '-0.3deg' }] },
  rowTiltRight: { transform: [{ rotate: '0.3deg' }] },
  rowOff: { opacity: 0.55 },
  timeTile: {
    width: 62,
    height: 52,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2deg' }],
  },
  timeNum: {
    fontFamily: font.hero,
    fontSize: 16.5,
    lineHeight: 19,
    color: '#1A211C',
  },
  timeAmPm: {
    fontFamily: font.bodyHeavy,
    fontSize: 9.5,
    lineHeight: 11,
    letterSpacing: 0.8,
    color: '#1A211C',
    marginTop: 1,
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
  rowStatus: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 1,
  },
  remCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.goldWash,
    ...outlineOn(colors),
    ...derpRadius,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    transform: [{ rotate: '-0.4deg' }],
    ...shadow.card,
  },
  remLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.gold,
  },
  leadChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  leadChip: {
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  leadChipActive: {
    backgroundColor: '#FCEBC0',
    transform: [{ rotate: '2deg' }],
  },
  leadText: {
    fontFamily: font.heading,
    fontSize: 12,
    color: colors.textDim,
  },
  leadTextActive: {
    color: '#1A211C',
  },
  permText: {
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    color: colors.coral,
    marginTop: 8,
    marginLeft: 4,
  },
  emptyCard: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.edge,
    ...derpRadius,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 30,
    marginTop: 18,
  },
  emptyTitle: {
    fontFamily: font.hero,
    fontSize: 24,
    color: colors.text,
  },
  emptySub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    textAlign: 'center',
  },
  addBtn: {
    height: 58,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.accentEdge,
    ...derpRadius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    transform: [{ rotate: '0.4deg' }],
    ...shadow.pop,
  },
  addBtnText: {
    fontFamily: font.hero,
    fontSize: 24,
    color: colors.onAccent,
  },
  holdHint: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 10,
  },
  derpToggle: {
    width: 48,
    height: 28,
    borderWidth: 2,
    borderRadius: 20,
    justifyContent: 'center',
  },
  derpToggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
