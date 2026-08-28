import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon, type IconName } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { LIMITS } from '@/lib/noteParser';
import { readShape, shapeAdvice } from '@/lib/noteShape';
import { playSfx } from '@/lib/sfx';
import { useNotesStore } from '@/store/notes';
import { font, getColors, outline, radius, shadow, useThemeStore } from '@/theme/tokens';

const PLACEHOLDER = `Chlorophyll: the green pigment that absorbs light
ATP stands for adenosine triphosphate
Mitochondria produce 36 ATP per glucose molecule.`;

/** Long enough to read the counts, short enough not to feel like waiting. */
const SCAN_MS = 900;

/**
 * The three shapes of note that turn into questions, as worked examples.
 *
 * They are tappable rather than decorative: the first thing a new student
 * has to do is find out what "notes we can use" means, and reading a
 * description of a format is a much worse way to learn it than watching
 * one land in the box.
 */
const RECIPES: { icon: IconName; name: string; sample: string }[] = [
  {
    icon: 'book',
    name: 'Term: meaning',
    sample: 'Chlorophyll: the green pigment that absorbs light',
  },
  {
    icon: 'note',
    name: 'A plain fact',
    sample: 'Mitochondria produce 36 ATP per glucose molecule.',
  },
  {
    icon: 'cards',
    name: 'A short list',
    sample: 'The three states of matter are solid, liquid and gas.',
  },
];

export default function NewNotesScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const insets = useSafeAreaInsets();
  const { refresh, parse } = useNotesStore();
  const [body, setBody] = useState('');
  const [scan, setScan] = useState<{ lines: number; found: number } | null>(null);
  const [nothing, setNothing] = useState<string | null>(null);
  const input = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const over = body.length > LIMITS.maxInputChars;
  const ready = body.trim().length > 0 && !over;

  const counter = useMemo(
    () => `${body.length.toLocaleString()} / ${LIMITS.maxInputChars.toLocaleString()}`,
    [body.length]
  );

  // What the page can see, live. A shape read, not a parse — see lib/noteShape.
  const shape = useMemo(() => readShape(body), [body]);
  const advice = useMemo(() => shapeAdvice(shape), [shape]);

  /** Drops one worked example at the end of whatever is already there. */
  const addSample = useCallback((sample: string) => {
    playSfx('derp_pop');
    setBody((current) => (current.trim() ? `${current.replace(/\s+$/, '')}\n${sample}` : sample));
    input.current?.focus();
  }, []);

  // Which subject these end up in is decided on the review screen, once
  // the student can see what the notes actually turned into.
  const runParse = useCallback(() => {
    const result = parse(body);
    if (result.questions.length === 0) {
      const noOptions = result.stats.skipped.filter((s) => s.reason === 'no_options').length;
      setNothing(
        noOptions > 0
          ? "We found some facts but couldn't build believable wrong answers. Paste a few more lines on the same topic and try again."
          : 'Try notes written as "Term: meaning" or short factual sentences — that gives us something to quiz.'
      );
      return;
    }

    // Show the real counts briefly so the work is visible.
    setScan({ lines: result.stats.linesRead, found: result.questions.length });
    setTimeout(() => {
      setScan(null);
      router.push('/notes/review');
    }, SCAN_MS);
  }, [body, parse]);

  useEffect(() => () => setScan(null), []);

  if (scan) return <ScanScreen lines={scan.lines} found={scan.found} />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <RuledPaper />
        <View style={styles.column}>
          <View style={styles.navRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
              <Text style={styles.backArrow}>←</Text>
            </Pressable>
            <View>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Add</Text>
                <View style={styles.titleSticker}>
                  <Text style={styles.titleStickerText}>notes!</Text>
                </View>
              </View>
              <Squiggle width={84} style={styles.squiggle} />
            </View>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* Worked examples, not instructions. Tap one and it lands below. */}
            <Text style={styles.kicker}>NOTES WE CAN USE</Text>
            <View style={styles.recipes}>
              {RECIPES.map((recipe, i) => (
                <Pressable
                  key={recipe.name}
                  onPress={() => addSample(recipe.sample)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add an example: ${recipe.name}`}
                  style={({ pressed }) => [
                    styles.recipe,
                    { transform: [{ rotate: i % 2 === 0 ? '-1.5deg' : '1.5deg' }] },
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.recipeHead}>
                    <Icon
                      name={recipe.icon}
                      size={15}
                      color={colors.accentDeep}
                      fill={colors.accentWash}
                      strokeWidth={2}
                    />
                    <Text style={styles.recipeName} numberOfLines={1}>
                      {recipe.name}
                    </Text>
                  </View>
                  <Text style={styles.recipeSample} numberOfLines={2}>
                    {recipe.sample}
                  </Text>
                  <Text style={styles.recipeAdd}>tap to add +</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.label}>PASTE YOUR NOTES</Text>
              <Text style={[styles.counter, over && styles.counterOver]}>{counter}</Text>
            </View>

            {/* The clipboard page, the same stage the exam runs on. */}
            <View style={styles.board}>
              <View style={styles.page}>
                {Array.from({ length: 14 }, (_, i) => (
                  <View key={i} style={[styles.pageRule, { top: PAGE_PAD + LINE_H * (i + 1) - 5 }]} />
                ))}
                <View style={styles.pageMargin} />
                <TextInput
                  ref={input}
                  value={body}
                  onChangeText={setBody}
                  placeholder={PLACEHOLDER}
                  placeholderTextColor={colors.textFaint}
                  style={styles.bodyInput}
                  accessibilityLabel="Your notes"
                  multiline
                  textAlignVertical="top"
                  scrollEnabled={false}
                />
                <View style={styles.dogEar} />
                <View style={styles.dogEarShade} />
              </View>
              <View style={styles.clip}>
                <View style={styles.clipHole} />
              </View>
            </View>

            {/* What the page can see, while you type. */}
            {shape.lines > 0 ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.readout}>
                <ReadPill
                  icon="note"
                  value={shape.lines}
                  label={shape.lines === 1 ? 'line' : 'lines'}
                  tone="plain"
                />
                <ReadPill
                  icon="check"
                  value={shape.usable}
                  label="we can use"
                  tone={shape.usable > 0 ? 'good' : 'flat'}
                />
                {shape.definitions > 0 ? (
                  <ReadPill icon="book" value={shape.definitions} label="definitions" tone="good" />
                ) : null}
                {shape.tooShort > 0 ? (
                  <ReadPill icon="alert" value={shape.tooShort} label="too short" tone="warn" />
                ) : null}
                {shape.tooLong > 0 ? (
                  <ReadPill icon="alert" value={shape.tooLong} label="too long" tone="warn" />
                ) : null}
              </Animated.View>
            ) : null}

            {advice ? (
              <Animated.View entering={FadeInDown.duration(220)} style={styles.advice}>
                <Icon name="bulb" size={16} color={colors.gold} strokeWidth={2.2} />
                <Text style={styles.adviceText}>{advice}</Text>
              </Animated.View>
            ) : null}

            {over ? (
              <Text style={styles.overText}>
                That's a big chunk — try one chapter at a time so the review stays manageable.
              </Text>
            ) : null}

            <ChunkyButton
              label="Make questions"
              icon="bolt"
              size="lg"
              disabled={!ready}
              onPress={runParse}
              style={styles.cta}
            />
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>
            <ChunkyButton
              label="Write my own question"
              icon="pencil"
              variant="soft"
              onPress={() => router.push('/notes/custom')}
            />
            <Text style={styles.footnote}>
              Runs entirely on your phone — no internet, no AI, nothing uploaded.
            </Text>
          </ScrollView>
        </View>

        <ConfirmModal
          visible={nothing != null}
          title="No questions yet"
          message={nothing ?? undefined}
          confirmLabel="Got it"
          onCancel={() => setNothing(null)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** One count from the live read, as a sticker. */
function ReadPill({
  icon,
  value,
  label,
  tone,
}: {
  icon: IconName;
  value: number;
  label: string;
  tone: 'plain' | 'good' | 'warn' | 'flat';
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const skin =
    tone === 'good'
      ? { wash: colors.accentWash, ink: colors.accentDeep }
      : tone === 'warn'
        ? { wash: colors.goldWash, ink: colors.gold }
        : tone === 'flat'
          ? { wash: colors.surface2, ink: colors.textFaint }
          : { wash: colors.surface, ink: colors.textDim };

  return (
    <View style={[styles.pill, { backgroundColor: skin.wash }]}>
      <Icon name={icon} size={12} color={skin.ink} strokeWidth={2.3} />
      <Text style={[styles.pillNum, { color: skin.ink }]}>{value}</Text>
      <Text style={[styles.pillLabel, { color: skin.ink }]}>{label}</Text>
    </View>
  );
}

/**
 * The moment between pasting and reviewing.
 *
 * It used to be a static badge and two lines of text for the same 900ms,
 * which reads as a hang rather than as work. The bar makes the wait legible
 * and gives the counts somewhere to land.
 */
function ScanScreen({ lines, found }: { lines: number; found: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);
  const wobble = useSharedValue(0);

  useEffect(() => {
    sweep.value = withTiming(1, { duration: SCAN_MS, easing: Easing.out(Easing.cubic) });
    if (reduced) return;
    wobble.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [reduced, sweep, wobble]);

  const barStyle = useAnimatedStyle(() => ({ width: `${sweep.value * 100}%` }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-5 + wobble.value * 10}deg` }],
  }));

  return (
    <View style={[styles.screen, styles.scanScreen]}>
      <Animated.View style={[styles.scanBadge, badgeStyle]}>
        <Tape />
        <Icon name="bolt" size={34} color={colors.ink} fill={colors.accent} strokeWidth={1.9} />
      </Animated.View>
      <Text style={styles.scanTitle}>Reading {lines} lines…</Text>
      <Text style={styles.scanSub}>
        found {found} question{found === 1 ? '' : 's'}
      </Text>
      <View style={styles.scanTrack}>
        <Animated.View style={[styles.scanFill, barStyle]} />
      </View>
    </View>
  );
}

/** The paste box writes on real rule lines, so these must agree. */
const LINE_H = 26;
const PAGE_PAD = 14;

const getStyles = (colors: any) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    paddingHorizontal: 16,
  },
  scanScreen: {
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  scanBadge: {
    width: 76,
    height: 76,
    borderRadius: 26,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...shadow.pop,
  },
  scanTitle: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 32,
    color: colors.text,
  },
  scanSub: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.accentDeep,
  },
  scanTrack: {
    width: 180,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 14,
  },
  scanFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.accentWash,
    ...outline,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 1,
    transform: [{ rotate: '-2.5deg' }],
    ...shadow.card,
  },
  titleStickerText: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 27,
    color: colors.ink,
  },
  squiggle: {
    marginTop: 1,
    marginLeft: 2,
  },
  content: {
    gap: 8,
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
    marginTop: 6,
    marginLeft: 2,
  },

  // --- worked examples --------------------------------------------------
  recipes: {
    gap: 8,
  },
  recipe: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
    ...shadow.card,
  },
  recipeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  recipeName: {
    flex: 1,
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.textDim,
  },
  recipeSample: {
    fontFamily: font.hero,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  recipeAdd: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.accentDeep,
  },

  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
    marginTop: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  counter: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  counterOver: {
    color: colors.coral,
    fontFamily: font.bodyHeavy,
  },

  // --- the page ---------------------------------------------------------
  board: {
    backgroundColor: 'rgba(151, 106, 44, 0.12)',
    borderRadius: radius.card + 8,
    padding: 10,
    paddingTop: 20,
    paddingBottom: 12,
  },
  page: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    overflow: 'hidden',
    minHeight: PAGE_PAD * 2 + LINE_H * 8,
    ...shadow.card,
  },
  clip: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    width: 76,
    height: 26,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: colors.edge,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  clipHole: {
    width: 34,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(39, 54, 43, 0.18)',
  },
  dogEar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderStyle: 'solid',
    borderRightWidth: 20,
    borderTopWidth: 20,
    borderRightColor: colors.bg,
    borderTopColor: 'transparent',
    width: 0,
    height: 0,
  },
  dogEarShade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderStyle: 'solid',
    borderLeftWidth: 20,
    borderBottomWidth: 20,
    borderBottomColor: colors.surface2,
    borderLeftColor: 'transparent',
    width: 0,
    height: 0,
  },
  pageRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(46, 111, 163, 0.10)',
  },
  pageMargin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 30,
    width: 1.5,
    backgroundColor: 'rgba(194, 78, 56, 0.15)',
  },
  bodyInput: {
    paddingLeft: 42,
    paddingRight: 14,
    paddingVertical: PAGE_PAD,
    fontFamily: font.hero,
    fontSize: 16,
    lineHeight: LINE_H,
    color: colors.text,
    minHeight: PAGE_PAD * 2 + LINE_H * 8,
  },

  // --- the live read ----------------------------------------------------
  readout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    ...outline,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillNum: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  pillLabel: {
    fontFamily: font.bodySemibold,
    fontSize: 11,
  },
  advice: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    padding: 11,
    marginTop: 2,
  },
  adviceText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.gold,
  },
  overText: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.coral,
    marginTop: 2,
  },
  cta: {
    marginTop: 14,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  orLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.lineSoft,
  },
  orText: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.textFaint,
  },
  footnote: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 10,
  },
  pressed: {
    opacity: 0.75,
  },
});
