import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { FORMAT_HOWTO, FORMAT_LABEL, type ExamFormat } from '@/lib/exam';
import { useExamStore } from '@/store/exam';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

/** Order shown to the student — familiar formats first. */
const ORDER: ExamFormat[] = [
  'multiple_choice',
  'true_false',
  'modified_true_false',
  'identification',
  'fill_blank',
  'matching',
  'enumeration',
];

function FormatRow({
  format,
  count,
  max,
  onChange,
}: {
  format: ExamFormat;
  count: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const disabled = max === 0;
  const [draft, setDraft] = useState(String(count));

  // Keep the field in step when Max or another control changes the number.
  useEffect(() => {
    setDraft(String(count));
  }, [count]);

  const commit = () => {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
  };

  return (
    <View style={[styles.row, disabled && styles.rowOff]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, disabled && styles.rowTitleOff]}>
          {FORMAT_LABEL[format]}
        </Text>
        <Text style={styles.rowHow}>
          {disabled ? 'Not possible with these notes' : FORMAT_HOWTO[format]}
        </Text>
      </View>

      {disabled ? (
        <Text style={styles.none}>—</Text>
      ) : (
        <View style={styles.control}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="number-pad"
            returnKeyType="done"
            selectTextOnFocus
            maxLength={3}
            style={[styles.countInput, count > 0 && styles.countInputOn]}
          />
          <Pressable
            onPress={() => onChange(max)}
            hitSlop={6}
            style={({ pressed }) => [styles.maxBtn, pressed && styles.pressed]}>
            <Text style={styles.maxText}>Max {max}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ExamSetupScreen() {
  const insets = useSafeAreaInsets();
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { status, deck, available, counts, error, load, setCount, total, start } = useExamStore();

  useEffect(() => {
    if (deckId) void load(deckId);
  }, [deckId, load]);

  if (status === 'loading' || status === 'idle') {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.accentDeep} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.screen, styles.center, { padding: 24 }]}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Can't start an exam</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <ChunkyButton label="Back" size="md" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const picked = total();
  // Roughly half a minute per question — enough to set expectations.
  const minutes = Math.round(picked * 0.5);
  const longExam = picked > 40;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.navRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headText}>
          <Text style={styles.title}>Build your exam</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {deck?.name} · {deck?.questionCount} questions
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {ORDER.map((format) => (
          <FormatRow
            key={format}
            format={format}
            count={counts[format]}
            max={available[format]}
            onChange={(next) => setCount(format, next)}
          />
        ))}

        <View style={styles.note}>
          <Icon name="bulb" size={16} color={colors.gold} strokeWidth={2.2} />
          <Text style={styles.noteText}>
            A question can show up in more than one format — the same fact as multiple choice
            and again as true or false. Types are mixed and the order shuffled.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.total}>
          {picked} question{picked === 1 ? '' : 's'}
          {minutes > 0 ? ` · about ${minutes} min` : ''}
        </Text>
        {longExam ? (
          <Text style={styles.longNote}>That’s a big sitting — you can always do less.</Text>
        ) : null}
        <ChunkyButton
          label={picked === 0 ? 'Pick at least one' : 'Start exam'}
          icon="play"
          size="lg"
          disabled={picked === 0}
          onPress={() => {
            start();
            router.push('/exam/run');
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backArrow: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 24,
    color: colors.ink,
  },
  headText: {
    flex: 1,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 32,
    color: colors.text,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
  },
  list: {
    gap: 10,
    paddingBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 13,
    ...shadow.card,
  },
  rowOff: {
    backgroundColor: colors.surface2,
    opacity: 0.75,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
  },
  rowTitleOff: {
    color: colors.textFaint,
  },
  rowHow: {
    fontFamily: font.body,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: colors.textDim,
    marginTop: 1,
  },
  control: {
    alignItems: 'center',
    gap: 5,
  },
  countInput: {
    width: 56,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    paddingVertical: 8,
    textAlign: 'center',
    fontFamily: font.hero,
    fontSize: 19,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  countInputOn: {
    backgroundColor: colors.accentWash,
    borderColor: colors.ink,
    color: colors.text,
  },
  maxBtn: {
    backgroundColor: colors.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  maxText: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    color: colors.accentDeep,
    fontVariant: ['tabular-nums'],
  },
  longNote: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.gold,
    textAlign: 'center',
    marginTop: -4,
  },
  none: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.textFaint,
    paddingHorizontal: 12,
  },
  note: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    padding: 12,
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.gold,
  },
  footer: {
    paddingTop: 10,
    gap: 8,
  },
  total: {
    fontFamily: font.bodyHeavy,
    fontSize: 12.5,
    color: colors.textDim,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 22,
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
  },
  errorTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    color: colors.text,
  },
  errorBody: {
    fontFamily: font.body,
    fontSize: 13.5,
    color: colors.textDim,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
