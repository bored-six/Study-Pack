import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon, type IconName } from '@/components/Icon';
import { Squiggle, Tape } from '@/components/notebook';
import { font, getColors, outlineOn, radius, shadow, useThemeStore } from '@/theme/tokens';

/**
 * What to do on this screen, said once.
 *
 * Adding notes is the only part of Flipp a student cannot work out by
 * poking at it. Everything else is a button that does the obvious thing;
 * this screen asks them to paste something and trust that useful questions
 * come out, and the shapes it can read are not guessable — a line that
 * happens to be "Term: meaning" produces a question and a line that
 * rambles does not, with nothing on screen to say why.
 *
 * Three pages, because there are exactly three things to know: what to
 * paste, what happens when you press the button, and what to do about the
 * questions it cannot make.
 *
 * Shown once and then never again unless asked for, which is the same deal
 * the exam-format briefings make.
 */

interface Page {
  kicker: string;
  title: string;
  icon: IconName;
  body: string;
  /** A line of notes, shown as the student would type it. */
  example?: string;
  /** What that line turns into. */
  becomes?: string;
}

const PAGES: Page[] = [
  {
    kicker: 'STEP ONE',
    title: 'Paste what you already wrote',
    icon: 'pencil',
    body:
      'Flipp reads your notes line by line. It gets the most out of three shapes: a term with its meaning, a plain fact with a number or a name in it, and a short list. Tap one of the examples at the top to drop it in and see.',
    example: 'Chlorophyll: the green pigment that absorbs light',
    becomes: 'Which term means: the green pigment that absorbs light?',
  },
  {
    kicker: 'STEP TWO',
    title: 'Make the questions',
    icon: 'bulb',
    body:
      'Press Make questions and Flipp writes them from your lines — the wrong answers come from the other terms in the same notes, so they are about your subject rather than nonsense. Nothing is saved yet: you see every question first, fix anything it got wrong, name the subject, and only then keep them.',
  },
  {
    kicker: 'STEP THREE',
    title: 'Notes not in those shapes?',
    icon: 'spark',
    body:
      'Real notes are often just paragraphs, and the three shapes above are what Flipp reads best. When your notes are not written that way, Read these with AI takes them as they are — it understands the writing instead of matching a pattern, so it gets questions out of lines the ordinary scan would pass over. It is the one part of Flipp that needs internet, it only ever sees the notes in the box, and you get ten readings a week. The ordinary scan is free, instant, and works with no signal at all.',
    example: 'The treaty was signed in Paris three years after the first shots',
    becomes: 'Where was the treaty signed?',
  },
  {
    kicker: 'STEP FOUR',
    title: 'Write your own',
    icon: 'question',
    body:
      'Some things will not come out of a line of notes — a diagram, a formula, something your teacher said. Write my own question lets you type the question and the right answer yourself. You do not have to invent the wrong ones: Flipp fills those in from your other notes.',
    example: 'Which organelle releases energy from glucose?',
    becomes: 'Mitochondria  ·  and three wrong answers, chosen for you',
  },
];

export function NotesHowTo({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const [page, setPage] = useState(0);

  const current = PAGES[page];
  const last = page === PAGES.length - 1;

  const close = () => {
    setPage(0);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.centering}>
          <View style={styles.card}>
            <Tape />

            <Animated.View key={page} entering={FadeInRight.duration(220)}>
              <Text style={styles.kicker}>{current.kicker}</Text>

              <View style={styles.head}>
                <View style={styles.iconWrap}>
                  <Icon name={current.icon} size={22} color={colors.ink} fill={colors.goldWash} strokeWidth={2} />
                </View>
                <Text style={styles.title}>{current.title}</Text>
              </View>

              <Squiggle width={96} color={colors.accentDeep} style={styles.squiggle} />

              <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyInner}>
                <Text style={styles.body}>{current.body}</Text>

                {current.example ? (
                  <Animated.View entering={FadeIn.delay(140)} style={styles.demo}>
                    <Text style={styles.demoLabel}>YOU WRITE</Text>
                    <Text style={styles.demoLine}>{current.example}</Text>
                    <View style={styles.arrowRow}>
                      <Icon name="play" size={12} color={colors.textFaint} />
                    </View>
                    <Text style={styles.demoLabel}>YOU GET</Text>
                    <Text style={styles.demoLine}>{current.becomes}</Text>
                  </Animated.View>
                ) : null}
              </ScrollView>
            </Animated.View>

            <View style={styles.dots}>
              {PAGES.map((p, i) => (
                <View key={p.kicker} style={[styles.dot, i === page && styles.dotOn]} />
              ))}
            </View>

            <View style={styles.actions}>
              {page > 0 ? (
                <Pressable onPress={() => setPage((p) => p - 1)} hitSlop={8} style={styles.back}>
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
              ) : (
                <Pressable onPress={close} hitSlop={8} style={styles.back}>
                  <Text style={styles.backText}>Skip</Text>
                </Pressable>
              )}
              <ChunkyButton
                label={last ? 'Got it' : 'Next'}
                size="md"
                onPress={() => (last ? close() : setPage((p) => p + 1))}
                style={styles.next}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(26, 33, 28, 0.45)' },
    centering: { flex: 1, justifyContent: 'center', padding: 22 },
    card: {
      backgroundColor: colors.surface,
      ...outlineOn(colors),
      borderRadius: radius.card,
      paddingTop: 26,
      paddingHorizontal: 20,
      paddingBottom: 18,
      maxWidth: 460,
      width: '100%',
      alignSelf: 'center',
      ...shadow.pop,
    },
    kicker: {
      fontFamily: font.bodyHeavy,
      fontSize: 11,
      letterSpacing: 1.4,
      color: colors.textFaint,
      marginBottom: 8,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.goldWash,
      ...outlineOn(colors),
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      fontFamily: font.hero,
      fontSize: 24,
      lineHeight: 27,
      color: colors.text,
    },
    squiggle: { marginTop: 8, marginBottom: 10 },
    /**
     * Fixed, not just capped.
     *
     * The pages are different lengths, so letting the card size to its
     * content moved Next up and down between steps — you press it, the card
     * shrinks, and your thumb is now over nothing. Holding the height still
     * keeps the button under the finger that just tapped it.
     */
    bodyScroll: { height: 232 },
    bodyInner: { paddingBottom: 4 },
    body: {
      fontFamily: font.body,
      fontSize: 15,
      lineHeight: 22,
      color: colors.textDim,
    },
    demo: {
      marginTop: 14,
      backgroundColor: colors.surface2,
      ...outlineOn(colors),
      borderRadius: radius.control,
      padding: 12,
      gap: 3,
    },
    demoLabel: {
      fontFamily: font.bodyHeavy,
      fontSize: 9.5,
      letterSpacing: 1.2,
      color: colors.textFaint,
    },
    demoLine: {
      fontFamily: font.hero,
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
    },
    arrowRow: { alignItems: 'center', paddingVertical: 3, transform: [{ rotate: '90deg' }] },
    dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 16 },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.line,
    },
    dotOn: { backgroundColor: colors.accentDeep, width: 18 },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 14,
    },
    back: { paddingVertical: 8, paddingHorizontal: 6 },
    backText: {
      fontFamily: font.bodyBold,
      fontSize: 14,
      color: colors.textFaint,
    },
    next: { minWidth: 128 },
  });
