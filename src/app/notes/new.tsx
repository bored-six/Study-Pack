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
        <View style={styles.navRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.title}>Add notes</Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.tip}>
            <Icon name="bulb" size={17} color={colors.gold} strokeWidth={2.2} />
            <Text style={styles.tipText}>
              Notes written as <Text style={styles.tipStrong}>Term: meaning</Text> or short
              factual sentences make the best questions.
            </Text>
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Paste your notes</Text>
            <Text style={[styles.counter, over && styles.counterOver]}>{counter}</Text>
          </View>
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
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
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
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    padding: 12,
    marginTop: 14,
  },
  tipText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.gold,
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
  bodyInput: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: font.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.text,
    minHeight: 200,
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
