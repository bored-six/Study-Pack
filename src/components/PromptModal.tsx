import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ChunkyButton } from '@/components/ChunkyButton';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxLength?: number;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/**
 * In-app replacement for Alert.prompt, which is iOS-only and renders as a
 * system dialog. This one is a sticker card in the app's own theme and
 * behaves identically on both platforms.
 */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  confirmLabel = 'Create',
  maxLength = 40,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');

  // Start empty every time it opens.
  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  const ready = value.trim().length > 0;
  const submit = () => {
    if (ready) onConfirm(value.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centering}>
          {/* Swallow taps inside the card so they don't dismiss it. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              maxLength={maxLength}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submit}
            />

            <View style={styles.actions}>
              <ChunkyButton
                label="Cancel"
                variant="paper"
                size="md"
                onPress={onCancel}
                style={styles.action}
              />
              <ChunkyButton
                label={confirmLabel}
                size="md"
                disabled={!ready}
                onPress={submit}
                style={styles.action}
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 13,
    lineHeight: 18,
    color: colors.textDim,
    marginTop: -4,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.bodyBold,
    fontSize: 15.5,
    color: colors.text,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  action: {
    flex: 1,
  },
});
