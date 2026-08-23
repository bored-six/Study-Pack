import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { buttonEdge, colors, font, outline, radius } from '@/theme/tokens';

type Variant = 'primary' | 'soft' | 'paper';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  icon?: IconName;
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
  icon,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
}: Props) {
  const contentColor = disabled ? colors.disabledText : labelStyles[variant].color;
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
            {icon ? (
              <Icon
                name={icon}
                size={iconSizes[size]}
                color={contentColor}
                strokeWidth={2.4}
              />
            ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  paper: { backgroundColor: '#DCD5C0' },
};

const faceStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent, ...outline },
  soft: { backgroundColor: colors.accentWash, ...outline },
  paper: { backgroundColor: colors.surface, ...outline },
};

const labelStyles = {
  primary: { color: colors.ink },
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

const iconSizes: Record<Size, number> = {
  sm: 15,
  md: 17,
  lg: 19,
};
