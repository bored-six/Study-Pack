import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { LIMITS } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

const PLACEHOLDER = `Chlorophyll: the green pigment that absorbs light
ATP stands for adenosine triphosphate
Mitochondria produce 36 ATP per glucose molecule.`;

/** Long enough to read the counts, short enough not to feel like waiting. */
const SCAN_MS = 900;

export default function NewNotesScreen() {
  const insets = useSafeAreaInsets();
  const { refresh, parse } = useNotesStore();
  const [body, setBody] = useState('');
  const [scan, setScan] = useState<{ lines: number; found: number } | null>(null);
  const [nothing, setNothing] = useState<string | null>(null);

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

  if (scan) {
    return (
      <View style={[styles.screen, styles.scanScreen]}>
        <View style={styles.scanBadge}>
          <Tape />
          <Icon name="bolt" size={34} color={colors.ink} fill={colors.accent} strokeWidth={1.9} />
        </View>
        <Text style={styles.scanTitle}>Reading {scan.lines} lines…</Text>
        <Text style={styles.scanSub}>
          found {scan.found} question{scan.found === 1 ? '' : 's'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <RuledPaper />
        <View style={styles.navRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
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
          <View style={styles.tip}>
            <Tape rotate="3deg" />
            <Icon name="bulb" size={18} color={colors.ink} fill={colors.goldWash} strokeWidth={1.9} />
            <Text style={styles.tipText}>
              Notes written as <Text style={styles.tipStrong}>Term: meaning</Text> or short
              factual sentences make the best questions.
            </Text>
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Paste your notes</Text>
            <Text style={[styles.counter, over && styles.counterOver]}>{counter}</Text>
          </View>
          <View style={styles.page}>
            {Array.from({ length: 14 }, (_, i) => (
              <View key={i} style={[styles.pageRule, { top: PAGE_PAD + LINE_H * (i + 1) - 5 }]} />
            ))}
            <View style={styles.pageMargin} />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={PLACEHOLDER}
              placeholderTextColor={colors.textFaint}
              style={styles.bodyInput}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />
          </View>

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
          <Text style={styles.footnote}>
            Runs entirely on your phone — no internet, no AI, nothing uploaded.
          </Text>
        </ScrollView>

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

/** The paste box writes on real rule lines, so these must agree. */
const LINE_H = 26;
const PAGE_PAD = 14;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  scanScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    transform: [{ rotate: '-5deg' }],
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
  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textDim,
    marginTop: 6,
  },
  tip: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    padding: 13,
    marginTop: 16,
    ...shadow.card,
  },
  tipText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
  },
  tipStrong: {
    fontFamily: font.bodyHeavy,
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
  page: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    overflow: 'hidden',
    minHeight: PAGE_PAD * 2 + LINE_H * 8,
    ...shadow.card,
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
  overText: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.coral,
    marginTop: 2,
  },
  cta: {
    marginTop: 16,
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
