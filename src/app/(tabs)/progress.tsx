import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius } from '@/theme/tokens';

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.sub}>Saved on this device</Text>

      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No quizzes yet</Text>
        <Text style={styles.emptyBody}>
          Download a deck and take your first quiz — your scores and streak will live
          here, even offline.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 28,
    color: colors.text,
  },
  sub: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textFaint,
    marginTop: 2,
  },
  empty: {
    backgroundColor: colors.surface,
    borderColor: colors.hairlineSoft,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  emptyTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
  },
});
