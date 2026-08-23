import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { DIFFICULTY_LABEL, type Deck } from '@/lib/types';
import { candy, colors, font, radius, shadow } from '@/theme/tokens';

interface Props {
  deck: Deck;
  downloading?: boolean;
  onDownload?: (deck: Deck) => void;
  onRemove?: (deck: Deck) => void;
  onStartQuiz?: (deck: Deck) => void;
}

const EMOJI_BY_KEYWORD: [string, string][] = [
  ['science', '🔬'],
  ['nature', '🌿'],
  ['computer', '💻'],
  ['math', '➗'],
  ['history', '🏛️'],
  ['geograph', '🗺️'],
  ['sport', '🏆'],
  ['music', '🎵'],
  ['film', '🎬'],
  ['television', '📺'],
  ['video game', '🎮'],
  ['game', '🎲'],
  ['book', '📚'],
  ['art', '🎨'],
  ['animal', '🐾'],
  ['mytholog', '⚡'],
  ['celebrit', '⭐'],
  ['politic', '🗳️'],
  ['vehicle', '🚗'],
  ['anime', '🌸'],
  ['comic', '💥'],
  ['gadget', '📱'],
];

function deckEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, emoji] of EMOJI_BY_KEYWORD) {
    if (lower.includes(keyword)) return emoji;
  }
  return '🧠';
}

/** Stable candy wash per deck so cards keep their color while filtering. */
function deckCandy(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return candy[hash % candy.length];
}

export function DeckCard({ deck, downloading, onDownload, onRemove, onStartQuiz }: Props) {
  const downloaded = deck.downloadedAt != null;
  const tone = deckCandy(deck.id);

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: tone.wash }]}>
          <Text style={styles.badgeEmoji}>{deckEmoji(deck.name)}</Text>
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.name}>{deck.name}</Text>
          <Text style={styles.meta}>
            {DIFFICULTY_LABEL[deck.difficulty]} · {deck.questionCount} questions
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        {downloaded ? (
          <>
            <Pressable
              onPress={() => onRemove?.(deck)}
              style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
              <Text style={styles.pillText}>✓ Saved</Text>
            </Pressable>
            <ChunkyButton label="Play →" size="sm" onPress={() => onStartQuiz?.(deck)} />
          </>
        ) : downloading ? (
          <View style={styles.downloadingRow}>
            <ActivityIndicator size="small" color={colors.accentDeep} />
            <Text style={styles.downloadingText}>Downloading…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>Save it to play offline</Text>
            <ChunkyButton
              label="↓ Download"
              variant="soft"
              size="sm"
              onPress={() => onDownload?.(deck)}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1.5,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
    ...shadow.card,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: {
    fontSize: 22,
  },
  titleWrap: {
    flex: 1,
  },
  name: {
    fontFamily: font.heading,
    fontSize: 16.5,
    lineHeight: 21,
    color: colors.text,
  },
  meta: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textDim,
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 38,
  },
  hint: {
    flexShrink: 1,
    fontFamily: font.bodySemibold,
    fontSize: 12,
    color: colors.textFaint,
  },
  downloadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadingText: {
    fontFamily: font.bodyBold,
    fontSize: 13,
    color: colors.accentDeep,
  },
  pill: {
    backgroundColor: colors.accentWash,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: colors.accentDeep,
  },
  pressed: {
    opacity: 0.7,
  },
});
