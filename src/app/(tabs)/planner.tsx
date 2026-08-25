import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { PlanQuizSheet, type PlanDraft } from '@/components/PlanQuizSheet';
import { RuledPaper } from '@/components/notebook';
import { listDecks } from '@/lib/db';
import {
  AVAILABLE_LEADS,
  formatClock,
  isSpent,
  joinDeckNames,
  LEAD_LABEL,
  SESSION_WINDOW_MIN,
  type Session,
} from '@/lib/schedule';
import { REPEAT_LABEL, type Deck } from '@/lib/types';
import { usePlannerStore } from '@/store/planner';
import { font, radius, tabClearance, getColors, useThemeStore } from '@/theme/tokens';

const { width } = Dimensions.get('window');

function clockFor(timeOfDay: number): string {
  return formatClock(new Date().setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0, 0));
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
        { backgroundColor: value ? colors.accent : colors.surface, borderColor: isDark ? '#1A211C' : colors.ink }
      ]}>
      <View style={[
        styles.derpToggleThumb,
        { 
          left: value ? 22 : 2, 
          backgroundColor: value ? colors.surface : (isDark ? '#1A211C' : colors.ink),
          borderColor: value ? (isDark ? '#1A211C' : colors.ink) : 'transparent',
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

  const next: Session | undefined = useMemo(() => upcoming(now)[0], [upcoming, now, schedules]);

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

  const handleDelete = useCallback((id: number, name: string) => setDeleting({ id, name }), []);

  const toggleLead = useCallback((lead: number) => {
    const nextLeads = leads.includes(lead) ? leads.filter((l) => l !== lead) : [...leads, lead];
    if (nextLeads.length === 0) return;
    void setLeads(nextLeads);
  }, [leads, setLeads]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <RuledPaper />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.magnetTitle}>
          <Text style={styles.magnetText}>My Planner</Text>
        </View>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: tabClearance + 40 }]}
        showsVerticalScrollIndicator={false}>
        
        {/* SCHEDULE POLAROIDS (HORIZONTAL SWIPE) */}
        {schedules.length > 0 ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContainer}
            snapToInterval={width * 0.75 + 16}
            decelerationRate="fast"
          >
            {schedules.map((schedule, i) => {
              const isNext = next?.occurrences.some(o => o.scheduleId === schedule.id);
              const isDone = isSpent(schedule, now);
              
              let statusText = REPEAT_LABEL[schedule.repeat];
              if (!schedule.enabled) statusText = 'Paused';
              else if (isNext) statusText = `Upcoming (${countdown(next!.at, now)})`;
              else if (isDone) statusText = 'Done for today';

              const timeStr = clockFor(schedule.timeOfDay);
              const splitTime = timeStr.split(' ');
              const num = splitTime[0];
              const ampm = splitTime.length > 1 ? splitTime[1] : '';

              return (
                <View
                  key={schedule.id}
                  style={[
                    styles.polaroid,
                    { transform: [{ rotate: i % 2 === 0 ? '2deg' : '-2deg' }] },
                    !schedule.enabled && { opacity: 0.6 }
                  ]}>
                  <View style={styles.pin} />
                  
                  {/* Delete Button */}
                  <Pressable 
                    onPress={() => handleDelete(schedule.id, schedule.deckName)}
                    style={styles.deleteBtn}>
                    <Icon name="trash" size={16} color="#FFFFFF" fill="#E57373" strokeWidth={2.5} />
                  </Pressable>
                  
                  <View style={[styles.photoArea, isNext ? { backgroundColor: '#FBD5CC' } : (isDone ? { backgroundColor: '#E2E5E0' } : { backgroundColor: '#DDF3DC' })]}>
                    <View style={styles.photoTimeRow}>
                      <Text style={styles.photoTimeNum}>{num}</Text>
                      {ampm ? <Text style={styles.photoTimeAmPm}>{ampm}</Text> : null}
                    </View>
                    {isNext ? (
                       <ChunkyButton 
                         label="Start Quiz" 
                         size="sm" 
                         variant="primary" 
                         style={{ position: 'absolute', bottom: 10, alignSelf: 'center' }}
                         onPress={() => router.push({ pathname: '/quiz/[deckId]', params: { deckId: next!.occurrences[0].deckId } })} 
                       />
                    ) : null}
                  </View>
                  
                  <View style={styles.photoBot}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.photoDeck, isDone && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{schedule.deckName}</Text>
                      <Text style={styles.photoStatus}>{statusText}</Text>
                    </View>
                    <DerpToggle label="Toggle plan" value={schedule.enabled} onChange={(val) => void toggle(schedule.id, val)} />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {/* EMPTY STATE */}
        {schedules.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon name="dice" size={48} color={colors.ink} fill={colors.bg} />
            </View>
            <Text style={styles.emptyTitle}>Nothing planned yet!</Text>
            <Text style={styles.emptySub}>A blank canvas. Schedule a quiz to build a habit.</Text>
          </View>
        ) : !schedules.some(s => s.enabled) ? (

          <View style={styles.endHint}>
            <View style={styles.endIconWrap}>
              <Icon name="check" size={20} color={colors.ink} />
            </View>
            <Text style={styles.endText}>Nothing else planned today!</Text>
          </View>
        ) : null}

        {/* ACTION BUTTONS (NO LONGER ABSOLUTE - NO OVERLAP) */}
        <View style={styles.bottomBar}>
          <Pressable onPress={() => setTuning(true)} style={({ pressed }) => [styles.remindersBtn, pressed && { opacity: 0.8 }]}>
            <Icon name="bell" size={24} color="#1A211C" />
          </Pressable>
          
          <Pressable onPress={() => setPlanning(true)} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}>
            <Text style={styles.addBtnText}>+ Add a Plan</Text>
          </Pressable>
        </View>

      </ScrollView>

      {/* MODALS */}
      <ConfirmModal visible={clashDraft != null} title="Same time slot" message={clashDraft ? `You already have ${clashDraft.withName} around ${clockFor(clashDraft.draft.timeOfDay)}. They'll run together as one session, with a single reminder.` : undefined} confirmLabel="Add it" onCancel={() => setClashDraft(null)} onConfirm={() => { const draft = clashDraft?.draft; setClashDraft(null); if (draft) void saveDraft(draft); }} />
      <ConfirmModal visible={notice != null} title={notice?.title ?? ''} message={notice?.message} confirmLabel="Got it" onCancel={() => setNotice(null)} />
      <ConfirmModal visible={deleting != null} title="Delete this plan?" message={deleting ? `${deleting.name} will stop reminding you.` : undefined} confirmLabel="Delete" cancelLabel="Keep" destructive onCancel={() => setDeleting(null)} onConfirm={() => { const id = deleting?.id; setDeleting(null); if (id != null) void remove(id); }} />
      <PlanQuizSheet visible={planning} subjects={subjects} onCancel={() => setPlanning(false)} onSave={(draft) => void handleSave(draft)} />

      <Modal visible={tuning} animationType="slide" transparent onRequestClose={() => setTuning(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTuning(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Remind me</Text>
            {capability === 'denied' ? <ChunkyButton label="Turn on notifications" size="lg" onPress={() => void askPermission()} style={styles.permBtn} /> : null}
            <View style={styles.leadChips}>
              {AVAILABLE_LEADS.map((lead) => {
                const active = leads.includes(lead);
                return (
                  <Pressable key={lead} onPress={() => toggleLead(lead)} style={[styles.leadChip, active && styles.leadChipActive]}>
                    <Text style={[styles.leadText, active && styles.leadTextActive]}>{LEAD_LABEL[lead]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sheetNote}>Quizzes planned for the same time share one reminder. Short lead times are approximate.</Text>
            <ChunkyButton label="Done" size="lg" onPress={() => setTuning(false)} style={styles.doneBtn} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingTop: 10 },
  
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  magnetTitle: {
    backgroundColor: '#DBEEFB',
    borderWidth: 2,
    borderColor: '#1A211C',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 20,
    transform: [{ rotate: '-1deg' }],
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 0, elevation: 4,
  },
  magnetText: {
    fontFamily: font.hero,
    fontSize: 32,
    color: '#1A211C',
  },

  carouselContainer: {
    paddingHorizontal: 24,
    gap: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },
  polaroid: {
    width: width * 0.75,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 12,
    paddingBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 0, elevation: 8,
  },
  pin: {
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    backgroundColor: '#E57373',
    borderWidth: 2,
    borderColor: '#1A211C',
    borderRadius: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 0, elevation: 4,
    zIndex: 10,
  },
  deleteBtn: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 32,
    height: 32,
    backgroundColor: '#E57373',
    borderWidth: 2,
    borderColor: '#1A211C',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 4,
    zIndex: 12,
  },
  photoArea: {
    height: 120,
    borderWidth: 2,
    borderColor: '#1A211C',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  photoTimeNum: {
    fontFamily: font.hero,
    fontSize: 52,
    color: '#1A211C',
  },
  photoTimeAmPm: {
    fontFamily: font.bodyHeavy,
    fontSize: 18,
    color: '#1A211C',
    marginBottom: 8,
  },
  photoBot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 4,
  },
  photoDeck: {
    fontFamily: font.hero,
    fontSize: 24,
    color: colors.text,
  },
  photoStatus: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.textFaint,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    opacity: 0.8,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: font.hero,
    fontSize: 28,
    color: colors.text,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.textFaint,
    textAlign: 'center',
  },
  endHint: {
    alignItems: 'center',
    marginTop: 10,
    opacity: 0.6,
  },
  endIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  endText: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
  },

  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 40,
    paddingHorizontal: 24,
  },
  remindersBtn: {
    width: 60,
    height: 60,
    backgroundColor: '#FCEBC0',
    borderWidth: 2,
    borderColor: '#1A211C',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 6,
  },
  addBtn: {
    flex: 1,
    height: 60,
    backgroundColor: '#5FD184',
    borderWidth: 2,
    borderColor: '#1A211C',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 6,
  },
  addBtnText: {
    fontFamily: font.hero,
    fontSize: 26,
    color: '#1A211C',
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
  
  backdrop: { flex: 1, backgroundColor: 'rgba(39, 54, 43, 0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 18 },
  sheetTitle: { fontFamily: font.hero, fontSize: 26, lineHeight: 34, color: colors.text, marginBottom: 18 },
  permBtn: { marginBottom: 18 },
  leadChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  leadChip: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: 15, paddingVertical: 9 },
  leadChipActive: { backgroundColor: colors.accent },
  leadText: { fontFamily: font.bodyBold, fontSize: 13, color: colors.textDim },
  leadTextActive: { color: colors.ink },
  sheetNote: { fontFamily: font.body, fontSize: 12.5, lineHeight: 18, color: colors.textFaint, marginTop: 18 },
  doneBtn: { marginTop: 26 },
});
