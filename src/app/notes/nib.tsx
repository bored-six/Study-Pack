import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { ACCEPTED_FILE_TYPES, MAX_FILE_BYTES } from '@/lib/aiNotes';
import { LIMITS } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';
import {
  derpRadius,
  font,
  getColors,
  onWash,
  outlineOn,
  radius,
  shadow,
  useThemeStore,
} from '@/theme/tokens';

/** Nib's own colour, the one thing in the app that leaves the phone. */
const PERI = '#E3E7FB';

type Picked = { base64: string; mime: string; name: string; bytes: number };

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Nib's own screen.
 *
 * Separate from Add notes on purpose. Add notes is the free scan and always
 * will be — instant, offline, unlimited. This is the paid path: it costs one
 * of ten a week and it needs a connection, and a file picker with size limits
 * and a slow upload does not belong underneath a paste box that has none of
 * those things.
 */
export default function NibScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const { readFile, scanWithReader, rescuing, rescueError, credits } = useNotesStore();

  const [picked, setPicked] = useState<Picked | null>(null);
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const over = body.length > LIMITS.maxInputChars;
  const counter = useMemo(
    () => `${body.length.toLocaleString()} / ${LIMITS.maxInputChars.toLocaleString()}`,
    [body.length]
  );
  const ready = picked != null || (body.trim().length > 0 && !over);

  const pick = useCallback(() => {
    const run = async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_FILE_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      const file = new File(asset.uri);
      // Checked here rather than after the upload: telling a student their
      // file was too big once they have already waited for it to send is the
      // rudest possible order to do this in.
      const bytes = asset.size ?? file.size ?? 0;
      if (bytes > MAX_FILE_BYTES) {
        setProblem(
          `That one is ${sizeLabel(bytes)}. Nib can take up to 3 MB — try a single chapter rather than the whole book.`
        );
        return;
      }

      setPicked({
        base64: await file.base64(),
        mime: asset.mimeType ?? 'application/pdf',
        name: asset.name,
        bytes,
      });
      // A file and a paste are two answers to one question; taking the file
      // means the box is no longer what gets read.
      setBody('');
    };
    run().catch(() => setProblem("Couldn't open that file. Try another one."));
  }, []);

  const send = useCallback(() => {
    const run = async () => {
      const staged = picked
        ? await readFile({ base64: picked.base64, mime: picked.mime, name: picked.name })
        : await scanWithReader(body);

      if (staged === 0) {
        setProblem(
          useNotesStore.getState().rescueError ??
            'Nib found nothing in there worth testing. Try a page with more facts on it.'
        );
        return;
      }
      router.push('/notes/review');
    };
    void run();
  }, [body, picked, readFile, scanWithReader]);

  const spent = credits != null && credits.left <= 0;
  const countLine =
    credits == null
      ? '10 readings a week'
      : `${credits.left} of ${credits.of} readings left this week`;

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
                <Text style={styles.title}>Ask</Text>
                <View style={styles.titleSticker}>
                  <Text style={styles.titleStickerText}>Nib!</Text>
                </View>
              </View>
              <Squiggle width={72} style={styles.squiggle} />
            </View>
            <View style={styles.crest}>
              <Icon name="nib" size={22} color={onWash.ink} fill="#FFFFFF" strokeWidth={2} />
            </View>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            <View style={styles.intro}>
              <Tape />
              <Text style={styles.introText}>
                Nib reads notes that aren't in a shape the scan can catch — paragraphs, a
                lecture handout, a photo of the board. It only ever sees what you hand it here.
              </Text>
            </View>

            <Text style={styles.kicker}>GIVE NIB A FILE</Text>
            {picked ? (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.picked}>
                <View style={styles.pickedIcon}>
                  <Icon
                    name={picked.mime === 'application/pdf' ? 'book' : 'monitor'}
                    size={19}
                    color={onWash.ink}
                    fill="#FFFFFF"
                    strokeWidth={1.9}
                  />
                </View>
                <View style={styles.pickedMid}>
                  <Text style={styles.pickedName} numberOfLines={1}>
                    {picked.name}
                  </Text>
                  <Text style={styles.pickedSize}>{sizeLabel(picked.bytes)} · ready to read</Text>
                </View>
                <Pressable
                  onPress={() => setPicked(null)}
                  hitSlop={10}
                  accessibilityLabel="Remove this file"
                  style={({ pressed }) => [styles.pickedX, pressed && styles.pressed]}>
                  <Icon name="cross" size={13} color={colors.coral} strokeWidth={2.8} />
                </Pressable>
              </Animated.View>
            ) : (
              <Pressable
                onPress={pick}
                accessibilityRole="button"
                accessibilityLabel="Choose a PDF or a photo"
                style={({ pressed }) => [styles.drop, pressed && styles.pressed]}>
                <View style={styles.dropIcon}>
                  <Icon name="plus" size={22} color={onWash.ink} strokeWidth={2.6} />
                </View>
                <Text style={styles.dropTitle}>Choose a PDF or a photo</Text>
                <Text style={styles.dropHint}>Up to 3 MB — a chapter, a handout, a page of your own writing</Text>
              </Pressable>
            )}

            {picked ? null : (
              <>
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or paste it</Text>
                  <View style={styles.orLine} />
                </View>

                <View style={styles.labelRow}>
                  <Text style={styles.kicker}>PASTE ANYTHING</Text>
                  <Text style={[styles.counter, over && styles.counterOver]}>{counter}</Text>
                </View>
                <View style={styles.padWrap}>
                  <TextInput
                    value={body}
                    onChangeText={setBody}
                    placeholder={'Paste a paragraph, a definition list, a wall of\nlecture notes — Nib will work out what to ask.'}
                    placeholderTextColor={colors.textFaint}
                    style={styles.pad}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </>
            )}

            <ChunkyButton
              label={rescuing ? 'Nib is reading…' : spent ? 'Readings come back Monday' : 'Read it'}
              icon={rescuing ? 'pencil' : spent ? 'clock' : 'nib'}
              size="lg"
              disabled={!ready || rescuing || spent}
              onPress={send}
              style={styles.cta}
            />
            <Text style={styles.count}>{countLine}</Text>

            {rescueError != null && !rescuing ? (
              <Text style={styles.warn}>{rescueError}</Text>
            ) : null}

            <Text style={styles.footnote}>
              This is the one screen that uses the internet. Everything else in Flipp runs on
              your phone.
            </Text>
          </ScrollView>
        </View>

        <ConfirmModal
          visible={problem != null}
          title="Nib can't read that"
          message={problem ?? ''}
          confirmLabel="Alright"
          onConfirm={() => setProblem(null)}
          onCancel={() => setProblem(null)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: colors.bg },
    column: { flex: 1, paddingHorizontal: 16 },
    pressed: { opacity: 0.75 },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.control,
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    backArrow: { fontFamily: font.heading, fontSize: 20, color: colors.ink, marginTop: -2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontFamily: font.hero, fontSize: 32, lineHeight: 36, color: colors.ink },
    titleSticker: {
      backgroundColor: PERI,
      ...outlineOn(colors),
      ...derpRadius,
      paddingHorizontal: 10,
      paddingVertical: 2,
      transform: [{ rotate: '-2deg' }],
    },
    titleStickerText: { fontFamily: font.hero, fontSize: 26, lineHeight: 32, color: onWash.ink },
    squiggle: { marginTop: 2 },
    crest: {
      marginLeft: 'auto',
      width: 40,
      height: 40,
      backgroundColor: PERI,
      ...outlineOn(colors),
      ...derpRadius,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-4deg' }],
      ...shadow.card,
    },

    content: { gap: 12, paddingTop: 4 },
    intro: {
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 14,
      paddingTop: 18,
      ...shadow.card,
    },
    introText: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colors.textDim },

    kicker: {
      fontFamily: font.bodyHeavy,
      fontSize: 11,
      letterSpacing: 1.2,
      color: colors.textFaint,
    },

    drop: {
      backgroundColor: PERI,
      borderWidth: 2,
      borderColor: colors.edge,
      borderStyle: 'dashed',
      ...derpRadius,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 7,
    },
    dropIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.control,
      backgroundColor: '#FFFFFF',
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-3deg' }],
    },
    dropTitle: { fontFamily: font.heading, fontSize: 16, color: onWash.ink, marginTop: 3 },
    dropHint: {
      fontFamily: font.body,
      fontSize: 12,
      lineHeight: 16.5,
      color: onWash.faint,
      textAlign: 'center',
    },

    picked: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      backgroundColor: PERI,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 12,
      ...shadow.card,
    },
    pickedIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.control,
      backgroundColor: '#FFFFFF',
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickedMid: { flex: 1, gap: 1 },
    pickedName: { fontFamily: font.heading, fontSize: 14.5, color: onWash.ink },
    pickedSize: { fontFamily: font.bodySemibold, fontSize: 11.5, color: onWash.faint },
    pickedX: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: colors.coralWash,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },

    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
    orLine: { flex: 1, height: 1.5, backgroundColor: colors.lineSoft },
    orText: { fontFamily: font.bodyHeavy, fontSize: 11, color: colors.textFaint },

    labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    counter: { fontFamily: font.bodySemibold, fontSize: 11.5, color: colors.textFaint },
    counterOver: { color: colors.coral },
    padWrap: {
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      padding: 10,
      ...shadow.card,
    },
    pad: {
      minHeight: 150,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: colors.text,
    },

    cta: { marginTop: 6 },
    count: {
      fontFamily: font.bodySemibold,
      fontSize: 11.5,
      color: colors.textFaint,
      textAlign: 'center',
    },
    warn: {
      fontFamily: font.bodyHeavy,
      fontSize: 12,
      lineHeight: 17,
      color: colors.coral,
      textAlign: 'center',
    },
    footnote: {
      fontFamily: font.body,
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: 6,
    },
  });
