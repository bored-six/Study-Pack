import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { buttonEdge, font, getColors, outlineOn, radius, useThemeStore } from '@/theme/tokens';

type Variant = 'primary' | 'soft' | 'paper';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  /** Overrides the variant's label colour (e.g. coral for destructive). */
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
}

import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/**
 * Chunky 3D button: a colored "edge" shell with a face that smoothly presses down.
 */
export function ChunkyButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  labelColor,
  style,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const shellStyles = shellStylesFor(colors);
  const faceStyles = faceStylesFor(colors);
  const labelStyles = labelStylesFor(colors);

  const contentColor = disabled
    ? colors.disabledText
    : (labelColor ?? labelStyles[variant].color);

  const pressY = useSharedValue(0);

  const animatedFaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pressY.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={style}
      onPressIn={() => {
        if (!disabled) pressY.value = withSpring(buttonEdge, { stiffness: 500, damping: 25 });
      }}
      onPressOut={() => {
        if (!disabled) pressY.value = withSpring(0, { stiffness: 500, damping: 25 });
      }}
    >
      {() => (
        <View style={[styles.shell, shellStyles[variant], disabled && styles.shellDisabled]}>
          <Animated.View
            style={[
              styles.face,
              faceSizes[size],
              faceStyles[variant],
              animatedFaceStyle,
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
                labelColor != null && { color: labelColor },
                disabled && styles.labelDisabled,
              ]}>
              {label}
            </Text>
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  shell: {
    borderRadius: radius.control,
    paddingBottom: buttonEdge, // Reserve the 3D edge space
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
  faceDisabled: {
    backgroundColor: colors.disabledBg,
    borderWidth: 0,
    transform: [{ translateY: buttonEdge }], // disabled state is permanently flat
  },
  label: {
    fontFamily: font.heading,
  },
  labelDisabled: {
    color: colors.disabledText,
  },
});

const shellStylesFor = (colors: any): Record<Variant, ViewStyle> => ({
  primary: { backgroundColor: colors.accentEdge },
  soft: { backgroundColor: '#BCDDB9' },
  paper: { backgroundColor: '#DCD5C0' },
});

const faceStylesFor = (colors: any): Record<Variant, ViewStyle> => ({
  primary: { backgroundColor: colors.accent, ...outlineOn(colors) },
  soft: { backgroundColor: colors.accentWash, ...outlineOn(colors) },
  paper: { backgroundColor: colors.surface, ...outlineOn(colors) },
});

const labelStylesFor = (colors: any) => ({
  primary: { color: colors.ink },
  soft: { color: colors.accentDeep },
  paper: { color: colors.text },
});

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
