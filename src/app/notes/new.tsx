import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { LIMITS } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

const PLACEHOLDER = `Chlorophyll: the green pigment that absorbs light
ATP stands for adenosine triphosphate
Mitochondria produce 36 ATP per glucose molecule.`;

export default function NewNotesScreen() {
  const insets = useSafeAreaInsets();
  const parse = useNotesStore((s) => s.parse);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const over = body.length > LIMITS.maxInputChars;
  const ready = body.trim().length > 0 && !over;

  const counter = useMemo(
    () => `${body.length.toLocaleString()} / ${LIMITS.maxInputChars.toLocaleString()}`,
    [body.length]
  );

  const handleGenerate = useCallback(() => {
    const result = parse(title, body);
    if (result.questions.length === 0) {
      const hint =
        result.stats.droppedForOptions > 0
          ? "We found some facts but couldn't build believable wrong answers. Paste a few more lines on the same topic and try again."
          : 'Try notes written as "Term: meaning" or short factual sentences — that gives us something to quiz.';
      Alert.alert('No questions yet', hint);
      return;
    }
    router.push('/notes/review');
  }, [body, parse, title]);

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
          <Text style={styles.title}>Add your notes</Text>
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

          <Text style={styles.label}>What are these notes about?</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Biology — Chapter 4"
            placeholderTextColor={colors.textFaint}
            style={styles.titleInput}
            maxLength={60}
            returnKeyType="next"
          />

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
            onPress={handleGenerate}
            style={styles.cta}
          />
          <Text style={styles.footnote}>
            Runs entirely on your phone — no internet, no AI, nothing uploaded.
          </Text>
        </ScrollView>
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
  tip: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    padding: 12,
    marginBottom: 6,
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
  label: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.textDim,
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
  titleInput: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.bodyBold,
    fontSize: 15,
    color: colors.text,
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
    minHeight: 210,
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
