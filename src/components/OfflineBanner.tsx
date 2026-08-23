import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useOnline } from '@/hooks/useOnline';
import { colors, font, radius } from '@/theme/tokens';

interface Props {
  message?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders nothing while online. Gold, not red — in an offline-first app,
 * offline is a supported state to reassure about, not an error.
 */
export function OfflineBanner({ message = '✈ Offline — showing device content', style }: Props) {
  const online = useOnline();
  if (online) return null;

  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.goldWash,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.gold,
  },
});
