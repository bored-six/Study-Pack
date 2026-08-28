import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { font, getColors, outline, radius, shadow, useThemeStore } from '@/theme/tokens';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm as a destructive act (delete, discard). */
  destructive?: boolean;
  onCancel: () => void;
  /** Omit for a notice with a single dismiss button. */
  onConfirm?: () => void;
}

/**
 * In-app replacement for Alert.alert: a sticker card in the app's own
 * theme instead of a system dialog. Same conventions as PromptModal.
 */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive,
  onCancel,
  onConfirm,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.centering}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            {onConfirm ? (
              <View style={styles.actions}>
                <ChunkyButton
                  label={cancelLabel}
                  variant="paper"
                  size="md"
                  onPress={onCancel}
                  style={styles.action}
                />
                <ChunkyButton
                  label={confirmLabel}
                  variant={destructive ? 'paper' : 'primary'}
                  size="md"
                  onPress={onConfirm}
                  style={styles.action}
                  labelColor={destructive ? colors.coral : undefined}
                />
              </View>
            ) : (
              <ChunkyButton
                label={confirmLabel}
                size="md"
                onPress={onCancel}
                style={styles.soloAction}
              />
            )}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(39, 54, 43, 0.45)',
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
    padding: 20,
    gap: 10,
    ...shadow.pop,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
  message: {
    fontFamily: font.bodySemibold,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textDim,
    marginTop: -4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  action: {
    flex: 1,
  },
  soloAction: {
    marginTop: 6,
  },
});
