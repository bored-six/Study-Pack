import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { colors, font, outline, radius, shadow, tabClearance } from '@/theme/tokens';
import { useDecksStore } from '@/store/decks';

function SectionHeading({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionBadge}>
        <Icon name={icon} size={14} color={colors.ink} strokeWidth={2.4} />
      </View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { decks, refresh } = useDecksStore();

  // Prefetch the catalog so the Trivia screen opens with data ready.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloadedCount = useMemo(
    () => decks.filter((deck) => deck.downloadedAt != null).length,
    [decks]
  );

  const handleAddNotes = useCallback(() => {
    Alert.alert(
      'Add your notes',
      "Coming next: paste your class notes and Flipp turns them into quiz questions — no internet, no AI needed.",
      [{ text: 'Got it' }]
    );
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>FLIPP</Text>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Let's</Text>
        <View style={styles.titleSticker}>
          <Text style={styles.titleStickerText}>study!</Text>
        </View>
      </View>
      <Text style={styles.sub}>Your own notes, plus trivia to practice on.</Text>

      <OfflineBanner message="Offline — everything saved still works" style={styles.banner} />

      <SectionHeading icon="book" label="MY NOTES" />

      {/* Note decks will list here once the parser lands. */}

      <Pressable
        onPress={handleAddNotes}
        style={({ pressed }) => [styles.notesCard, pressed && styles.pressed]}>
        <View style={styles.notesBadge}>
          <Icon name="bulb" size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Add your notes</Text>
          <Text style={styles.cardBody}>
            Paste notes from class and we'll turn them into a quiz you can take anywhere.
          </Text>
        </View>
      </Pressable>

      <SectionHeading icon="dice" label="TRIVIA" />

      <Pressable
        onPress={() => router.push('/trivia')}
        style={({ pressed }) => [styles.triviaCard, pressed && styles.pressed]}>
        <View style={styles.triviaBadge}>
          <Icon name="dice" size={26} color={colors.ink} fill={colors.surface} strokeWidth={1.9} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Browse trivia</Text>
          <Text style={styles.cardBody}>
            {decks.length > 0
              ? `${decks.length} practice decks${
                  downloadedCount > 0 ? ` · ${downloadedCount} saved offline` : ''
                }`
              : 'Practice decks from Open Trivia DB'}
          </Text>
        </View>
        <Text style={styles.chevron}>→</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: tabClearance,
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 32,
    lineHeight: 42,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.accent,
    ...outline,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-2.5deg' }],
    ...shadow.card,
  },
  titleStickerText: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 1,
  },
  banner: {
    marginTop: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 11,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  sectionLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.text,
  },
  sectionRule: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.lineSoft,
  },
  notesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accentWash,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    ...shadow.card,
  },
  triviaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 14,
    ...shadow.card,
  },
  notesBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  triviaBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '3deg' }],
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: font.heading,
    fontSize: 16.5,
    lineHeight: 21,
    color: colors.text,
  },
  cardBody: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textDim,
    marginTop: 1,
  },
  chevron: {
    fontFamily: font.heading,
    fontSize: 19,
    color: colors.accentDeep,
  },
  pressed: {
    opacity: 0.8,
  },
});
