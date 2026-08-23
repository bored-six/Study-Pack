import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { formatClock } from '@/lib/schedule';
import { REPEATS, REPEAT_LABEL, type Deck, type Repeat } from '@/lib/types';
import { colors, font, radius } from '@/theme/tokens';

export interface PlanDraft {
  deckId: string;
  timeOfDay: number;
  repeat: Repeat;
  startDate: number;
}

interface Props {
  visible: boolean;
  /** The student's own subjects — the only thing worth planning. */
  subjects: readonly Deck[];
  onCancel: () => void;
  onSave: (draft: PlanDraft) => void;
}

function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Rolls to tomorrow when the chosen time has already gone by today. */
function firstDateFor(timeOfDay: number, now: number): number {
  const today = startOfDay(now);
  return today + timeOfDay * 60_000 <= now ? today + 86_400_000 : today;
}

export function PlanQuizSheet({ visible, subjects, onCancel, onSave }: Props) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState(19 * 60);
  const [repeat, setRepeat] = useState<Repeat>('daily');
  const [picking, setPicking] = useState(false);

  const selected = deckId ?? subjects[0]?.id ?? null;

  const timeValue = useMemo(() => {
    const d = new Date();
    d.setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0, 0);
    return d;
  }, [timeOfDay]);

  const handleTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setPicking(false);
    if (event.type === 'dismissed' || !date) return;
    setTimeOfDay(date.getHours() * 60 + date.getMinutes());
  };

  const handleSave = () => {
    if (!selected) return;
    const now = Date.now();
    onSave({
      deckId: selected,
      timeOfDay,
      repeat,
      startDate: repeat === 'once' ? firstDateFor(timeOfDay, now) : startOfDay(now),
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />

          {subjects.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No subjects yet</Text>
              <Text style={styles.emptyBody}>
                Add your notes first — then you can plan when to study them.
              </Text>
              <ChunkyButton label="Got it" size="lg" onPress={onCancel} style={styles.fullBtn} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Subject</Text>
              {subjects.map((subject) => {
                const active = subject.id === selected;
                return (
                  <Pressable
                    key={subject.id}
                    onPress={() => setDeckId(subject.id)}
                    style={styles.subjectRow}>
                    <Text style={[styles.subjectName, active && styles.subjectNameActive]}>
                      {subject.name}
                    </Text>
                    {active ? (
                      <Icon name="check" size={17} color={colors.accentDeep} strokeWidth={2.6} />
                    ) : null}
                  </Pressable>
                );
              })}

              <Text style={styles.label}>Time</Text>
              <Pressable onPress={() => setPicking(true)} style={styles.timeRow}>
                <Text style={styles.timeText}>{formatClock(timeValue.getTime())}</Text>
                <Text style={styles.timeHint}>change</Text>
              </Pressable>

              {picking ? (
                <DateTimePicker
                  value={timeValue}
                  mode="time"
                  onChange={handleTimeChange}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                />
              ) : null}

              <Text style={styles.label}>Repeat</Text>
              <View style={styles.chips}>
                {REPEATS.map((option) => {
                  const active = option === repeat;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setRepeat(option)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {REPEAT_LABEL[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <ChunkyButton
                label="Save plan"
                size="lg"
                onPress={handleSave}
                style={styles.fullBtn}
              />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 18,
  },
  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 26,
    marginBottom: 6,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  subjectName: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.textDim,
  },
  subjectNameActive: {
    fontFamily: font.hero,
    fontSize: 20,
    color: colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timeText: {
    fontFamily: font.hero,
    fontSize: 44,
    lineHeight: 54,
    color: colors.text,
  },
  timeHint: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.accentDeep,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: colors.surface2,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontFamily: font.bodyBold,
    fontSize: 13.5,
    color: colors.textDim,
  },
  chipTextActive: {
    color: colors.ink,
  },
  fullBtn: {
    marginTop: 32,
  },
  empty: {
    paddingVertical: 12,
  },
  emptyTitle: {
    fontFamily: font.hero,
    fontSize: 24,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.textDim,
    marginTop: 6,
  },
});
