import { StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Tape } from '@/components/notebook';
import type { Debrief, DebriefNote, NextStep } from '@/lib/debrief';
import { font, getColors, outlineOn, radius, shadow, useThemeStore } from '@/theme/tokens';

/**
 * The marker's note under the score.
 *
 * Three labelled lines and one instruction. It was three lines a section
 * once, and a paragraph of feedback after a paper is a paragraph nobody
 * reads — the lib keeps only the strongest line, and this shows it flat.
 */

function Line({ label, notes, ink }: { label: string; notes: DebriefNote[]; ink: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  // Nothing true to put here means nothing goes here.
  const note = notes[0];
  if (!note) return null;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: ink }]}>{label}</Text>
      <Text style={styles.text}>{note.text}</Text>
    </View>
  );
}

export function ExamDebrief({
  debrief,
  onAction,
}: {
  debrief: Debrief;
  onAction: (next: NextStep) => void;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const { wrong, strengths, weaknesses, next } = debrief;
  const anything = wrong.length + strengths.length + weaknesses.length > 0;

  return (
    <>
      {anything ? (
        <View style={styles.card}>
          <Tape rotate="3deg" />
          <Line label="LOST" notes={wrong} ink={colors.textDim} />
          <Line label="WORKING" notes={strengths} ink={colors.leaf} />
          <Line label="WEAK" notes={weaknesses} ink={colors.coral} />
        </View>
      ) : null}

      <View style={styles.nextCard}>
        <Text style={styles.nextLabel}>DO THIS NEXT</Text>
        <Text style={styles.nextTitle}>{next.title}</Text>
        <Text style={styles.nextBody}>{next.body}</Text>
        {next.action !== 'none' && next.actionLabel ? (
          <ChunkyButton
            label={next.actionLabel}
            size="md"
            onPress={() => onAction(next)}
            style={styles.nextBtn}
          />
        ) : null}
      </View>
    </>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: colors.surface,
    ...outlineOn(colors),
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 14,
    gap: 10,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  label: {
    width: 62,
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 1.1,
    lineHeight: 18,
  },
  text: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  nextCard: {
    marginTop: 10,
    backgroundColor: colors.accentWash,
    ...outlineOn(colors),
    borderRadius: radius.card,
    padding: 15,
    gap: 4,
    ...shadow.card,
  },
  nextLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.accentDeep,
  },
  nextTitle: {
    fontFamily: font.heading,
    fontSize: 16.5,
    lineHeight: 21,
    color: colors.text,
  },
  nextBody: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textDim,
  },
  nextBtn: {
    marginTop: 8,
  },
});
