import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { DerpArrow, DerpCheck, DerpMinus, DerpPlus, DerpScribbleLine } from '@/components/DerpIcons';
import { Icon } from '@/components/Icon';
import { FORMAT_HOWTO, FORMAT_LABEL, FORMAT_ORDER, type ExamFormat } from '@/lib/exam';
import { MODE_ORDER, MODES, type ExamMode, type ModeSpec } from '@/lib/mode';
import { useExamStore } from '@/store/exam';
import { colors, derpRadius, font, outline, radius, shadow } from '@/theme/tokens';

/** A drill sent here by the results note asks for this many of one format. */
const DRILL_COUNT = 12;

/** The − and + nudge by one; the field itself is there for a real jump. */
const STEP = 1;

/** One question type, as a sticker you tick. */
function FormatChip({
  format,
  max,
  on,
  onPress,
  index,
}: {
  format: ExamFormat;
  max: number;
  on: boolean;
  onPress: () => void;
  index: number;
}) {
  const off = max === 0;
  return (
    <Pressable
      disabled={off}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: off }}
      style={({ pressed }) => [
        styles.chip,
        { transform: [{ rotate: index % 2 === 0 ? '-2.5deg' : '1.5deg' }] },
        on && styles.chipOn,
        off && styles.chipOff,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.tape, { transform: [{ rotate: index % 2 === 0 ? '-4deg' : '2deg' }] }]} />
      <View style={styles.tickboxContainer}>
        <DerpCheck checked={on} style={styles.derpCheckSvg} />
      </View>
      <Text
        style={[styles.chipName, on && styles.chipNameOn, off && styles.chipTextOff]}
        numberOfLines={2}>
        {FORMAT_LABEL[format]}
      </Text>
      <Text style={[styles.chipRoom, off && styles.chipTextOff]}>
        {off ? 'not in these notes' : `${max} ready`}
      </Text>
    </Pressable>
  );
}

/** How many of one ticked format, set exactly. */
function AmountRow({
  format,
  count,
  max,
  onChange,
  index,
}: {
  format: ExamFormat;
  count: number;
  max: number;
  onChange: (next: number) => void;
  index: number;
}) {
  const [draft, setDraft] = useState(String(count));

  // Keep the field in step when − + or Max changes the number underneath it.
  useEffect(() => {
    setDraft(String(count));
  }, [count]);

  const commit = () => {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
  };

  return (
    <View style={[styles.amountRow, { transform: [{ rotate: index % 2 === 0 ? '0.5deg' : '-0.5deg' }] }]}>
      <View style={[styles.tape, { left: -10, top: '50%', marginTop: -8, width: 30, transform: [{ rotate: '85deg' }] }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{FORMAT_LABEL[format]}</Text>
        <Text style={styles.rowHow} numberOfLines={2}>
          {FORMAT_HOWTO[format]}
        </Text>
        <Pressable
          onPress={() => onChange(max)}
          hitSlop={6}
          style={({ pressed }) => [styles.maxBtn, pressed && styles.pressed]}>
          <Text style={styles.maxText}>Max {max}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => onChange(count - STEP)}
        disabled={count <= 1}
        hitSlop={6}
        accessibilityLabel={`Fewer ${FORMAT_LABEL[format]}`}
        style={({ pressed }) => [
          styles.stepBtn,
          count <= 1 && styles.stepBtnOff,
          pressed && styles.pressed,
        ]}>
        <View style={{ opacity: count <= 1 ? 0.3 : 1 }}>
          <DerpMinus width={42} height={42} />
        </View>
      </Pressable>

      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={3}
        accessibilityLabel={`How many ${FORMAT_LABEL[format]}`}
        style={styles.countInput}
      />

      <Pressable
        onPress={() => onChange(count + STEP)}
        disabled={count >= max}
        hitSlop={6}
        accessibilityLabel={`More ${FORMAT_LABEL[format]}`}
        style={({ pressed }) => [
          styles.stepBtn,
          count >= max && styles.stepBtnOff,
          pressed && styles.pressed,
        ]}>
        <View style={{ opacity: count >= max ? 0.3 : 1 }}>
          <DerpPlus width={42} height={42} />
        </View>
      </Pressable>
    </View>
  );
}

/** One way of sitting the exam, as a sticker card. */
function ModeCard({
  spec,
  detail,
  last,
  onPress,
}: {
  spec: ModeSpec;
  detail?: string;
  /** The mode this subject was last sat in. */
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.modeCard, pressed && styles.pressed]}>
      <View style={[styles.modeBadge, { backgroundColor: spec.wash }]}>
        <Icon name={spec.icon} size={24} color={spec.ink} fill={spec.wash} strokeWidth={1.9} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.modeNameRow}>
          <Text style={styles.modeName}>{spec.name}</Text>
          {last ? (
            <View style={styles.lastPill}>
              <Text style={styles.lastText}>LAST TIME</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowHow}>{spec.tagline}</Text>
        {detail ? <Text style={[styles.modeDetail, { color: spec.ink }]}>{detail}</Text> : null}
      </View>
      <Text style={styles.modeArrow}>›</Text>
    </Pressable>
  );
}

export default function ExamSetupScreen() {
  const insets = useSafeAreaInsets();
  // `mode` and `format` are how the results note hands a student straight to
  // the thing it just told them to do, without making them find it again.
  const { deckId, mode: wantMode, format: wantFormat } = useLocalSearchParams<{
    deckId: string;
    mode?: string;
    format?: string;
  }>();
  const {
    status,
    deck,
    available,
    counts,
    picks,
    mode,
    lastMode,
    error,
    load,
    setMode,
    toggleFormat,
    setCount,
    evenSplit,
    setOnly,
    total,
    start,
  } = useExamStore();

  /** Mode first, then the paper itself. */
  const [step, setStep] = useState<'mode' | 'counts'>('mode');

  useEffect(() => {
    if (deckId) {
      setStep('mode');
      void load(deckId);
    }
  }, [deckId, load]);

  const begin = () => {
    start();
    if (useExamStore.getState().status === 'active') router.push('/exam/run');
  };

  // Apply an incoming request once the subject is loaded, and only once —
  // after that the screen belongs to whatever the student does with it.
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const key = `${deckId}:${wantMode}:${wantFormat}`;
    if (status !== 'setup' || !wantMode || applied.current === key) return;
    applied.current = key;

    const wanted = MODE_ORDER.find((id) => id === wantMode);
    if (!wanted) return;
    setMode(wanted);

    const drill = FORMAT_ORDER.find((format) => format === wantFormat);
    if (drill) setOnly(drill, DRILL_COUNT);

    // A mode that picks its own questions has nothing left to ask.
    if (!MODES[wanted].autoBuild) {
      setStep('counts');
      return;
    }
    start();
    if (useExamStore.getState().status === 'active') router.push('/exam/run');
  }, [status, deckId, wantMode, wantFormat, setMode, setOnly, start]);

  const chooseMode = (id: ExamMode) => {
    setMode(id);
    if (MODES[id].autoBuild) begin();
    else setStep('counts');
  };

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
          <Text style={styles.errorTitle}>Can’t start an exam</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <ChunkyButton label="Back" size="md" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (step === 'mode') {
    const detail: Partial<Record<ExamMode, string>> = {
      mastery: 'Ends when the pile is empty',
      rapid: 'Seconds per question',
      simulation: 'Flag, revisit, submit',
      survival: 'Endless · three lives',
    };

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
            <Text style={styles.title}>How do you want to sit it?</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {deck?.name} · {deck?.questionCount} questions
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {MODE_ORDER.map((id) => (
            <ModeCard
              key={id}
              spec={MODES[id]}
              detail={detail[id]}
              last={id === lastMode}
              onPress={() => chooseMode(id)}
            />
          ))}

          <View style={styles.note}>
            <Icon name="bulb" size={16} color={colors.gold} strokeWidth={2.2} />
            <Text style={styles.noteText}>
              The mode sets the clock, whether you’re told you’re right straight away, and
              whether a question can come back. The questions themselves are the same.
            </Text>
          </View>
        </ScrollView>
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
          onPress={() => setStep('mode')}
          hitSlop={10}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <DerpArrow width={24} height={24} />
        </Pressable>
        <View style={styles.headText}>
          <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
            <Text style={[styles.title, { transform: [{ rotate: '-1.5deg' }] }]}>Build your exam!</Text>
            <View style={styles.scribbleLine}>
              <DerpScribbleLine width="120%" height="15" />
            </View>
          </View>
          <Text style={[styles.sub, { transform: [{ rotate: '1deg' }], marginTop: 6 }]} numberOfLines={1}>
            {MODES[mode].name} · {deck?.name}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>WHICH TYPES?</Text>
        <View style={styles.grid}>
          {FORMAT_ORDER.map((format, i) => (
            <FormatChip
              key={format}
              index={i}
              format={format}
              max={available[format]}
              on={picks.includes(format)}
              onPress={() => toggleFormat(format)}
            />
          ))}
        </View>

        {picks.length > 0 ? (
          <>
            <Text style={styles.kicker}>HOW MANY OF EACH?</Text>
            {picks.map((format, i) => (
              <AmountRow
                key={format}
                index={i}
                format={format}
                count={counts[format]}
                max={available[format]}
                onChange={(next) => setCount(format, next)}
              />
            ))}
            {picks.length > 1 ? (
              <Pressable
                onPress={evenSplit}
                hitSlop={8}
                style={({ pressed }) => [styles.switcher, pressed && styles.pressed]}>
                <Text style={styles.switcherText}>Even them out</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

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
          label={picked === 0 ? 'Pick a type' : 'Start exam'}
          icon="play"
          size="lg"
          disabled={picked === 0}
          onPress={begin}
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
  scribbleLine: {
    position: 'absolute',
    bottom: -6,
    left: -4,
    transform: [{ rotate: '-2deg' }],
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
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
    marginTop: 2,
    marginLeft: 2,
  },

  // --- type chips -------------------------------------------------------
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 2,
    ...shadow.card,
  },
  chipOn: {
    backgroundColor: colors.accentWash,
    borderColor: colors.accentEdge,
  },
  chipOff: {
    backgroundColor: colors.surface2,
    opacity: 0.7,
  },
  tape: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 40,
    height: 16,
    backgroundColor: 'rgba(239, 229, 203, 0.85)',
    zIndex: 10,
    ...derpRadius,
  },
  tickboxContainer: {
    width: 28,
    height: 28,
    marginBottom: 6,
    position: 'relative',
  },
  derpCheckSvg: {
    width: 42,
    height: 42,
    position: 'absolute',
    top: -7,
    left: -7,
  },
  chipName: {
    fontFamily: font.heading,
    fontSize: 14.5,
    lineHeight: 18,
    color: colors.textDim,
  },
  chipNameOn: {
    color: colors.text,
  },
  chipRoom: {
    fontFamily: font.bodySemibold,
    fontSize: 11,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  chipTextOff: {
    color: colors.disabledText,
  },

  // --- how many of each -------------------------------------------------
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...shadow.card,
  },
  stepBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: {
  },
  stepGlyph: {
    fontFamily: font.heading,
    fontSize: 23,
    lineHeight: 28,
    color: colors.accentDeep,
  },
  stepGlyphOff: {
    color: colors.disabledText,
  },
  switcher: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  switcherText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.textDim,
  },

  // --- the amount itself ------------------------------------------------
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.text,
  },
  rowHow: {
    fontFamily: font.body,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: colors.textDim,
    marginTop: 1,
  },
  countInput: {
    width: 54,
    borderBottomWidth: 3,
    borderBottomColor: colors.ink,
    paddingVertical: 7,
    textAlign: 'center',
    fontFamily: font.hero,
    fontSize: 26,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    transform: [{ rotate: '-3deg' }],
  },
  maxBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 3,
  },
  maxText: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    color: colors.accentDeep,
    fontVariant: ['tabular-nums'],
  },

  // --- modes ------------------------------------------------------------
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 13,
    ...shadow.card,
  },
  modeBadge: {
    width: 48,
    height: 48,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  modeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modeName: {
    fontFamily: font.heading,
    fontSize: 16.5,
    color: colors.text,
  },
  lastPill: {
    backgroundColor: colors.goldWash,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  lastText: {
    fontFamily: font.bodyHeavy,
    fontSize: 8.5,
    letterSpacing: 0.8,
    color: colors.gold,
  },
  modeDetail: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 3,
  },
  modeArrow: {
    fontFamily: font.heading,
    fontSize: 22,
    color: colors.textFaint,
    paddingRight: 4,
  },

  // --- footer -----------------------------------------------------------
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
  longNote: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.gold,
    textAlign: 'center',
    marginTop: -4,
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
