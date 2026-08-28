import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { FORMAT_LABEL, type ExamFormat } from '@/lib/exam';
import { font, getColors, useThemeStore , lightColors } from '@/theme/tokens';

/**
 * One visual identity per exam format — same icon and colour on the
 * briefing, in the header, and anywhere else the format is named, so a
 * glance says what kind of paper this is before a word is read.
 */
export const FORMAT_META: Record<
  ExamFormat,
  { icon: IconName; wash: string; ink: string }
> = {
  multiple_choice: { icon: 'cards', wash: '#DBEEFB', ink: '#2E6FA3' },
  true_false: { icon: 'check', wash: lightColors.leafWash, ink: lightColors.leaf },
  modified_true_false: { icon: 'pencil', wash: lightColors.coralWash, ink: lightColors.coral },
  identification: { icon: 'bulb', wash: lightColors.goldWash, ink: lightColors.gold },
  fill_blank: { icon: 'bolt', wash: '#EAE2FA', ink: '#6C51A8' },
  matching: { icon: 'dice', wash: '#FFE5D2', ink: '#BC5A2E' },
  enumeration: { icon: 'calculator', wash: lightColors.accentWash, ink: lightColors.accentDeep },
};

interface Props {
  format: ExamFormat;
  size?: 'sm' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export function FormatBadge({ format, size = 'sm', style }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const meta = FORMAT_META[format];
  const large = size === 'lg';

  return (
    <View
      style={[
        styles.badge,
        large && styles.badgeLg,
        { backgroundColor: meta.wash },
        style,
      ]}>
      <Icon
        name={meta.icon}
        size={large ? 26 : 15}
        color={colors.ink}
        fill={colors.surface}
        strokeWidth={large ? 1.9 : 2.2}
      />
      <Text style={[styles.label, large && styles.labelLg, { color: meta.ink }]}>
        {FORMAT_LABEL[format]}
      </Text>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.edge,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
    transform: [{ rotate: '-1.5deg' }],
  },
  badgeLg: {
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    transform: [{ rotate: '-2.5deg' }],
  },
  label: {
    fontFamily: font.heading,
    fontSize: 13,
  },
  labelLg: {
    fontFamily: font.hero,
    fontSize: 22,
    lineHeight: 28,
  },
});
