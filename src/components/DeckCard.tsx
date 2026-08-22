import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DIFFICULTY_LABEL, type Deck } from '@/lib/types';
import { colors, font, radius } from '@/theme/tokens';

interface Props {
  deck: Deck;
  onDownload?: (deck: Deck) => void;
  onStartQuiz?: (deck: Deck) => void;
}

export function DeckCard({ deck, onDownload, onStartQuiz }: Props) {
  const downloaded = deck.downloadedAt != null;

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{deck.name}</Text>
      <Text style={styles.meta}>
        {DIFFICULTY_LABEL[deck.difficulty]} · {deck.questionCount} questions
      </Text>
      <View style={styles.row}>
        {downloaded ? (
          <>
            <View style={styles.pill}>
              <Text style={styles.pillText}>✓ Downloaded</Text>
            </View>
            <Pressable
              onPress={() => onStartQuiz?.(deck)}
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
              <Text style={styles.btnPrimaryText}>Quiz →</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>On device after download</Text>
            <Pressable
              onPress={() => onDownload?.(deck)}
              style={({ pressed }) => [styles.btnWash, pressed && styles.pressed]}>
              <Text style={styles.btnWashText}>↓ Download</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 14,
    gap: 4,
  },
  name: {
    fontFamily: font.semibold,
    fontSize: 15.5,
    color: colors.text,
  },
  meta: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.textDim,
  },
  row: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  hint: {
    flexShrink: 1,
    fontFamily: font.medium,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  pill: {
    backgroundColor: colors.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    color: colors.accentDeep,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnPrimaryText: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.onAccent,
  },
  btnWash: {
    backgroundColor: colors.accentWash,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnWashText: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.accentDeep,
  },
  pressed: {
    opacity: 0.7,
  },
});
