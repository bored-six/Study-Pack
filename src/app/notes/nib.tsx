import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_BYTES,
  WEEKLY_PAGES,
  newAttempt,
  pdfPageCount,
  percentOfWeek,
} from '@/lib/aiNotes';
import { LIMITS } from '@/lib/noteParser';
import { playSfx } from '@/lib/sfx';
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
/**
 * The gap between ruled lines in RuledPaper.
 *
 * Nib's handwriting takes it as a line height, which is the whole trick: his
 * words sit ON the ruling rather than floating somewhere across it, and the
 * screen reads as a page he has written on rather than a chat with a paper
 * background.
 */
const RULE = 30;

type Picked = {
  base64: string;
  mime: string;
  name: string;
  bytes: number;
  /** Pages, once they have been counted. Null when the file would not open. */
  pages: number | null;
};
/** What he hands over when he is done. */
type Finished = { questions: number; kinds: number };

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The week, as a bar that drains.
 *
 * It used to be one dot per reading, which read beautifully at ten and not at
 * all at sixty. A bar says the same thing at any size, and the number under
 * it is there because "most of it left" is a feeling and "68%" is an answer.
 */
function Allowance({ left, of }: { left: number; of: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
  const percent = percentOfWeek(left, of);
  return (
    <View style={styles.meter} accessibilityLabel={`${percent}% of your week left`}>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.meterLabel}>{percent}%</Text>
    </View>
  );
}

/** One thing Nib wrote, in his own hand, on the lines. */
function Wrote({
  children,
  asleep = false,
}: {
  children: React.ReactNode;
  asleep?: boolean;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  return (
    <View style={styles.wrote}>
      <View style={[styles.who, asleep && styles.whoSleep]}>
        <Icon name="nib" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={2.1} />
      </View>
      <Text style={styles.hand}>{children}</Text>
    </View>
  );
}

/**
 * Nib's screen — a page of the binder, with notes passed back and forth.
 *
 * Separate from Add notes on purpose. Add notes is the free scan and always
 * will be: instant, offline, unlimited. This is the paid path, and a file
 * picker with a size limit and a slow upload needed a shape of its own
 * rather than a box bolted under a paste area that has neither.
 *
 * Five states. The one that matters most is `finished`: Nib says he is done,
 * hands over a slip with the numbers on it, and then waits. Nothing moves on
 * by itself — a screen that jumps to the next thing takes away the moment
 * the waiting was for.
 */
export default function NibScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const { readFile, scanWithReader, rescuing, rescueError, credits } = useNotesStore();

  const [picked, setPicked] = useState<Picked | null>(null);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [finished, setFinished] = useState<Finished | null>(null);
  /**
   * A reading that started and did not come back.
   *
   * Kept apart from `problem`, which is a modal, because a modal on top of an
   * interruption is a second interruption. This one stays on the page with
   * the file still taped to it, so the way back is one press rather than
   * finding the document again.
   */
  const [cutOff, setCutOff] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * The name this try goes by.
   *
   * Kept across a retry on purpose: the server hands back a reading already
   * made under the same name instead of making — and charging for — a second
   * one. Minted fresh whenever the notes change, because different notes are
   * a different reading and should cost what a reading costs.
   */
  const attempt = useRef(newAttempt());

  const over = body.length > LIMITS.maxInputChars;
  const counter = useMemo(
    () => `${body.length.toLocaleString()} / ${LIMITS.maxInputChars.toLocaleString()}`,
    [body.length]
  );

  // Before the first reading the server has said nothing, so the allowance is
  // what this platform gets rather than a balance we are pretending to know.
  const of = credits?.of ?? WEEKLY_PAGES;
  const left = credits?.left ?? WEEKLY_PAGES;
  const spent = left <= 0;
  const ready = (picked != null || (body.trim().length > 0 && !over)) && !spent;

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
          `That one is ${sizeLabel(bytes)}. I can take 3 MB — try a single chapter rather than the whole book?`
        );
        return;
      }

      playSfx('derp_pop');
      attempt.current = newAttempt();
      const base64 = await file.base64();
      const mime = asset.mimeType ?? 'application/pdf';
      // Counted here so the cost can be said while the student can still
      // change their mind. The server counts it again, and that one is what
      // is charged — a wrong number here is a wrong sentence, never a bill.
      const pages = mime === 'application/pdf' ? await pdfPageCount(base64) : 1;
      setPicked({ base64, mime, name: asset.name, bytes, pages });
      // A file and a written page are two answers to one question.
      setWriting(false);
      setBody('');
    };
    run().catch(() => setProblem("I couldn't open that one. Try another?"));
  }, []);

  const send = useCallback(() => {
    setCutOff(null);
    const run = async () => {
      const staged = picked
        ? await readFile(
            { base64: picked.base64, mime: picked.mime, name: picked.name },
            attempt.current
          )
        : await scanWithReader(body, attempt.current);

      if (staged === 0) {
        // Two very different failures wearing the same zero. A reading that
        // never arrived says nothing about the notes, and must not be
        // reported as though it did.
        const failed = useNotesStore.getState().rescueError;
        if (failed != null) {
          setCutOff(failed);
        } else {
          setProblem(
            "I couldn't find anything in there worth testing. Try a page with more facts on it?"
          );
        }
        return;
      }
      // Held, not navigated. He has something to say first.
      const kinds = new Set(useNotesStore.getState().draft.map((q) => q.kind)).size;
      setFinished({ questions: staged, kinds });
    };
    void run();
  }, [body, picked, readFile, scanWithReader]);

  /**
   * Typing makes it a different reading, so it stops being the same attempt.
   * Without this, editing the notes after a failure and asking again would
   * hand back the reading of what was there before.
   */
  const changeBody = useCallback((next: string) => {
    attempt.current = newAttempt();
    setBody(next);
  }, []);

  const takeBack = useCallback(() => {
    attempt.current = newAttempt();
    setCutOff(null);
    setPicked(null);
    setWriting(false);
    setBody('');
  }, []);

  const idle = finished == null && !rescuing;
  const empty = picked == null && !writing;
  /** While the interruption is on screen it owns the reply and the button. */
  const interrupted = idle && cutOff != null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
        <RuledPaper />
        <View pointerEvents="none" style={styles.holes}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={styles.hole} />
          ))}
        </View>

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
              <Text style={styles.title}>Nib</Text>
              <Squiggle width={52} style={styles.squiggle} />
            </View>
            <View style={styles.navRight}>
              <Allowance left={left} of={of} />
            </View>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 22 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* --- what he says ------------------------------------------- */}
            {idle && spent ? (
              <Wrote asleep>
                That&apos;s my {of === 1 ? 'one' : of} for the week.{'\n'}
                Back on Monday. Add notes still{'\n'}
                scans for nothing, and it never{'\n'}
                needs a signal.
              </Wrote>
            ) : null}

            {idle && !spent && empty ? (
              <Wrote>
                What have you got for me?{'\n'}
                A chapter, a handout, a photo{'\n'}
                of the board — or write it out{'\n'}
                and I&apos;ll read that.
              </Wrote>
            ) : null}

            {/* --- what you handed over ---------------------------------- */}
            {picked != null ? (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.mine}>
                <View style={styles.taped}>
                  <Tape rotate="-3deg" style={styles.tapeOnCard} />
                  <View style={styles.tapedRow}>
                    <View style={styles.tapedIcon}>
                      <Icon
                        name={picked.mime === 'application/pdf' ? 'book' : 'monitor'}
                        size={17}
                        color={onWash.ink}
                        fill="#FFFFFF"
                        strokeWidth={1.9}
                      />
                    </View>
                    <View style={styles.tapedMid}>
                      <Text style={styles.tapedName} numberOfLines={1}>
                        {picked.name}
                      </Text>
                      <Text style={styles.tapedSize}>
                        {picked.pages != null
                          ? `${sizeLabel(picked.bytes)} · ${picked.pages} ${picked.pages === 1 ? 'page' : 'pages'} — up to ${percentOfWeek(picked.pages, of)}% of your week`
                          : sizeLabel(picked.bytes)}
                      </Text>
                    </View>
                    {idle ? (
                      <Pressable
                        onPress={takeBack}
                        hitSlop={10}
                        accessibilityLabel="Take this back"
                        style={({ pressed }) => [styles.tapedX, pressed && styles.pressed]}>
                        <Icon name="cross" size={11} color={colors.coral} strokeWidth={2.9} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {idle && !spent && !empty && !interrupted ? (
              <Wrote>
                {picked
                  ? 'Right, let me have a look.\nI’ll mix it up: some choices, some\nfill-the-blanks, and lists where\nyou’ve written lists.'
                  : 'Write it out below.\nIt doesn’t need to be tidy —\nthat is rather the point of me.'}
              </Wrote>
            ) : null}

            {/* --- reading ----------------------------------------------- */}
            {rescuing ? (
              <Wrote>
                Reading it now…{'\n'}
                Up to a minute and a half on a{'\n'}
                long one. Stay here if you like,{'\n'}
                I don&apos;t mind an audience.
              </Wrote>
            ) : null}

            {/* --- cut off mid-sentence ---------------------------------- */}
            {interrupted ? (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.content}>
                <View style={styles.wrote}>
                  <View style={styles.who}>
                    <Icon name="nib" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={2.1} />
                  </View>
                  <View style={styles.flex}>
                    {/*
                      He stops mid-word. A sentence that runs out is the one
                      thing on a page of handwriting that unmistakably means
                      "interrupted" — no icon has to say it.
                    */}
                    <Text style={styles.hand}>
                      Reading it now… I was about{'\n'}
                      half way through when the li
                      <Text style={styles.trail}>—</Text>
                    </Text>
                    <Squiggle width={62} style={styles.scrawl} />
                  </View>
                </View>

                <View style={styles.torn}>
                  <Icon name="alert" size={17} color={onWash.ink} strokeWidth={2.5} />
                  <View style={styles.tornText}>
                    <Text style={styles.tornTitle}>The line went.</Text>
                    <Text style={styles.tornBody}>
                      {cutOff}
                      {picked != null
                        ? ' Your file is still here — nothing to find again.'
                        : ' Everything you wrote is still below.'}
                    </Text>
                  </View>
                </View>

                <ChunkyButton
                  label="Ask him again"
                  icon="nib"
                  size="lg"
                  disabled={!ready}
                  onPress={send}
                  style={styles.cta}
                />
              </Animated.View>
            ) : null}

            {/* --- finished: he says so, and waits ----------------------- */}
            {finished != null ? (
              <>
                <Wrote>
                  Finished! I read it all and{'\n'}
                  wrote you {finished.questions}. Have a look{'\n'}
                  before you keep any of them.
                </Wrote>
                <Animated.View entering={FadeInDown.duration(280)} style={styles.slip}>
                  <View style={styles.slipCell}>
                    <Text style={styles.slipNum}>{finished.questions}</Text>
                    <Text style={styles.slipLab}>QUESTIONS</Text>
                  </View>
                  <View style={styles.slipDiv} />
                  <View style={styles.slipCell}>
                    <Text style={styles.slipNum}>{finished.kinds}</Text>
                    <Text style={styles.slipLab}>{finished.kinds === 1 ? 'KIND' : 'KINDS'}</Text>
                  </View>
                  <View style={styles.slipDiv} />
                  <View style={styles.slipCell}>
                    <Text style={styles.slipNum}>{left}</Text>
                    <Text style={styles.slipLab}>LEFT</Text>
                  </View>
                </Animated.View>
                <ChunkyButton
                  label="See what he made"
                  icon="check"
                  size="lg"
                  onPress={() => router.push('/notes/review')}
                  style={styles.cta}
                />
              </>
            ) : null}

            {/* --- the two ways to answer him ---------------------------- */}
            {idle && empty ? (
              <View style={styles.picks}>
                <Pressable
                  onPress={pick}
                  disabled={spent}
                  accessibilityRole="button"
                  accessibilityLabel="Give Nib a file"
                  style={({ pressed }) => [
                    styles.stick,
                    styles.stickGold,
                    spent && styles.faded,
                    pressed && styles.pressed,
                  ]}>
                  <Icon name="book" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={1.9} />
                  <Text style={styles.stickLabel}>a file</Text>
                  <Text style={styles.stickHint}>PDF or photo{'\n'}up to 3 MB</Text>
                </Pressable>
                <Pressable
                  onPress={() => setWriting(true)}
                  disabled={spent}
                  accessibilityRole="button"
                  accessibilityLabel="Write it out for Nib"
                  style={({ pressed }) => [
                    styles.stick,
                    styles.stickMint,
                    spent && styles.faded,
                    pressed && styles.pressed,
                  ]}>
                  <Icon name="pencil" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={1.9} />
                  <Text style={styles.stickLabel}>write it</Text>
                  <Text style={styles.stickHint}>
                    paste or type{'\n'}up to {(LIMITS.maxInputChars / 1000).toFixed(0)},000
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {idle && writing ? (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.padBlock}>
                <View style={styles.padHead}>
                  <Pressable
                    onPress={takeBack}
                    hitSlop={8}
                    style={({ pressed }) => [pressed && styles.pressed]}>
                    <Text style={styles.padBack}>← the other way</Text>
                  </Pressable>
                  <Text style={[styles.counter, over && styles.counterOver]}>{counter}</Text>
                </View>
                <View style={styles.padWrap}>
                  <TextInput
                    value={body}
                    onChangeText={changeBody}
                    placeholder={'Paste a paragraph, a page of\nlecture notes, a list of terms…'}
                    placeholderTextColor={colors.textFaint}
                    style={styles.pad}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                  />
                </View>
              </Animated.View>
            ) : null}

            {/* --- the one button ---------------------------------------- */}
            {((idle && !empty && !interrupted) || rescuing) ? (
              <ChunkyButton
                label={rescuing ? 'Nib is reading…' : spent ? 'Back Monday' : 'Read it'}
                icon={rescuing ? 'pencil' : spent ? 'clock' : 'nib'}
                size="lg"
                disabled={rescuing || !ready}
                onPress={send}
                style={styles.cta}
              />
            ) : null}

            <Text style={styles.footnote}>
              This is the one screen that uses the internet. Everything else runs on your phone.
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
    pressed: { opacity: 0.72 },
    faded: { opacity: 0.4 },

    /** Punched binder holes, as on Home. Decoration, never over content. */
    holes: {
      position: 'absolute',
      left: 4,
      top: 128,
      bottom: 34,
      width: 14,
      justifyContent: 'space-around',
    },
    hole: {
      width: 11,
      height: 11,
      borderRadius: 999,
      backgroundColor: colors.track,
      borderWidth: 1.4,
      borderColor: colors.lineSoft,
    },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
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
    title: { fontFamily: font.hero, fontSize: 30, lineHeight: 34, color: colors.ink },
    squiggle: { marginTop: 1 },
    navRight: { marginLeft: 'auto', maxWidth: 92 },
    meter: { alignItems: 'flex-end', gap: 3 },
    meterTrack: {
      width: 76,
      height: 8,
      borderRadius: 999,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.edge,
      overflow: 'hidden',
    },
    meterFill: { height: '100%', backgroundColor: '#8892CE' },
    meterLabel: { fontFamily: font.body, fontSize: 11, color: colors.ink, opacity: 0.7 },

    content: { gap: 14, paddingTop: 6 },

    // His hand, on the ruling — the line height is the gap between lines.
    wrote: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
    who: {
      width: 32,
      height: 32,
      borderRadius: radius.control,
      backgroundColor: PERI,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-4deg' }],
      marginTop: 3,
    },
    whoSleep: { backgroundColor: colors.disabledBg },
    hand: { flex: 1, fontFamily: font.hero, fontSize: 17, lineHeight: RULE, color: colors.text },

    /** The dash his pen left when the sentence stopped. */
    trail: { color: colors.coral },
    /** And the scrawl the nib made on its way off the line. */
    scrawl: { marginTop: -6, marginLeft: 2, opacity: 0.55 },

    torn: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.coralWash,
      ...outlineOn(colors),
      ...derpRadius,
      paddingVertical: 11,
      paddingHorizontal: 12,
      transform: [{ rotate: '0.4deg' }],
      ...shadow.card,
    },
    tornText: { flex: 1, gap: 2 },
    tornTitle: { fontFamily: font.heading, fontSize: 14.5, color: onWash.ink },
    tornBody: {
      fontFamily: font.body,
      fontSize: 12.5,
      lineHeight: 17.5,
      color: onWash.dim,
    },

    mine: { alignItems: 'flex-end' },
    taped: {
      maxWidth: '86%',
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      paddingHorizontal: 11,
      paddingVertical: 10,
      marginTop: 8,
      transform: [{ rotate: '-1.1deg' }],
      ...shadow.card,
    },
    tapeOnCard: { top: -9, left: '50%', marginLeft: -26 },
    tapedRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    tapedIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.control,
      backgroundColor: PERI,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
    tapedMid: { flexShrink: 1, gap: 1 },
    tapedName: { fontFamily: font.heading, fontSize: 13.5, color: colors.ink },
    tapedSize: { fontFamily: font.bodySemibold, fontSize: 11, color: colors.textFaint },
    tapedX: {
      width: 25,
      height: 25,
      borderRadius: 999,
      backgroundColor: colors.coralWash,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },

    picks: { flexDirection: 'row', gap: 10 },
    /** Sticky notes: square top, one rounded corner, a degree off true. */
    stick: {
      flex: 1,
      ...outlineOn(colors),
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 4,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 5,
      ...shadow.card,
    },
    stickGold: { backgroundColor: colors.goldWash, transform: [{ rotate: '-1deg' }] },
    stickMint: { backgroundColor: colors.accentWash, transform: [{ rotate: '1deg' }] },
    stickLabel: { fontFamily: font.hero, fontSize: 19, lineHeight: 22, color: onWash.ink },
    stickHint: {
      fontFamily: font.bodySemibold,
      fontSize: 10.5,
      lineHeight: 14,
      color: onWash.faint,
      textAlign: 'center',
    },

    padBlock: { gap: 7 },
    padHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    padBack: { fontFamily: font.bodyHeavy, fontSize: 11.5, color: colors.accentDeep },
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
      minHeight: 140,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: colors.text,
    },

    /** What he hands over: three numbers on a torn-off slip. */
    slip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.leafWash,
      ...outlineOn(colors),
      ...derpRadius,
      paddingVertical: 11,
      paddingHorizontal: 8,
      transform: [{ rotate: '-0.5deg' }],
      ...shadow.card,
    },
    slipCell: { flex: 1, alignItems: 'center' },
    slipNum: { fontFamily: font.hero, fontSize: 30, lineHeight: 32, color: onWash.ink },
    slipLab: {
      fontFamily: font.bodyHeavy,
      fontSize: 9,
      letterSpacing: 0.9,
      color: onWash.dim,
      marginTop: 2,
    },
    slipDiv: { width: 1.5, alignSelf: 'stretch', backgroundColor: colors.edge, opacity: 0.5 },

    cta: { marginTop: 2 },
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
      marginTop: 8,
    },
  });
