import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
  ZoomIn,
  FadeInDown,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ComboMeter } from '@/components/ComboMeter';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ExamItemView } from '@/components/ExamItemView';
import { ExamSheet } from '@/components/ExamSheet';
import { FormatBadge, FORMAT_META } from '@/components/FormatBadge';
import { DayTint, EmberDrift, PageCount, PencilProgress, type DeskMood } from '@/components/deskdress';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { readSetting, writeSetting } from '@/lib/db';
import { tapCorrect, tapThud, tapTier, tapWrong } from '@/lib/haptics';
import { playSfx } from '@/lib/sfx';
import { emptyDraft, hasAnswer } from '@/lib/draft';
import { FORMAT_HOWTO, FORMAT_LABEL, type ExamFormat } from '@/lib/exam';
import { MODES, questionSeconds, SURVIVAL_STRIKES } from '@/lib/mode';
import { useExamStore } from '@/store/exam';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Lives left, as hearts that go out one at a time. */
function Hearts({ strikes }: { strikes: number }) {
  return (
    <View style={styles.hearts}>
      {Array.from({ length: SURVIVAL_STRIKES }, (_, i) => {
        const alive = i < SURVIVAL_STRIKES - strikes;
        return (
          <Icon
            key={i}
            name="heart"
            size={17}
            color={alive ? colors.coral : colors.disabledText}
            fill={alive ? colors.coralWash : 'none'}
            strokeWidth={2}
          />
        );
      })}
    </View>
  );
}

export default function ExamRunScreen() {
  const insets = useSafeAreaInsets();
  const store = useExamStore();
  const {
    status,
    deck,
    mode,
    items,
    index,
    queue,
    retired,
    strikes,
    visits,
    drafts,
    flagged,
    briefed,
    results,
    paperDeadline,
  } = store;

  const spec = MODES[mode];
  const item = store.current();

  // A run of correct answers, and the soft frame a hot one earns. Only the
  // modes that mark as they go can have one — a withheld paper would be
  // telling you the answer through the meter.
  const scored = spec.feedback === 'instant';
  const [combo, setCombo] = useState(0);
  const [skipBriefings, setSkipBriefings] = useState<ExamFormat[]>([]);
  const [skipChecked, setSkipChecked] = useState(false);
  const [idle, setIdle] = useState(false);
  const [emberNonce, setEmberNonce] = useState(0);
  const [wrongByItem, setWrongByItem] = useState<Record<string, number>>({});
  const wrongByItemRef = useRef<Record<string, number>>({});
  const [stars, setStars] = useState(0);
  const [lastWrongAt, setLastWrongAt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const notesShown = useRef(0);
  const bellShownAt = useRef<number | null>(null);
  const bestCombo = useRef<number | null>(null);
  const itemIdRef = useRef<string | null>(null);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (combo >= 10) {
      glow.value = withRepeat(
        withSequence(withTiming(1, { duration: 900 }), withTiming(0.4, { duration: 900 })),
        -1,
        false
      );
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [combo, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.55 }));

  // Formats the student asked never to be briefed on again. The ? button
  // in the header still reopens the instructions any time — skipping the
  // auto-show never locks the help away.
  useEffect(() => {
    void readSetting('briefing_skip').then((raw) => {
      if (!raw) return;
      try {
        const skips = JSON.parse(raw) as ExamFormat[];
        setSkipBriefings(skips);
        for (const format of skips) store.markBriefed(format);
      } catch {
        /* corrupt setting: fall back to showing briefings */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ~8s without progress and the desk starts fidgeting.
  const NOTE_POOL = ['keep going!', "you've got this", 'nice pace!', 'breathe. next one.', 'still with you'];

  // A folded note slides in maybe twice a sitting, never two pages in a row.
  useEffect(() => {
    if (index < 3 || notesShown.current >= 2) return;
    if (Math.random() > 0.08) return;
    notesShown.current += 1;
    const line =
      index >= items.length - 3 && items.length > 5
        ? 'almost there!'
        : NOTE_POOL[Math.floor(Math.random() * NOTE_POOL.length)];
    setNote(line);
    const timer = setTimeout(() => setNote(null), 2100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const idleKey = `${index}:${combo}:${Object.keys(drafts).length}`;
  useEffect(() => {
    setIdle(false);
    const timer = setTimeout(() => setIdle(true), 8000);
    return () => clearTimeout(timer);
  }, [idleKey]);

  // One ember drifts across the first time today's best combo falls.
  useEffect(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    const key = `combo_best:${day}`;
    const check = async () => {
      if (bestCombo.current == null) {
        bestCombo.current = Number((await readSetting(key)) ?? '0');
      }
      if (combo > (bestCombo.current ?? 0) && combo >= 5) {
        bestCombo.current = combo;
        await writeSetting(key, String(combo));
        setEmberNonce((n) => n + 1);
      }
    };
    void check();
  }, [combo]);

  const [showHelp, setShowHelp] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  // One ticking clock drives both timers; half-second steps keep the
  // countdown honest without repainting the paper sixty times a second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (spec.clock === 'none') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [spec.clock]);

  // Reading how a format works is not part of your time, so the countdown
  // holds until the briefing card is out of the way. Opening help later is
  // on the clock — otherwise "?" would be a free pause button.
  const waitingOnBriefing = !!item && !briefed.includes(item.format);

  // A per-question clock restarts on every item, including a mastery repeat.
  const [itemDeadline, setItemDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (spec.clock !== 'per_question' || !item || waitingOnBriefing) {
      setItemDeadline(null);
      return;
    }
    setItemDeadline(Date.now() + questionSeconds(item.format) * 1000);
  }, [spec.clock, item, visits, waitingOnBriefing]);

  const flyOff = useSharedValue(0);

  const finished = useCallback(
    (next: 'next' | 'finished') => {
      tapThud();
      if (next === 'finished') {
        // The last page tears off before the report card arrives.
        flyOff.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.quad) });
        setTimeout(() => router.replace('/exam/results'), 320);
      }
    },
    [flyOff]
  );

  const flyStyle = useAnimatedStyle(() => ({
    opacity: 1 - flyOff.value,
    transform: [
      { translateY: flyOff.value * -700 },
      { rotate: `${flyOff.value * -6}deg` },
    ],
  }));

  const handleDone = useCallback(
    (correct: boolean) => {
      const id = itemIdRef.current;
      if (correct) {
        tapCorrect();
        setCombo((c) => {
          tapTier(c + 1);
          return c + 1;
        });
        // A page answered right on the first try earns a star sticker.
        if (id && !wrongByItemRef.current[id]) {
          playSfx('star');
          setStars((s) => s + 1);
        }
      } else {
        tapWrong();
        setCombo(0);
        setLastWrongAt(Date.now());
        if (id) {
          // A wrong try leaves an eraser smudge on this page.
          setWrongByItem((m) => {
            const next = { ...m, [id]: (m[id] ?? 0) + 1 };
            wrongByItemRef.current = next;
            return next;
          });
        }
      }
      void store.answer(correct).then(finished, (e: unknown) => {
        console.warn('Could not record that answer', e);
      });
    },
    [store, finished]
  );

  // Fire a timeout once per deadline, never twice for the same question.
  const timedOutAt = useRef<number | null>(null);
  useEffect(() => {
    if (spec.clock !== 'per_question' || itemDeadline == null) return;
    if (now < itemDeadline || timedOutAt.current === itemDeadline) return;
    timedOutAt.current = itemDeadline;
    setCombo(0);
    void store.answer(false, true).then(finished);
  }, [now, itemDeadline, spec.clock, store, finished]);

  // The sitting ended while this screen was still up. Its own navigation is
  // already in flight; this is the backstop for the case where writing the
  // attempt down fails, which used to leave the student on a spinner.
  useEffect(() => {
    if (status === 'finished') router.replace('/exam/results');
  }, [status]);

  // One attempt per mount, tracked so a failed resume doesn't loop. Only a
  // cold store is worth recovering: a finished paper is not a lost one.
  const [recovery, setRecovery] = useState<'idle' | 'trying' | 'failed'>('idle');
  useEffect(() => {
    if (status !== 'idle' || recovery !== 'idle') return;
    setRecovery('trying');
    void store.resume().then((restored) => {
      if (!restored) setRecovery('failed');
    });
  }, [status, recovery, store]);

  const submitting = useRef(false);
  const submitPaper = useCallback(() => {
    if (submitting.current) return;
    submitting.current = true;
    void store.submitPaper().then(() => router.replace('/exam/results'));
  }, [store]);

  useEffect(() => {
    if (spec.clock !== 'whole' || paperDeadline == null) return;
    if (now >= paperDeadline) submitPaper();
  }, [now, paperDeadline, spec.clock, submitPaper]);

  // A reload wipes the in-memory sitting, and bailing to Home from here is
  // what made a locked phone cost you your paper. Try the snapshot first;
  // only give up once there is genuinely nothing to come back to.
  if (status !== 'active' || !item) {
    if (recovery === 'failed') return <Redirect href="/" />;
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.accentDeep} />
      </View>
    );
  }

  // Introduce each format the first time it comes up in this sitting.
  if (waitingOnBriefing || showHelp) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + 10 }]}>
        <RuledPaper />
        <Animated.View
          entering={FadeInDown.duration(320).springify().damping(18)}
          style={styles.briefCard}>
          <Tape />
          <Text style={styles.briefKicker}>NEW ON THIS PAPER</Text>
          <Animated.View entering={ZoomIn.duration(280).springify().damping(14).delay(180)}>
            <FormatBadge format={item.format} size="lg" style={styles.briefFormat} />
          </Animated.View>
          <Animated.View entering={FadeIn.duration(400).delay(380)} style={styles.briefRest}>
            <Squiggle width={110} color={FORMAT_META[item.format].ink} style={styles.briefSquiggle} />
            <Text style={styles.briefBody}>{FORMAT_HOWTO[item.format]}</Text>
            {spec.feedback === 'deferred' ? (
              <View style={styles.briefNoteRow}>
                <Icon name="bell" size={15} color={colors.ink} fill={colors.goldWash} strokeWidth={2} />
                <Text style={styles.briefNote}>
                  You won't be told if you're right until the whole paper is submitted.
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => setSkipChecked((v) => !v)}
              hitSlop={8}
              style={styles.skipRow}>
              <View style={[styles.skipBox, skipChecked && styles.skipBoxOn]}>
                {skipChecked ? (
                  <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />
                ) : null}
              </View>
              <Text style={styles.skipText}>Don't show this again</Text>
            </Pressable>
            <Text style={styles.skipHint}>
              Forgot how it works? The ? up top brings this back any time.
            </Text>

            <ChunkyButton
              label="Got it"
              size="lg"
              onPress={() => {
                store.markBriefed(item.format);
                setShowHelp(false);
                if (skipChecked && !skipBriefings.includes(item.format)) {
                  const next = [...skipBriefings, item.format];
                  setSkipBriefings(next);
                  void writeSetting('briefing_skip', JSON.stringify(next));
                }
                setSkipChecked(false);
              }}
              style={styles.briefBtn}
            />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  const answeredCount = items.filter((i) => hasAnswer(i, drafts[i.id] ?? null)).length;
  const progress =
    spec.repetition === 'until_retired'
      ? retired / Math.max(1, retired + queue.length)
      : spec.repetition === 'until_out'
        ? 0
        : index / items.length;

  const counterText =
    spec.repetition === 'until_retired'
      ? `${queue.length} left in the pile`
      : spec.repetition === 'until_out'
        ? `${results.length} answered`
        : `${index + 1} / ${items.length}`;

  const questionLeft = itemDeadline == null ? null : itemDeadline - now;
  const questionShare =
    questionLeft == null ? 0 : Math.max(0, questionLeft) / (questionSeconds(item.format) * 1000);
  const paperLeft = paperDeadline == null ? null : paperDeadline - now;
  itemIdRef.current = item.id;
  const isFlagged = flagged.includes(item.id);
  const lastItem = index + 1 >= items.length;

  // The deskmate reads the room: a fresh miss gets a wince, a hot combo a
  // lean-in, otherwise it just watches (sleep is handled by idle).
  const mood: DeskMood =
    Date.now() - lastWrongAt < 2200 ? 'wince' : combo >= 5 ? 'happy' : 'watch';

  // The bell: one small ring before the final page of a straight sitting.
  const showBell = lastItem && spec.repetition === 'once' && items.length > 3;
  if (showBell && bellShownAt.current !== index) {
    bellShownAt.current = index;
    playSfx('bell');
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <RuledPaper />
        <View style={styles.header}>
          <Pressable
            onPress={() => setConfirmQuit(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Icon name="cross" size={14} color={colors.textDim} strokeWidth={2.6} />
          </Pressable>

          {spec.repetition === 'until_out' ? (
            <Hearts strikes={strikes} />
          ) : (
            <PencilProgress progress={progress} combo={combo} />
          )}

          {spec.repetition === 'once' ? (
            <PageCount count={index + 1} total={items.length} />
          ) : (
            <Text style={styles.counter}>{counterText}</Text>
          )}


          {paperLeft != null ? (
            <Text style={[styles.timer, paperLeft < 60_000 && styles.timerLow]}>
              {clock(paperLeft)}
            </Text>
          ) : null}

          {spec.feedback === 'deferred' ? (
            <Pressable
              onPress={() => store.toggleFlag(item.id)}
              hitSlop={12}
              style={({ pressed }) => [
                styles.iconBtn,
                isFlagged && styles.iconBtnOn,
                pressed && styles.pressed,
              ]}>
              <Icon
                name="flag"
                size={14}
                color={isFlagged ? colors.gold : colors.textDim}
                fill={isFlagged ? colors.goldWash : 'none'}
                strokeWidth={2.2}
              />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setShowHelp(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Text style={styles.helpText}>?</Text>
          </Pressable>
        </View>

        {spec.clock === 'per_question' ? (
          <View style={styles.fuse}>
            <View
              style={[
                styles.fuseFill,
                {
                  width: `${questionShare * 100}%`,
                  backgroundColor: questionShare < 0.25 ? colors.coral : colors.gold,
                },
              ]}
            />
          </View>
        ) : null}

        <OfflineBanner message="Offline — running from device storage" style={styles.offline} />

        <View style={styles.formatRow}>
          <View style={[styles.formatChip, { backgroundColor: FORMAT_META[item.format].wash }]}>
            <Icon
              name={FORMAT_META[item.format].icon}
              size={16}
              color={colors.ink}
              fill={colors.surface}
              strokeWidth={2.2}
            />
          </View>
          <Text style={styles.deckName} numberOfLines={1}>
            {spec.name} · {deck?.name}
          </Text>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {showBell ? (
            <Animated.View
              key={`bell:${index}`}
              entering={ZoomIn.springify().damping(11)}
              style={styles.bell}>
              <Icon name="bell" size={15} color={colors.ink} fill={colors.goldWash} strokeWidth={2.1} />
              <Text style={styles.bellText}>last one!</Text>
            </Animated.View>
          ) : null}
          <Animated.View
            key={`${item.id}:${visits}`}
            entering={FadeInDown.springify().damping(16)}
            exiting={SlideOutUp.duration(220)}
            style={flyStyle}>
            {scored ? <ComboMeter combo={combo} idle={idle} /> : null}
            <ExamSheet
              format={item.format}
              title={FORMAT_LABEL[item.format]}
              accent={FORMAT_META[item.format].ink}
              smudges={wrongByItem[item.id] ?? 0}
              stars={stars}
              idle={idle}
              mood={mood}>
              <ExamItemView
                item={item}
                value={spec.feedback === 'deferred' ? (drafts[item.id] ?? emptyDraft(item)) : undefined}
                onChange={(value) => store.setDraft(item.id, value)}
                reveal={scored}
                onDone={handleDone}
              />
            </ExamSheet>
          </Animated.View>
        </ScrollView>

        {spec.feedback === 'deferred' ? (
          <View style={[styles.paperNav, { paddingBottom: insets.bottom + 10 }]}>
            <ChunkyButton
              label="Back"
              variant="paper"
              size="md"
              disabled={index === 0}
              onPress={() => store.goTo(index - 1)}
              style={styles.navBtn}
            />
            <ChunkyButton
              label="Review"
              variant="soft"
              size="md"
              onPress={() => setReviewing(true)}
              style={styles.navBtn}
            />
            <ChunkyButton
              label={lastItem ? 'Finish' : 'Next'}
              icon="play"
              size="md"
              onPress={() => (lastItem ? setReviewing(true) : store.goTo(index + 1))}
              style={styles.navBtn}
            />
          </View>
        ) : null}

        <DayTint />
        <EmberDrift nonce={emberNonce} />
        {note ? (
          <Animated.View
            entering={SlideInRight.springify().damping(16)}
            exiting={FadeOut.duration(250)}
            style={styles.passingNote}
            pointerEvents="none">
            <View style={styles.noteFold} />
            <Text style={styles.noteText}>{note}</Text>
          </Animated.View>
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.glowFrame, glowStyle]} />
      </View>

      <Modal
        visible={reviewing}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setReviewing(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
            <Text style={styles.sheetTitle}>Your paper</Text>
            <Text style={styles.sheetSub}>
              {answeredCount} of {items.length} answered
              {flagged.length > 0 ? ` · ${flagged.length} flagged` : ''}
            </Text>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {items.map((paperItem, i) => {
                  const done = hasAnswer(paperItem, drafts[paperItem.id] ?? null);
                  const flag = flagged.includes(paperItem.id);
                  return (
                    <Pressable
                      key={paperItem.id}
                      onPress={() => {
                        store.goTo(i);
                        setReviewing(false);
                      }}
                      style={({ pressed }) => [
                        styles.gridCell,
                        done && styles.gridCellDone,
                        flag && styles.gridCellFlag,
                        i === index && styles.gridCellHere,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.gridNum, done && styles.gridNumDone]}>{i + 1}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.sheetActions}>
              <ChunkyButton
                label="Keep working"
                variant="paper"
                size="lg"
                onPress={() => setReviewing(false)}
              />
              <ChunkyButton
                label="Submit paper"
                size="lg"
                onPress={() => {
                  setReviewing(false);
                  setConfirmSubmit(true);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={confirmSubmit}
        title="Submit the paper?"
        message={
          answeredCount < items.length
            ? `${items.length - answeredCount} question${items.length - answeredCount === 1 ? '' : 's'} still blank. Blanks are marked wrong.`
            : 'Everything is answered. You get the whole paper back marked.'
        }
        confirmLabel="Submit"
        cancelLabel="Not yet"
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={() => {
          setConfirmSubmit(false);
          submitPaper();
        }}
      />

      <ConfirmModal
        visible={confirmQuit}
        title="Leave this exam?"
        message="Your answers so far won't be saved."
        confirmLabel="Leave"
        cancelLabel="Keep going"
        destructive
        onCancel={() => setConfirmQuit(false)}
        onConfirm={() => {
          setConfirmQuit(false);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: colors.goldWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 8,
    transform: [{ rotate: '-2deg' }],
  },
  bellText: {
    fontFamily: font.hero,
    fontSize: 15,
    color: colors.gold,
  },
  passingNote: {
    position: 'absolute',
    right: 10,
    top: '38%',
    zIndex: 45,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
    transform: [{ rotate: '3deg' }],
    ...shadow.pop,
  },
  noteFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 12,
    borderTopWidth: 12,
    borderTopColor: colors.surface2,
    borderLeftColor: 'transparent',
  },
  noteText: {
    fontFamily: font.hero,
    fontSize: 15,
    color: colors.textDim,
  },
  fill: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOn: {
    backgroundColor: colors.goldWash,
  },
  helpText: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.textDim,
  },
  counter: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  timer: {
    fontFamily: font.bodyHeavy,
    fontSize: 13.5,
    color: colors.accentDeep,
    fontVariant: ['tabular-nums'],
  },
  timerLow: {
    color: colors.coral,
  },
  hearts: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  track: {
    flex: 1,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill2: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accentDeep,
  },
  /** The per-question countdown, burning down across the whole screen. */
  fuse: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 10,
  },
  fuseFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  offline: {
    marginTop: 10,
  },
  formatChip: {
    width: 30,
    height: 30,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  formatLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.accentDeep,
  },
  deckName: {
    flexShrink: 1,
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  content: {
    paddingTop: 8,
  },
  paperNav: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
  },
  navBtn: {
    flex: 1,
  },
  briefRest: {
    alignSelf: 'stretch',
  },
  skipHint: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 4,
    marginLeft: 29,
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
  },
  skipBox: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.edge,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBoxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accentDeep,
  },
  skipText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textFaint,
  },
  briefFormat: {
    marginTop: 6,
  },
  briefSquiggle: {
    marginTop: 6,
  },
  briefNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: colors.goldWash,
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  briefCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 26,
    alignItems: 'center',
    gap: 8,
    ...shadow.pop,
  },
  briefBadge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    marginBottom: 6,
  },
  briefKicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11.5,
    letterSpacing: 1.4,
    color: colors.accentDeep,
  },
  briefBody: {
    fontFamily: font.hero,
    fontSize: 18,
    lineHeight: 26,
    color: colors.textDim,
    marginTop: 10,
  },
  briefNote: {
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.gold,
    textAlign: 'center',
    marginTop: 4,
  },
  briefBtn: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    ...outline,
    paddingHorizontal: 18,
    paddingTop: 20,
    maxHeight: '82%',
    gap: 4,
  },
  sheetTitle: {
    fontFamily: font.hero,
    fontSize: 26,
    color: colors.text,
  },
  sheetSub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textDim,
  },
  sheetScroll: {
    marginTop: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  gridCell: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellDone: {
    backgroundColor: colors.accentWash,
    borderColor: colors.accentEdge,
  },
  gridCellFlag: {
    backgroundColor: colors.goldWash,
    borderColor: colors.gold,
  },
  gridCellHere: {
    borderWidth: 3,
    borderColor: colors.accentDeep,
  },
  gridNum: {
    fontFamily: font.bodyHeavy,
    fontSize: 14,
    color: colors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  gridNumDone: {
    color: colors.accentDeep,
  },
  sheetActions: {
    gap: 9,
    paddingTop: 14,
  },
  /** The frame a hot run lights up behind everything. */
  glowFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3.5,
    borderColor: '#C24E38',
    borderRadius: 26,
  },
  pressed: {
    opacity: 0.7,
  },
});
