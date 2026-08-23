import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { PromptModal } from '@/components/PromptModal';
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
  const { subjects, targetId, refresh, setTarget, addSubject, parse } = useNotesStore();
  const [body, setBody] = useState('');
  const [scan, setScan] = useState<{ lines: number; found: number } | null>(null);
  const [newSubject, setNewSubject] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const target = subjects.find((s) => s.id === targetId) ?? null;
  const over = body.length > LIMITS.maxInputChars;
  const ready = body.trim().length > 0 && !over;

  const counter = useMemo(
    () => `${body.length.toLocaleString()} / ${LIMITS.maxInputChars.toLocaleString()}`,
    [body.length]
  );

  const handleCreateSubject = useCallback(
    (name: string) => {
      setNewSubject(false);
      void addSubject(name);
    },
    [addSubject]
  );

  const runParse = useCallback(async () => {
    let subjectId = targetId;
    if (!subjectId) {
      subjectId = await addSubject('My notes');
    }

    const result = parse(body);
    if (result.questions.length === 0) {
      const noOptions = result.stats.skipped.filter((s) => s.reason === 'no_options').length;
      Alert.alert(
        'No questions yet',
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
  }, [addSubject, body, parse, targetId]);

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
          <Text style={styles.label}>Adding to</Text>
          <View style={styles.subjectRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subjectChips}>
              {subjects.map((subject) => {
                const active = subject.id === targetId;
                return (
                  <Pressable
                    key={subject.id}
                    onPress={() => setTarget(subject.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && !active && styles.pressed,
                    ]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {subject.name}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setNewSubject(true)}
                style={({ pressed }) => [styles.chipNew, pressed && styles.pressed]}>
                <Text style={styles.chipNewText}>+ New subject</Text>
              </Pressable>
            </ScrollView>
          </View>
          {subjects.length === 0 ? (
            <Text style={styles.subjectHint}>
              No subjects yet — we'll start one called "My notes".
            </Text>
          ) : null}

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
            label={target ? `Make questions for ${target.name}` : 'Make questions'}
            icon="bolt"
            size="lg"
            disabled={!ready}
            onPress={() => void runParse()}
            style={styles.cta}
          />
          <Text style={styles.footnote}>
            Runs entirely on your phone — no internet, no AI, nothing uploaded.
          </Text>
        </ScrollView>

        <PromptModal
          visible={newSubject}
          title="New subject"
          message="What are you studying?"
          placeholder="Biology"
          confirmLabel="Create"
          onCancel={() => setNewSubject(false)}
          onConfirm={handleCreateSubject}
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
  subjectRow: {
    marginTop: 2,
  },
  subjectChips: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.accent,
    ...shadow.card,
  },
  chipText: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.textDim,
  },
  chipTextActive: {
    color: colors.ink,
  },
  chipNew: {
    backgroundColor: colors.accentWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  chipNewText: {
    fontFamily: font.bodyHeavy,
    fontSize: 13,
    color: colors.accentDeep,
  },
  subjectHint: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.textFaint,
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
