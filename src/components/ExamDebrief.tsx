import { StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { Tape } from '@/components/notebook';
import type { Debrief, DebriefNote, NextStep } from '@/lib/debrief';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

/**
 * The marker's note under the score.
 *
 * Laid out as one taped-on note rather than three separate cards, because
 * it is meant to be read straight through — how the marks went, what held
 * up, what didn't — and then acted on once at the bottom.
 */

function Note({ note, ink, wash }: { note: DebriefNote; ink: string; wash: string }) {
  return (
    <View style={styles.note}>
      <View style={[styles.noteIcon, { backgroundColor: wash }]}>
        <Icon name={note.icon} size={13} color={ink} fill={wash} strokeWidth={2.2} />
      </View>
      <Text style={styles.noteText}>{note.text}</Text>
    </View>
  );
}

function Section({
  label,
  notes,
  ink,
  wash,
}: {
  label: string;
  notes: DebriefNote[];
  ink: string;
  wash: string;
}) {
  // Silence beats a padded-out section: an empty one means this paper had
  // nothing to say there, and saying it anyway is how the whole note stops
  // being worth reading.
  if (notes.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: ink }]}>{label}</Text>
      {notes.map((note) => (
        <Note key={note.id} note={note} ink={ink} wash={wash} />
      ))}
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
  const { subhead, wrong, strengths, weaknesses, next } = debrief;

  return (
    <>
      <View style={styles.card}>
        <Tape rotate="3deg" />
        <Text style={styles.subhead}>{subhead}</Text>

        <Section
          label="WHERE THE MARKS WENT"
          notes={wrong}
          ink={colors.textDim}
          wash={colors.surface2}
        />
        <Section
          label="WHAT'S WORKING"
          notes={strengths}
          ink={colors.leaf}
          wash={colors.leafWash}
        />
        <Section
          label="WHAT NEEDS WORK"
          notes={weaknesses}
          ink={colors.coral}
          wash={colors.coralWash}
        />
      </View>

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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 14,
    ...shadow.card,
  },
  subhead: {
    fontFamily: font.hero,
    fontSize: 19,
    lineHeight: 24,
    color: colors.text,
  },
  section: {
    gap: 9,
  },
  sectionLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    letterSpacing: 1.3,
  },
  note: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
  },
  noteIcon: {
    width: 23,
    height: 23,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  noteText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  nextCard: {
    marginTop: 12,
    backgroundColor: colors.accentWash,
    ...outline,
    borderRadius: radius.card,
    padding: 16,
    gap: 6,
    ...shadow.card,
  },
  nextLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    letterSpacing: 1.3,
    color: colors.accentDeep,
  },
  nextTitle: {
    fontFamily: font.heading,
    fontSize: 17,
    lineHeight: 22,
    color: colors.text,
  },
  nextBody: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textDim,
  },
  nextBtn: {
    marginTop: 8,
  },
});
