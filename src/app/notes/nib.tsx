import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
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
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_BYTES,
  WEEKLY_PAGES,
  fileType,
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

/**
 * Where a document stops being worth its pages.
 *
 * Measured, on the same notes at four lengths: one page gave six questions,
 * three gave eighteen, eight gave thirty-two, and sixteen gave twenty-eight
 * — fewer than eight did, for twice the allowance. Past about ten pages the
 * reading starts summarising instead of covering, and the student pays by
 * the page either way.
 *
 * So this is not a limit. It is the point where somebody deserves to be told
 * what they are buying, while they can still pick a chapter instead.
 */
const PAGES_WORTH_A_WARNING = 10;

type Picked = {
  base64: string;
  mime: string;
  name: string;
  bytes: number;
  /** Pages, once they have been counted. Null when the file would not open. */
  pages: number | null;
  /** When it was handed over — shown under the card, chat-style. */
  at: string;
};
/** What he hands over when he is done. */
type Finished = { questions: number; kinds: number; at: string };

/** A plain clock reading, the way a messaging app timestamps a line. */
function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The week, as a bar that drains.
 *
 * It used to be one dot per reading, which read beautifully at ten and not at
 * all at a hundred and fifty. A bar says the same thing at any size, and the number under
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

/**
 * How many ruled lines a bubble carries. Five covers his longest message;
 * the clip hides any that fall past the text.
 */
const BUBBLE_RULES = 6;

/**
 * The scrap of ruled paper Nib writes on.
 *
 * The page's own ruling runs behind the whole screen, so his words used to
 * sit straight on it. That read as a page he had written on — but not as
 * someone talking to you. Giving each line its own torn-off scrap, with its
 * own ruling inside, keeps the handwriting on lines and makes each one a
 * message: something handed over, not merely written down.
 *
 * The corner nearest his face is squared off. That is the tail.
 */
function Bubble({ children, asleep = false }: { children: React.ReactNode; asleep?: boolean }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  // A touch stronger than the page ruling behind it, since it has a lit
  // surface under it rather than the cream of the page.
  const rule = isDark ? 'rgba(226, 229, 224, 0.10)' : 'rgba(46, 111, 163, 0.13)';
  return (
    <View style={[styles.bubble, asleep && styles.bubbleSleep]}>
      <View pointerEvents="none" style={styles.bubbleClip}>
        {Array.from({ length: BUBBLE_RULES }, (_, i) => (
          <View
            key={i}
            style={[styles.bubbleRule, { top: 9 + (i + 1) * RULE, backgroundColor: rule }]}
          />
        ))}
      </View>
      {children}
    </View>
  );
}

/** One thing Nib wrote, in his own hand, on the lines. */
function Wrote({
  children,
  asleep = false,
  time,
}: {
  children: React.ReactNode;
  asleep?: boolean;
  /** When this line was written — a small chat-style timestamp underneath. */
  time?: string;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  return (
    <View>
      <View style={styles.wrote}>
        <View style={[styles.who, asleep && styles.whoSleep]}>
          <Icon name="nib" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={2.1} />
        </View>
        <Bubble asleep={asleep}>
          <Text style={styles.hand}>{children}</Text>
        </Bubble>
      </View>
      {time != null ? <Text style={styles.timeNib}>{time}</Text> : null}
    </View>
  );
}

/**
 * Three dots, bouncing, while a reading is in flight.
 *
 * Additive rather than a replacement for the "Reading it now…" line above
 * it — that sentence says what is happening and how long it might take,
 * which the dots alone cannot. This is just the small chat-app tell that
 * someone is on the other end doing something right now.
 */
/** One bouncing dot. Its own component so the loop lives in JSX, not in hooks. */
function TypingDot({ delay }: { delay: number }) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
  const bounce = useSharedValue(0);

  useEffect(() => {
    bounce.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })
        ),
        -1
      )
    );
    // Fires once to start an animation that then runs on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }] }));
  return <Animated.View style={[styles.typingDot, style]} />;
}

/**
 * Nib, visibly working.
 *
 * The dots say someone is at the other end; this says it is *him*. He leans
 * into the page and back out of it, and rocks while he does — the reading
 * takes up to ninety seconds, and ninety seconds of a still mascot beside
 * three bouncing dots reads as a screen that has stopped rather than one
 * that is busy.
 */
function NibAtWork() {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
  const rock = useSharedValue(0);
  const lean = useSharedValue(0);

  useEffect(() => {
    // Slightly different periods, so the two never settle into one motion.
    rock.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(-1, { duration: 620, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
    lean.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      // -4deg is where he sits at rest, so the rock is around his own tilt.
      { rotate: `${-4 + rock.value * 5}deg` },
      { translateY: lean.value * 2.5 },
      { scale: 1 + lean.value * 0.04 },
    ],
  }));

  return (
    <Animated.View style={[styles.who, styles.whoAtWork, style]}>
      <Icon name="nib" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={2.1} />
    </Animated.View>
  );
}

function TypingDots() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  return (
    <View style={styles.typingRow}>
      <NibAtWork />
      <View style={styles.typingBubble}>
        <TypingDot delay={0} />
        <TypingDot delay={130} />
        <TypingDot delay={260} />
      </View>
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
   * Whether the "this will cost you N pages" card is up.
   *
   * A file is the one input whose cost the student cannot feel. Fourteen
   * pages is nine percent of a week gone on one press, and the reading is
   * charged whether or not they wanted that chapter — so the press asks
   * first. Typed notes go straight through: they are one page, and the
   * length is already on screen as you type it.
   */
  const [confirming, setConfirming] = useState(false);
  /**
   * The name this try goes by.
   *
   * Kept across a retry on purpose: the server hands back a reading already
   * made under the same name instead of making — and charging for — a second
   * one. Minted fresh whenever the notes change, because different notes are
   * a different reading and should cost what a reading costs.
   */
  const attempt = useRef(newAttempt());
  /** When Nib's opening line was written — captured once, not on every render. */
  const [askedAt] = useState(() => nowLabel());
  /**
   * When you answered him — picked a file or chose to write. Stable across
   * re-renders while you keep typing, which nowLabel() inline would not be.
   */
  const handedOverAt = useRef<string | null>(null);
  /** When the current reading started. */
  const readingAt = useRef<string | null>(null);

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

      /**
       * Two different ways to get the bytes, because expo-file-system's
       * File class is real on a phone and an empty stub in a browser — its
       * own web build declares the class with no methods at all. Calling
       * .base64() there does not fail loudly, it just is not a function,
       * and the picker throws before the student ever hears why.
       *
       * The picker itself already solves this on web: asset.base64 is
       * populated by default, a plain data URL with the bytes already
       * inside it, and this is the one field that is always safe to read.
       * Native never sets it, so the phone still goes through File.
       */
      const base64 = asset.base64
        ? asset.base64.replace(/^data:[^;]*;base64,/, '')
        : await new File(asset.uri).base64();

      // Checked here rather than after the upload: telling a student their
      // file was too big once they have already waited for it to send is the
      // rudest possible order to do this in.
      const bytes = asset.size ?? Math.ceil((base64.length * 3) / 4);
      if (bytes > MAX_FILE_BYTES) {
        setProblem(
          `That one's ${sizeLabel(bytes)} and I cap out at 3 MB. One chapter, not the whole textbook — I'm small.`
        );
        return;
      }

      // Asked of the picker, then of the name, then of the bytes themselves.
      // It used to assume PDF when the picker said nothing, which sent photos
      // to the reader labelled as documents and got them refused — and all
      // the student was told was that the reader could not be reached.
      const mime = fileType(asset.name, asset.mimeType, base64);
      if (mime == null) {
        setProblem("I have no idea what that file even is. A PDF or a photo, please?");
        return;
      }

      playSfx('nib_taped');
      attempt.current = newAttempt();
      // Counted here so the cost can be said while the student can still
      // change their mind. The server counts it again, and that one is what
      // is charged — a wrong number here is a wrong sentence, never a bill.
      const pages = mime === 'application/pdf' ? await pdfPageCount(base64) : 1;
      handedOverAt.current = nowLabel();
      setPicked({ base64, mime, name: asset.name, bytes, pages, at: handedOverAt.current });
      // A file and a written page are two answers to one question.
      setWriting(false);
      setBody('');
    };
    run().catch(() => setProblem("That one won't open for me. Try another?"));
  }, []);

  const send = useCallback(() => {
    setConfirming(false);
    setCutOff(null);
    // The sound of it leaving your hands: a lift, then a short sweep away.
    // Fires on the press rather than on the upload finishing, because it is
    // confirming the press.
    playSfx('nib_send');
    readingAt.current = nowLabel();
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
          playSfx('nib_cutoff');
          setCutOff(failed);
        } else {
          // Distinct from "the line went" on purpose: nothing failed here.
          // He read it, and could not quote anything back out of it.
          setProblem(
            picked != null
              ? 'I read all of that and could not find a single fact to test you on. Embarrassing for us both. Is it mostly pictures or headings?'
              : 'I read all of that and could not find a single fact to test you on. Embarrassing for us both. Try a page with more actual statements on it?'
          );
        }
        return;
      }
      // Held, not navigated. He has something to say first.
      const kinds = new Set(useNotesStore.getState().draft.map((q) => q.kind)).size;
      playSfx('nib_reply');
      setFinished({ questions: staged, kinds, at: nowLabel() });
    };
    void run();
  }, [body, picked, readFile, scanWithReader]);

  /**
   * What the "Read it" button does. A file asks; typed notes just go.
   */
  const askThenSend = useCallback(() => {
    if (picked != null) {
      playSfx('tap');
      setConfirming(true);
      return;
    }
    send();
  }, [picked, send]);

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
              <Wrote asleep time={askedAt}>
                That&apos;s my {of === 1 ? 'one' : of} for the week. Every{'\n'}
                last one. My brain is a damp{'\n'}
                sponge now. Back on Monday!{'\n'}
                Add notes still works though —{'\n'}
                no signal, no me, no bother.
              </Wrote>
            ) : null}

            {idle && !spent && empty ? (
              <Wrote time={askedAt}>
                Ooh. Notes. Are they for me?{'\n'}
                A PDF, a photo of the board, or{'\n'}
                scribble something below. I&apos;m{'\n'}
                not a picky reader. Barely a reader.
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
                      {picked.pages != null && picked.pages > PAGES_WORTH_A_WARNING ? (
                        <Text style={styles.tapedWarn}>
                          That&apos;s a big one. Five or six pages gets you about the same number
                          of questions for a third of the cost. Just saying.
                        </Text>
                      ) : null}
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
                {/* The small chat-app tell that this was actually sent. */}
                <View style={styles.seenRow}>
                  <Text style={styles.timeYou}>{picked.at}</Text>
                  <Icon name="check" size={11} color={colors.leaf} strokeWidth={3} />
                </View>
              </Animated.View>
            ) : null}

            {idle && !spent && !empty && !interrupted ? (
              <Wrote time={handedOverAt.current ?? undefined}>
                {picked
                  ? 'Ooh, this one looks HARD.\nGood. I’ll do you some multiple\nchoice, some fill-the-blanks, and\nlists where you wrote lists. Posh.'
                  : 'Go on then. Type at me.\nIt doesn’t need to be tidy.\nTidy isn’t really my whole thing.'}
              </Wrote>
            ) : null}

            {/* --- reading ----------------------------------------------- */}
            {rescuing ? (
              <>
                <Wrote time={readingAt.current ?? undefined}>
                  Reading! Reading. Don&apos;t look{'\n'}
                  at me. Up to a minute and a half{'\n'}
                  if it&apos;s a big one — I move my{'\n'}
                  lips when I read. It&apos;s a whole thing.
                </Wrote>
                <TypingDots />
              </>
            ) : null}

            {/* --- cut off mid-sentence ---------------------------------- */}
            {interrupted ? (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.content}>
                <View style={styles.wrote}>
                  <View style={styles.who}>
                    <Icon name="nib" size={19} color={onWash.ink} fill="#FFFFFF" strokeWidth={2.1} />
                  </View>
                  <Bubble>
                    {/*
                      He stops mid-word. A sentence that runs out is the one
                      thing on a page of handwriting that unmistakably means
                      "interrupted" — no icon has to say it.
                    */}
                    <Text style={styles.hand}>
                      I was doing SO well. I was{'\n'}
                      half way through when the li
                      <Text style={styles.trail}>—</Text>
                    </Text>
                    <Squiggle width={62} style={styles.scrawl} />
                  </Bubble>
                </View>
                {/*
                  The one message where the time actually matters — a student
                  coming back to a failed reading wants to know when it went,
                  and this was the only line on the screen without a clock.
                */}
                {readingAt.current != null ? (
                  <Text style={styles.timeNib}>{readingAt.current}</Text>
                ) : null}

                <View style={styles.torn}>
                  <Icon name="alert" size={17} color={colors.coral} strokeWidth={2.5} />
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
                  onPress={askThenSend}
                  style={styles.cta}
                />
              </Animated.View>
            ) : null}

            {/* --- finished: he says so, and waits ----------------------- */}
            {finished != null ? (
              <>
                <Wrote time={finished.at}>
                  Finished! {finished.questions} questions. I made{'\n'}
                  them myself, with my own two{'\n'}
                  hands, which I do not have.{'\n'}
                  Check them though — I get things wrong.
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
                  <Icon name="book" size={19} color={colors.text} fill={colors.surface} strokeWidth={1.9} />
                  <Text style={styles.stickLabel}>a file</Text>
                  <Text style={styles.stickHint}>PDF or photo{'\n'}up to 3 MB</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    handedOverAt.current = nowLabel();
                    setWriting(true);
                  }}
                  disabled={spent}
                  accessibilityRole="button"
                  accessibilityLabel="Write it out for Nib"
                  style={({ pressed }) => [
                    styles.stick,
                    styles.stickMint,
                    spent && styles.faded,
                    pressed && styles.pressed,
                  ]}>
                  <Icon name="pencil" size={19} color={colors.text} fill={colors.surface} strokeWidth={1.9} />
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
                onPress={askThenSend}
                style={styles.cta}
              />
            ) : null}

            <Text style={styles.footnote}>
              This is the one screen that uses the internet. Everything else runs on your phone.
            </Text>
          </ScrollView>
        </View>

        {/*
          Named in pages rather than percent, because pages are the thing
          being spent and the percent is only how it feels. Both are here:
          the number to decide on, and the number to feel.
        */}
        <ConfirmModal
          visible={confirming}
          title={
            picked?.pages != null
              ? `Read all ${picked.pages} ${picked.pages === 1 ? 'page' : 'pages'}?`
              : 'Hand it over?'
          }
          message={
            picked?.pages != null
              ? `That's ${picked.pages} of your ${of} this week — about ${percentOfWeek(picked.pages, of)}% of it, and I can't un-read it.`
              : `I can't count the pages in that one, so it will cost what it costs.`
          }
          confirmLabel="Go on then"
          cancelLabel="Wait"
          onConfirm={send}
          onCancel={() => setConfirming(false)}
        />

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
    /** Under his line, indented past the avatar so it sits under the text. */
    timeNib: {
      fontFamily: font.bodySemibold,
      fontSize: 10,
      color: colors.textFaint,
      marginTop: 3,
      marginLeft: 41,
    },
    /** Under yours, aligned the same way the taped card sits — flush right. */
    timeYou: { fontFamily: font.bodySemibold, fontSize: 10, color: colors.textFaint },
    seenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
      justifyContent: 'flex-end',
    },
    typingRow: { flexDirection: 'row', gap: 9, alignItems: 'center', marginTop: 6 },
    typingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.surface,
      borderWidth: 1.8,
      borderColor: colors.edge,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      paddingHorizontal: 13,
      paddingVertical: 10,
      ...shadow.card,
    },
    typingDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: '#8892CE' },
    /** Reanimated drives the transform, so the static tilt comes off. */
    whoAtWork: { transform: [] },
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
    hand: { fontFamily: font.hero, fontSize: 17, lineHeight: RULE, color: colors.text },
    /**
     * His paper. Sized by its content rather than stretched to the column,
     * which is what makes a run of them read as messages: each one is as
     * wide as what he actually said.
     */
    bubble: {
      flexShrink: 1,
      maxWidth: '100%',
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      ...derpRadius,
      // Squared toward his face. The tail.
      borderTopLeftRadius: 5,
      paddingTop: 9,
      paddingBottom: 10,
      paddingHorizontal: 13,
      overflow: 'hidden',
      ...shadow.card,
    },
    /** Out of pages, out of paper: the scrap goes grey with him. */
    bubbleSleep: { backgroundColor: colors.disabledBg },
    /** Holds the ruling, so the clip never touches the bubble's own shadow. */
    bubbleClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
    /** One line of the scrap's own ruling, sat under a line of his hand. */
    bubbleRule: { position: 'absolute', left: 0, right: 0, height: 1 },

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
    tornTitle: { fontFamily: font.heading, fontSize: 14.5, color: colors.text },
    tornBody: {
      fontFamily: font.body,
      fontSize: 12.5,
      lineHeight: 17.5,
      color: colors.textDim,
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
    tapedWarn: {
      fontFamily: font.bodySemibold,
      fontSize: 11,
      lineHeight: 15,
      color: colors.gold,
      marginTop: 3,
    },
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
    stickLabel: { fontFamily: font.hero, fontSize: 19, lineHeight: 22, color: colors.text },
    stickHint: {
      fontFamily: font.bodySemibold,
      fontSize: 10.5,
      lineHeight: 14,
      color: colors.textDim,
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
    slipNum: { fontFamily: font.hero, fontSize: 30, lineHeight: 32, color: colors.text },
    slipLab: {
      fontFamily: font.bodyHeavy,
      fontSize: 9,
      letterSpacing: 0.9,
      color: colors.textDim,
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
