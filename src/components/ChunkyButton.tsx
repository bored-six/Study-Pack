import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { buttonEdge, colors, font, radius } from '@/theme/tokens';

type Variant = 'primary' | 'soft' | 'paper';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Chunky 3D button: a colored "edge" shell with a face that drops down
 * onto it while pressed. Pure layout (no transforms), constant height.
 */
export function ChunkyButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
}: Props) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={style}>
      {({ pressed }) => (
        <View style={[styles.shell, shellStyles[variant], disabled && styles.shellDisabled]}>
          <View
            style={[
              styles.face,
              faceSizes[size],
              faceStyles[variant],
              pressed && !disabled ? styles.facePressed : styles.faceRaised,
              disabled && styles.faceDisabled,
            ]}>
            <Text
              style={[
                styles.label,
                labelSizes[size],
                labelStyles[variant],
                disabled && styles.labelDisabled,
              ]}>
              {label}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radius.control,
  },
  shellDisabled: {
    backgroundColor: colors.disabledBg,
  },
  face: {
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceRaised: {
    marginBottom: buttonEdge,
  },
  facePressed: {
    marginTop: buttonEdge,
  },
  faceDisabled: {
    backgroundColor: colors.disabledBg,
    borderWidth: 0,
  },
  label: {
    fontFamily: font.heading,
  },
  labelDisabled: {
    color: colors.disabledText,
  },
});

const shellStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accentEdge },
  soft: { backgroundColor: '#BCDDB9' },
  paper: { backgroundColor: colors.line },
};

const faceStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  soft: { backgroundColor: colors.accentWash },
  paper: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
};

const labelStyles = {
  primary: { color: colors.onAccent },
  soft: { color: colors.accentDeep },
  paper: { color: colors.text },
} as const;

const faceSizes: Record<Size, ViewStyle> = {
  sm: { paddingHorizontal: 14, paddingVertical: 7 },
  md: { paddingHorizontal: 16, paddingVertical: 10 },
  lg: { paddingVertical: 14, alignSelf: 'stretch' },
};

const labelSizes = {
  sm: { fontSize: 14, lineHeight: 18 },
  md: { fontSize: 15, lineHeight: 20 },
  lg: { fontSize: 17, lineHeight: 22 },
} as const;
