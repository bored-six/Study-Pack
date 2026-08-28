import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { DerpCheck, DerpMinus, DerpPlus } from '@/components/DerpIcons';
import { Icon } from '@/components/Icon';
import { ModeCrest, dialsOf } from '@/components/ModeCrest';
import { FORMAT_HOWTO, FORMAT_LABEL, FORMAT_ORDER, type ExamFormat } from '@/lib/exam';
import { estimateLabel, MODE_ORDER, MODES, type ExamMode, type ModeSpec } from '@/lib/mode';
import { playSfx } from '@/lib/sfx';
import { useExamStore } from '@/store/exam';
import { derpRadius, font, getColors, onWash, outline, radius, shadow, useThemeStore } from '@/theme/tokens';

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
  spec,
}: {
  format: ExamFormat;
  max: number;
  on: boolean;
  onPress: () => void;
  index: number;
  /** A ticked chip wears the mode's colour, not a fixed green. */
  spec: ModeSpec;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const off = max === 0;

  const scale = useSharedValue(1);
  const baseRot = index % 2 === 0 ? -2.5 : 1.5;
  const iconScale = useSharedValue(1);

  useEffect(() => {
    iconScale.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1500 }),
          withTiming(1, { duration: 1500 })
        ),
        -1,
        true
      )
    );
  }, [index, iconScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${baseRot}deg` }],
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: on ? iconScale.value : 1 }],
  }));

  const handlePress = () => {
    if (off) return;
    playSfx('derp_pop');
    scale.value = withSequence(withSpring(1.08), withSpring(1));
    onPress();
  };

  return (
    <Animated.View style={[animatedStyle, { width: '48%' }]}>
      <Pressable
        disabled={off}
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled: off }}
        style={({ pressed }) => [
          styles.chip,
          on && { backgroundColor: spec.wash, borderColor: spec.edge },
          off && styles.chipOff,
          pressed && styles.pressed,
        ]}>
        <View style={[styles.tape, { transform: [{ rotate: index % 2 === 0 ? '-4deg' : '2deg' }] }]} />
        <View style={styles.tickboxContainer}>
          <Animated.View style={animatedIconStyle}>
            <DerpCheck checked={on} style={styles.derpCheckSvg} />
          </Animated.View>
        </View>
        <Text
          style={[
            styles.chipName,
            on && styles.chipNameOn,
            off && styles.chipTextOff,
          ]}
          numberOfLines={2}>
          {FORMAT_LABEL[format]}
        </Text>
        <Text style={[styles.chipRoom, on && styles.chipRoomOn, off && styles.chipTextOff]}>
          {off ? 'not in these notes' : `${max} ready`}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function StepBtn({
  delta,
  count,
  max,
  onPress,
  label,
  children,
}: {
  delta: number;
  count: number;
  max: number;
  onPress: (delta: number) => void;
  /** Hand-drawn glyphs carry no text, so the button says what it does. */
  label: string;
  children: React.ReactNode;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const scale = useSharedValue(1);
  const iconScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const animatedIconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const disabled = delta > 0 ? count >= max : count <= 1;

  useEffect(() => {
    iconScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500 }),
        withTiming(1, { duration: 1500 })
      ),
      -1,
      true
    );
  }, [iconScale]);

  const handlePress = () => {
    if (disabled) return;
    scale.value = withSequence(withSpring(0.85), withSpring(1));
    onPress(delta);
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.stepBtn,
          disabled && styles.stepBtnOff,
          pressed && styles.pressed,
        ]}>
        <Animated.View style={[{ opacity: disabled ? 0.3 : 1 }, animatedIconStyle]}>{children}</Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** How many of one ticked format, set exactly. */
function AmountRow({
  format,
  count,
  max,
  onChange,
  index,
  spec,
}: {
  format: ExamFormat;
  count: number;
  max: number;
  onChange: (next: number) => void;
  index: number;
  spec: ModeSpec;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const [draft, setDraft] = useState(String(count));
  const baseRot = index % 2 === 0 ? 0.5 : -0.5;
  const numScale = useSharedValue(1);

  // Keep the field in step when − + or Max changes the number underneath it.
  useEffect(() => {
    setDraft(String(count));
    numScale.value = withSequence(withSpring(1.3), withSpring(1));
  }, [count, numScale]);

  const commit = () => {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
  };

  const animatedNumStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numScale.value }, { rotate: '-3deg' }],
  }));

  const handleMax = () => {
    playSfx('derp_boing');
    onChange(max);
  };

  const handleStep = (delta: number) => {
    playSfx('tap');
    onChange(count + delta);
  };

  return (
    <View style={[styles.amountRow, { transform: [{ rotate: `${baseRot}deg` }] }]}>
      <View style={[styles.tape, { left: -10, top: '50%', marginTop: -8, width: 30, transform: [{ rotate: '85deg' }] }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{FORMAT_LABEL[format]}</Text>
        <Text style={styles.rowHow} numberOfLines={2}>
          {FORMAT_HOWTO[format]}
        </Text>
        <Pressable
          onPress={handleMax}
          hitSlop={6}
          accessibilityLabel={`All ${max} ${FORMAT_LABEL[format]}`}
          style={({ pressed }) => [
            styles.maxBtn,
            { backgroundColor: spec.wash },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.maxText, { color: spec.ink }]}>Max {max}</Text>
        </Pressable>
      </View>

      <StepBtn
        delta={-STEP}
        count={count}
        max={max}
        onPress={handleStep}
        label={`Fewer ${FORMAT_LABEL[format]}`}>
        <DerpMinus width={42} height={42} />
      </StepBtn>

      <Animated.View style={animatedNumStyle}>
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
          style={[styles.countInput, { transform: [] }]}
        />
      </Animated.View>

      <StepBtn
        delta={STEP}
        count={count}
        max={max}
        onPress={handleStep}
        label={`More ${FORMAT_LABEL[format]}`}>
        <DerpPlus width={42} height={42} />
      </StepBtn>
    </View>
  );
}

/**
 * A mode as a game cartridge.
 *
 * The grid shows all five at once and the three dials as small stamps,
 * so two modes can be told apart without reading either tagline. Tapping
 * one opens the detail sheet rather than starting immediately — the
 * sheet is where the dials are spelled out in words.
 */
function Cartridge({
  spec,
  wide,
  last,
  onPress,
}: {
  spec: ModeSpec;
  wide?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const dials = dialsOf(spec);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={spec.name}
      style={({ pressed }) => [styles.cart, wide && styles.cartWide, pressed && styles.pressed]}>
      <View style={styles.cartGrooves} />
      <View style={[styles.cartFace, { backgroundColor: spec.wash }, wide && styles.cartFaceWide]}>
        <Icon name={spec.icon} size={wide ? 26 : 30} color={spec.ink} fill="#FFFFFF" strokeWidth={1.9} />
        <View style={wide ? styles.cartWideText : undefined}>
          <Text style={[styles.cartName, wide && styles.cartNameWide]} numberOfLines={2}>
            {spec.name}
          </Text>
          <Text style={[styles.cartTag, wide && styles.cartTagWide]} numberOfLines={2}>
            {spec.tagline}
          </Text>
        </View>
        <View style={styles.cartDials}>
          {dials.map((d, i) => (
            <View key={i} style={[styles.cartDial, !d.on && styles.cartDialOff]}>
              <Icon name={d.icon} size={12} color={spec.ink} strokeWidth={2} />
            </View>
          ))}
        </View>
      </View>
      {last ? (
        <View style={styles.lastPill}>
          <Text style={styles.lastText}>LAST TIME</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ExamSetupScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

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
  /** The cartridge being inspected, before it is committed to. */
  const [peek, setPeek] = useState<ExamMode | null>(null);

  useEffect(() => {
    if (deckId) {
      setStep('mode');
      setPeek(null);
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
    setPeek(null);
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
    const peeked = peek ? MODES[peek] : null;

    return (
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <View style={styles.contentWrapper}>
        <View style={styles.navRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View style={styles.headText}>
            <Text style={styles.title}>Pick your game</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {deck?.name} · {deck?.questionCount} questions
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.shelf} showsVerticalScrollIndicator={false}>
          <View style={styles.cartGrid}>
            {MODE_ORDER.map((id, i) => (
              <Cartridge
                key={id}
                spec={MODES[id]}
                // an odd count leaves the last one room to breathe
                wide={i === MODE_ORDER.length - 1 && MODE_ORDER.length % 2 === 1}
                last={id === lastMode}
                onPress={() => {
                  playSfx('cartridge_click');
                  setPeek(id);
                }}
              />
            ))}
          </View>

          <View style={styles.note}>
            <Icon name="bulb" size={16} color={colors.gold} strokeWidth={2.2} />
            <Text style={styles.noteText}>
              The mode sets the clock, whether you’re told you’re right straight away, and
              whether a question can come back. The questions themselves are the same.
            </Text>
          </View>
        </ScrollView>
        </View>

        {/* The detail sits over the shelf rather than replacing it, so
            backing out costs one tap and the other four stay in sight. */}
        <Modal
          visible={peeked != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPeek(null)}>
          <Pressable style={styles.peekBack} onPress={() => setPeek(null)}>
            <Pressable style={styles.peekSheet} onPress={(e) => e.stopPropagation()}>
              {peeked ? (
                <>
                  <View style={[styles.peekFace, { backgroundColor: peeked.wash }]}>
                    <Icon name={peeked.icon} size={44} color={peeked.ink} fill="#FFFFFF" strokeWidth={1.8} />
                    <Text style={styles.peekName}>{peeked.name}</Text>
                    <Text style={styles.peekTag}>{peeked.tagline}</Text>
                  </View>

                  <View style={styles.peekDials}>
                    {dialsOf(peeked).map((d, i) => (
                      <View key={i} style={styles.peekDial}>
                        <Icon
                          name={d.icon}
                          size={17}
                          color={d.on ? peeked.ink : colors.textFaint}
                          strokeWidth={2}
                        />
                        <Text style={styles.peekDialCap}>{d.caption}</Text>
                        <Text style={styles.peekDialVal}>{d.label}</Text>
                      </View>
                    ))}
                  </View>

                  <ChunkyButton
                    label={peeked.autoBuild ? 'Start' : 'Choose questions'}
                    size="lg"
                    onPress={() => chooseMode(peeked.id)}
                    style={styles.peekStart}
                  />
                  <Pressable onPress={() => setPeek(null)} hitSlop={8} style={styles.peekBackBtn}>
                    <Text style={styles.peekBackText}>Pick another</Text>
                  </Pressable>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  const spec = MODES[mode];
  const picked = total();
  // Per mode: a sprint of 20 is not a sitting of 20, and mastery asks each
  // card more than once. Survival returns null — it ends when you do.
  const howLong = estimateLabel(mode, counts);
  const longExam = picked > 40;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.contentWrapper}>
      <View style={styles.navRow}>
        <Pressable
          onPress={() => setStep('mode')}
          hitSlop={10}
          accessibilityLabel="Pick a different mode"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            Build your {spec.unit === 'question' ? 'paper' : spec.units}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {deck?.name}
          </Text>
        </View>
      </View>

      <ModeCrest
        spec={spec}
        size="banner"
        showDials
        detail={spec.tagline}
        style={styles.crestBanner}
      />

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: spec.ink }]}>WHICH TYPES?</Text>
        <View style={styles.grid}>
          {FORMAT_ORDER.map((format, i) => (
            <FormatChip
              key={format}
              index={i}
              format={format}
              max={available[format]}
              on={picks.includes(format)}
              spec={spec}
              onPress={() => toggleFormat(format)}
            />
          ))}
        </View>

        {picks.length > 0 ? (
          <>
            <Text style={[styles.kicker, { color: spec.ink }]}>HOW MANY OF EACH?</Text>
            <Text style={styles.kickerHint}>{spec.countsHint}</Text>
            {picks.map((format, i) => (
              <AmountRow
                key={format}
                index={i}
                format={format}
                count={counts[format]}
                max={available[format]}
                spec={spec}
                onChange={(next) => setCount(format, next)}
              />
            ))}
            {picks.length > 1 ? (
              <Pressable
                onPress={evenSplit}
                hitSlop={8}
                accessibilityLabel="Even them out"
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
            {howLong ? ` · ${howLong}` : ''}
          </Text>
          {spec.repetition === 'until_retired' && picked > 0 ? (
            <Text style={styles.modeNote}>
              Each card comes back until you've had it right twice — the pile decides when
              you're done, not the count.
            </Text>
          ) : null}
          {spec.clock === 'per_question' && picked > 0 ? (
            <Text style={styles.modeNote}>
              Every question has its own countdown. Running out marks it wrong.
            </Text>
          ) : null}
          {spec.feedback === 'deferred' && picked > 0 ? (
            <Text style={styles.modeNote}>
              Nothing is marked until you submit. You can flag questions and come back.
            </Text>
          ) : null}
          {longExam ? (
            <Text style={styles.longNote}>That's a big sitting — you can always do less.</Text>
          ) : null}
          <ChunkyButton
            label={picked === 0 ? 'Pick a type' : spec.verb}
            icon="play"
            size="lg"
            disabled={picked === 0}
            onPress={begin}
          />
        </View>
      </View>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center', // Center content on large screens
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 600, // Constrain width on desktop web
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
    bottom: 0,
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
  kickerHint: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: colors.textDim,
    marginLeft: 2,
    marginTop: -4,
    marginBottom: 2,
  },
  crestBanner: {
    marginBottom: 12,
  },

  // --- type chips -------------------------------------------------------
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    width: '100%',
    minHeight: 110, // Ensure height doesn't collapse on web
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
    color: onWash.ink,
  },
  chipRoomOn: {
    color: onWash.faint,
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
  shelf: {
    paddingBottom: 28,
  },
  cartGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  cart: {
    width: '48.5%',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.ink,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    paddingHorizontal: 9,
    paddingTop: 12,
    paddingBottom: 10,
    ...shadow.pop,
  },
  cartWide: { width: '100%' },
  cartGrooves: {
    position: 'absolute',
    top: 5,
    left: 14,
    right: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  cartFace: {
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.edge,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 5,
  },
  cartFaceWide: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  cartWideText: { flex: 1 },
  cartName: {
    fontFamily: font.hero,
    fontSize: 18,
    lineHeight: 20,
    color: '#1A211C',
    textAlign: 'center',
  },
  cartNameWide: { textAlign: 'left', fontSize: 20 },
  cartTag: {
    fontFamily: font.bodySemibold,
    fontSize: 9.5,
    lineHeight: 12,
    color: onWash.dim,
    textAlign: 'center',
  },
  cartTagWide: { textAlign: 'left', fontSize: 11, lineHeight: 14 },
  cartDials: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  cartDial: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartDialOff: { opacity: 0.32 },

  peekBack: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.5)',
    justifyContent: 'flex-end',
  },
  peekSheet: {
    backgroundColor: colors.bg,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderColor: colors.ink,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 30,
    gap: 14,
  },
  peekFace: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.edge,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  peekName: {
    fontFamily: font.hero,
    fontSize: 28,
    lineHeight: 31,
    color: '#1A211C',
  },
  peekTag: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: onWash.dim,
    textAlign: 'center',
  },
  peekDials: {
    flexDirection: 'row',
    gap: 8,
  },
  peekDial: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 2,
  },
  peekDialCap: {
    fontFamily: font.bodyHeavy,
    fontSize: 8,
    letterSpacing: 0.8,
    color: colors.textFaint,
  },
  peekDialVal: {
    fontFamily: font.heading,
    fontSize: 10.5,
    color: colors.text,
    textAlign: 'center',
  },
  peekStart: { marginTop: 2 },
  peekBackBtn: { alignSelf: 'center', paddingVertical: 4 },
  peekBackText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.textFaint,
  },

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
  modeNote: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: -2,
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
