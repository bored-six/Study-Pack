import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { useOnline } from '@/hooks/useOnline';
import { font, getColors, radius, useThemeStore } from '@/theme/tokens';

interface Props {
  message?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders nothing while online. Gold, not red — in an offline-first app,
 * offline is a supported state to reassure about, not an error.
 */
export function OfflineBanner({ message = 'Offline — showing device content', style }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const online = useOnline();
  if (online) return null;

  return (
    <View style={[styles.banner, style]}>
      <Icon name="plane" size={15} color={colors.gold} strokeWidth={2.2} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.goldWash,
    borderColor: 'rgba(172, 118, 28, 0.22)',
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    flexShrink: 1,
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.gold,
  },
});
