import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { Tape } from '@/components/notebook';
import { formatClock } from '@/lib/schedule';
import { REPEATS, REPEAT_LABEL, type Deck, type Repeat } from '@/lib/types';
import { colors, derpRadius, font, outline, radius, shadow } from '@/theme/tokens';

export interface PlanDraft {
  deckId: string;
  timeOfDay: number;
  repeat: Repeat;
  startDate: number;
}

interface Props {
  visible: boolean;
  decks: readonly Deck[];
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

export function PlanQuizSheet({ visible, decks, onCancel, onSave }: Props) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState(19 * 60);
  const [repeat, setRepeat] = useState<Repeat>('daily');
  const [picking, setPicking] = useState(false);

  const selected = deckId ?? decks[0]?.id ?? null;

  // A plain Date carrying the chosen wall-clock time, for the OS picker.
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

  const preview = formatClock(timeValue.getTime());

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Tape />
          <Text style={styles.title}>Plan a quiz</Text>

          {decks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Icon name="sprout" size={24} color={colors.ink} fill={colors.accentWash} />
              <Text style={styles.emptyText}>
                Add some notes or download a trivia deck first — then you can plan it.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>WHICH DECK</Text>
              <ScrollView style={styles.deckList} showsVerticalScrollIndicator={false}>
                {decks.map((deck) => {
                  const active = deck.id === selected;
                  return (
                    <Pressable
                      key={deck.id}
                      onPress={() => setDeckId(deck.id)}
                      style={[styles.deckRow, active && styles.deckRowActive]}>
                      <Icon
                        name={deck.source === 'notes' ? 'book' : 'dice'}
                        size={18}
                        color={colors.ink}
                        fill={active ? colors.accent : colors.surface2}
                        strokeWidth={1.9}
                      />
                      <Text style={styles.deckName} numberOfLines={1}>
                        {deck.name}
                      </Text>
                      {active ? (
                        <Icon name="check" size={15} color={colors.accentDeep} strokeWidth={2.6} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>WHAT TIME</Text>
              <Pressable onPress={() => setPicking(true)} style={styles.timeRow}>
                <Icon name="clock" size={20} color={colors.ink} fill={colors.goldWash} />
                <Text style={styles.timeText}>{preview}</Text>
                <Text style={styles.timeHint}>tap to change</Text>
              </Pressable>

              {picking ? (
                <DateTimePicker
                  value={timeValue}
                  mode="time"
                  onChange={handleTimeChange}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                />
              ) : null}

              <Text style={styles.label}>HOW OFTEN</Text>
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
            </>
          )}

          <View style={styles.actions}>
            <ChunkyButton label="Cancel" variant="paper" size="md" onPress={onCancel} />
            <ChunkyButton
              label="Save plan"
              icon="check"
              size="md"
              disabled={!selected}
              onPress={handleSave}
              style={styles.saveBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.edge,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 26,
    gap: 8,
    maxHeight: '88%',
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
  },
  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.textFaint,
    marginTop: 10,
  },
  deckList: {
    maxHeight: 168,
    flexGrow: 0,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 7,
  },
  deckRowActive: {
    backgroundColor: colors.accentWash,
  },
  deckName: {
    flex: 1,
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadow.card,
  },
  timeText: {
    flex: 1,
    fontFamily: font.hero,
    fontSize: 24,
    color: colors.text,
  },
  timeHint: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: colors.accent,
    ...shadow.card,
  },
  chipText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12.5,
    color: colors.textDim,
  },
  chipTextActive: {
    color: colors.ink,
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    padding: 16,
    marginTop: 12,
  },
  emptyText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 13.5,
    lineHeight: 18,
    color: colors.textDim,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  saveBtn: {
    flex: 1,
  },
});
