import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon, type IconName } from '@/components/Icon';
import { DIFFICULTY_LABEL, type Deck } from '@/lib/types';
import { candy, colors, font, outline, radius, shadow } from '@/theme/tokens';

interface Props {
  deck: Deck;
  /** Alternate per row for the loose sticker-sheet look. */
  tilt?: 'left' | 'right';
  downloading?: boolean;
  onDownload?: (deck: Deck) => void;
  onRemove?: (deck: Deck) => void;
  onStartQuiz?: (deck: Deck) => void;
}

const ICON_BY_KEYWORD: [string, IconName][] = [
  ['science', 'flask'],
  ['nature', 'leaf'],
  ['computer', 'monitor'],
  ['math', 'calculator'],
  ['history', 'museum'],
  ['geograph', 'globe'],
  ['sport', 'trophy'],
  ['music', 'note'],
  ['film', 'clapper'],
  ['television', 'tv'],
  ['video game', 'gamepad'],
  ['game', 'dice'],
  ['book', 'book'],
  ['art', 'palette'],
  ['animal', 'paw'],
  ['mytholog', 'bolt'],
  ['celebrit', 'star'],
  ['politic', 'flag'],
  ['vehicle', 'car'],
  ['anime', 'flower'],
  ['comic', 'burst'],
  ['gadget', 'smartphone'],
];

function deckIcon(name: string): IconName {
  const lower = name.toLowerCase();
  for (const [keyword, icon] of ICON_BY_KEYWORD) {
    if (lower.includes(keyword)) return icon;
  }
  return 'bulb';
}

/** Stable candy wash per deck so cards keep their color while filtering. */
function deckCandy(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return candy[hash % candy.length];
}

export function DeckCard({ deck, tilt, downloading, onDownload, onRemove, onStartQuiz }: Props) {
  const downloaded = deck.downloadedAt != null;
  const tone = deckCandy(deck.id);

  return (
    <View
      style={[
        styles.card,
        tilt ? { transform: [{ rotate: tilt === 'left' ? '-0.6deg' : '0.6deg' }] } : null,
      ]}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: tone.wash }]}>
          <Icon
            name={deckIcon(deck.name)}
            size={26}
            color={colors.ink}
            fill={colors.surface}
            strokeWidth={1.9}
          />
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
              <Icon name="check" size={13} color={colors.accentDeep} strokeWidth={2.6} />
              <Text style={styles.pillText}>Saved</Text>
            </Pressable>
            <ChunkyButton
              label="Play"
              icon="play"
              size="sm"
              onPress={() => onStartQuiz?.(deck)}
            />
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
              label="Download"
              icon="download"
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
    ...outline,
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
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentWash,
    borderWidth: 1.5,
    borderColor: colors.edge,
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
