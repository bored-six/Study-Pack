import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { formatClock } from '@/lib/schedule';
import { REPEATS, REPEAT_LABEL, type Deck, type Repeat } from '@/lib/types';
import { font, radius, getColors, useThemeStore } from '@/theme/tokens';

export interface PlanDraft {
  deckId: string;
  timeOfDay: number;
  repeat: Repeat;
  startDate: number;
}

interface Props {
  visible: boolean;
  subjects: readonly Deck[];
  onCancel: () => void;
  onSave: (draft: PlanDraft) => void;
}

function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function firstDateFor(timeOfDay: number, now: number): number {
  const today = startOfDay(now);
  return today + timeOfDay * 60_000 <= now ? today + 86_400_000 : today;
}

export function PlanQuizSheet({ visible, subjects, onCancel, onSave }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              
              <Text style={styles.sectionTitle}>1. Pick a subject</Text>
              <View style={styles.chipRow}>
                {subjects.map((subject) => {
                  const active = subject.id === selected;
                  return (
                    <Pressable
                      key={subject.id}
                      onPress={() => setDeckId(subject.id)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {subject.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>2. Pick a time</Text>
              <Pressable onPress={() => setPicking(true)} style={styles.timeBox}>
                <View style={styles.timeBoxInner}>
                  <Text style={styles.timeText}>{formatClock(timeValue.getTime())}</Text>
                  <Icon name="pencil" size={20} color={colors.ink} />
                </View>
              </Pressable>

              {picking ? (
                <DateTimePicker
                  value={timeValue}
                  mode="time"
                  onChange={handleTimeChange}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                />
              ) : null}

              <Text style={styles.sectionTitle}>3. How often?</Text>
              <View style={styles.chipRow}>
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

const getStyles = (colors: any) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 33, 28, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderColor: '#1A211C',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  grabber: {
    alignSelf: 'center',
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A211C',
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: font.hero,
    fontSize: 22,
    color: colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 0, elevation: 2,
  },
  chipActive: {
    backgroundColor: '#DDF3DC',
    borderColor: '#1A211C',
    transform: [{ rotate: '-2deg' }],
  },
  chipText: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  chipTextActive: {
    color: '#1A211C',
  },
  timeBox: {
    backgroundColor: '#FCEBC0',
    borderWidth: 3,
    borderColor: '#1A211C',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '1deg' }],
  },
  timeBoxInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeText: {
    fontFamily: font.hero,
    fontSize: 48,
    color: '#1A211C',
  },
  fullBtn: {
    marginTop: 40,
  },
  empty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: font.hero,
    fontSize: 28,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: font.bodyBold,
    fontSize: 16,
    color: colors.textFaint,
    marginTop: 10,
    textAlign: 'center',
  },
});
