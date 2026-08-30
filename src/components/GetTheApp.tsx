import { Platform, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { font, getColors, lightColors, shadow, useThemeStore } from '@/theme/tokens';

/**
 * What the browser cannot do, said plainly.
 *
 * Some of Flipp only works on a phone: reminders need the operating system's
 * notification scheduler, and a browser can drop the local database when it
 * clears site data, so a streak built in a tab is not a streak you can
 * count on.
 *
 * The web version used to answer that with the same empty state a new
 * student sees — "Nothing to show yet" — which reads as *you have not done
 * anything*, not *this cannot work here*. Somebody who had studied for a
 * week would think the app had lost their progress. Saying which one it is
 * costs a sentence.
 *
 * Renders nothing on a real device, so screens can include it unconditionally.
 */
export function GetTheApp({ what }: { what: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name="smartphone" size={26} color={lightColors.ink} />
        <Text style={styles.title}>This bit needs the app</Text>
      </View>
      {/*
        An em dash rather than a verb, so the sentence reads whatever the
        section is called: "Reminders that actually arrive — this needs your
        phone" works where "Reminders that actually arrive works on your
        phone" does not.
      */}
      <Text style={styles.body}>
        {what} — this needs your phone, where Flipp can keep it safely. A browser
        can clear everything it is holding without warning, so the web version is
        for trying Flipp out rather than for keeping a streak.
      </Text>
      <Text style={styles.cta}>Download the app to keep your progress.</Text>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: '#FCEBC0',
      borderWidth: 2,
      borderColor: lightColors.ink,
      borderRadius: 14,
      borderTopLeftRadius: 4,
      padding: 18,
      marginTop: 20,
      transform: [{ rotate: '-0.6deg' }],
      ...shadow.pop,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
      paddingBottom: 9,
      borderBottomWidth: 2,
      borderBottomColor: 'rgba(26, 33, 28, 0.2)',
      borderStyle: 'dashed',
    },
    title: {
      fontFamily: font.hero,
      fontSize: 21,
      color: lightColors.ink,
      top: 1,
    },
    body: {
      fontFamily: font.bodySemibold,
      fontSize: 13.5,
      lineHeight: 19,
      color: lightColors.ink,
    },
    cta: {
      fontFamily: font.bodyHeavy,
      fontSize: 13.5,
      color: lightColors.ink,
      marginTop: 9,
    },
  });
