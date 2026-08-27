import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AchievementSticker } from '@/components/AchievementSticker';
import { ChunkyButton } from '@/components/ChunkyButton';
import { Icon } from '@/components/Icon';
import { Tape } from '@/components/notebook';
import { achievementById, LOCKED_NOTE, type Unlock } from '@/lib/achievements';
import { playSfx } from '@/lib/sfx';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

interface Props {
  visible: boolean;
  /** The unlocks to reveal, one card at a time. Empty + lockedTap = locked view. */
  unlocks: readonly Unlock[];
  /** Index into unlocks currently shown. */
  index?: number;
  /** True when showing a locked tile that was tapped. */
  locked?: boolean;
  onNext?: () => void;
  onClose: () => void;
}

/**
 * The reveal: a taped sticker card holding the achievement's hand-written
 * note. Locked achievements get the same card but give nothing away.
 */
export function AchievementModal({
  visible,
  unlocks,
  index = 0,
  locked,
  onNext,
  onClose,
}: Props) {
  const unlock = unlocks[index];
  const def = unlock ? achievementById(unlock.id) : undefined;
  const hasMore = index < unlocks.length - 1;

  useEffect(() => {
    if (visible && !locked) {
      playSfx('victory_derp');
    }
  }, [visible, index, locked]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.centering}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Tape />
            {locked || !def ? (
              <View style={[styles.badge, styles.badgeLocked]}>
                <Icon name="question" size={34} color={colors.ink} fill={colors.surface2} />
              </View>
            ) : (
              // The exact sticker that lands in the album — reveal and
              // keepsake must be the same object, or the album feels
              // like it swapped something on you.
              <View style={styles.stickerWrap}>
                <AchievementSticker family={def.family} icon={def.icon} size={96} />
              </View>
            )}

            {locked ? (
              <>
                <Text style={styles.title}>Not yet</Text>
                <Text style={styles.note}>{LOCKED_NOTE}</Text>
              </>
            ) : (
              <>
                <Text style={styles.kicker}>ACHIEVEMENT FOUND</Text>
                <Text style={styles.title}>{def?.title ?? ''}</Text>
                <Text style={styles.note}>{unlock?.note ?? ''}</Text>
              </>
            )}

            <ChunkyButton
              label={hasMore ? 'Next' : locked ? 'Back' : 'Keep going'}
              size="lg"
              onPress={hasMore && onNext ? onNext : onClose}
              style={styles.button}
            />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.5)',
  },
  centering: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  card: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 24,
    paddingTop: 28,
    alignItems: 'center',
    ...shadow.pop,
  },
  badge: {
    width: 72,
    height: 72,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.edge,
    backgroundColor: colors.goldWash,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    marginBottom: 12,
  },
  badgeLocked: {
    backgroundColor: colors.surface2,
  },
  stickerWrap: {
    marginBottom: 10,
    transform: [{ rotate: '-3deg' }],
  },
  kicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 10.5,
    letterSpacing: 1.8,
    color: colors.gold,
    marginBottom: 2,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
    textAlign: 'center',
  },
  note: {
    fontFamily: font.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
});
