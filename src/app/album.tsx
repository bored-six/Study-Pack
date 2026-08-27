import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AchievementModal } from '@/components/AchievementModal';
import { AchievementSticker } from '@/components/AchievementSticker';
import { Icon } from '@/components/Icon';
import { RuledPaper } from '@/components/notebook';
import {
  ACHIEVEMENTS,
  FAMILY_LABEL,
  FAMILY_ORDER,
  type AchievementDef,
  type Unlock,
} from '@/lib/achievements';
import { useAchievementsStore } from '@/store/achievements';
import { derpRadius, font, outline, shadow, useThemeStore, getColors } from '@/theme/tokens';

const FAMILY_INK: Record<string, string> = {
  tally: '#AC761C',
  fire: '#C24E38',
  knowledge: '#2C8A4A',
  promises: '#2E6FA3',
  character: '#6C51A8',
};

/**
 * The album: every sticker in the set, on five named shelves of six.
 *
 * Locked slots are the pressed outline of their family shape and nothing
 * more — tapping one says only that it hasn't found you yet. The page is
 * a keepsake, not a checklist, so no slot ever shows a requirement or a
 * progress bar towards itself.
 */
export default function AlbumScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const { unlocked, refresh } = useAchievementsStore();
  const [viewing, setViewing] = useState<Unlock | null>(null);
  const [lockedTapped, setLockedTapped] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const unlockById = useMemo(() => {
    const map = new Map<string, Unlock>();
    for (const unlock of unlocked) map.set(unlock.id, unlock);
    return map;
  }, [unlocked]);

  const shelves = useMemo(
    () =>
      FAMILY_ORDER.map((family) => ({
        family,
        label: FAMILY_LABEL[family],
        items: ACHIEVEMENTS.filter((a) => a.family === family),
      })),
    []
  );

  const renderSlot = (def: AchievementDef) => {
    const unlock = unlockById.get(def.id);
    return (
      <Pressable
        key={def.id}
        onPress={() => (unlock ? setViewing(unlock) : setLockedTapped(true))}
        accessibilityLabel={unlock ? def.title : 'Locked sticker'}
        style={({ pressed }) => [styles.slot, pressed && { opacity: 0.75 }]}>
        <AchievementSticker
          family={def.family}
          icon={unlock ? def.icon : undefined}
          size={52}
          isDark={isDark}
        />
        <Text style={[styles.slotTitle, !unlock && styles.slotTitleLocked]} numberOfLines={2}>
          {unlock ? def.title : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <RuledPaper />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}>

        <View style={styles.headRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <Icon name="play" size={16} color={colors.ink} />
          </Pressable>
          <Text style={styles.kicker}>FLIPP</Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>The album</Text>
          <Text style={styles.count}>
            {unlocked.length} / {ACHIEVEMENTS.length}
          </Text>
        </View>
        <Text style={styles.sub}>
          Nothing here can be chased. They find you as you keep going.
        </Text>

        {shelves.map((shelf) => (
          <View key={shelf.family} style={styles.shelf}>
            <View style={styles.shelfHead}>
              <Text style={[styles.shelfLabel, { color: FAMILY_INK[shelf.family] }]}>
                {shelf.label}
              </Text>
              <View style={styles.shelfRule} />
              <Text style={styles.shelfCount}>
                {shelf.items.filter((i) => unlockById.has(i.id)).length}/{shelf.items.length}
              </Text>
            </View>
            <View style={styles.shelfGrid}>{shelf.items.map(renderSlot)}</View>
          </View>
        ))}
      </ScrollView>

      <AchievementModal
        visible={viewing != null}
        unlocks={viewing ? [viewing] : []}
        onClose={() => setViewing(null)}
      />
      <AchievementModal
        visible={lockedTapped}
        unlocks={[]}
        locked
        onClose={() => setLockedTapped(false)}
      />
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '180deg' }],
    ...shadow.card,
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.accentDeep,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 34,
    lineHeight: 42,
    color: colors.text,
  },
  count: {
    fontFamily: font.hero,
    fontSize: 20,
    color: colors.gold,
  },
  sub: {
    fontFamily: font.bodySemibold,
    fontSize: 12.5,
    color: colors.textFaint,
    marginTop: -2,
    marginBottom: 4,
  },
  shelf: {
    marginTop: 16,
    backgroundColor: colors.surface,
    ...outline,
    ...derpRadius,
    paddingVertical: 12,
    paddingHorizontal: 10,
    ...shadow.card,
  },
  shelfHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  shelfLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  shelfRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.track,
  },
  shelfCount: {
    fontFamily: font.bodyBold,
    fontSize: 10,
    color: colors.textFaint,
  },
  shelfGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  slot: {
    width: '31%',
    alignItems: 'center',
    gap: 2,
  },
  slotTitle: {
    fontFamily: font.bodyBold,
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
    color: colors.textDim,
    minHeight: 22,
  },
  slotTitleLocked: {
    color: 'transparent',
  },
});
