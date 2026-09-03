import {
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
} from '@expo-google-fonts/baloo-2';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import {
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IntroOverlay } from '@/components/IntroOverlay';
import { initDb } from '@/lib/db';
import { initPrefs } from '@/lib/prefs';
import { font, getColors, useThemeStore } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

type DbState = 'pending' | 'ready' | 'error';

export default function RootLayout() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const [fontsLoaded, fontError] = useFonts({
    PatrickHand_400Regular,
    Baloo2_600SemiBold,
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [dbState, setDbState] = useState<DbState>('pending');
  const [dbError, setDbError] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(false);
  // Settled with the database, so the intro is never shown to someone who
  // turned it off and then yanked away a frame later.
  const [playIntro, setPlayIntro] = useState(true);

  useEffect(() => {
    initDb()
      .then(async () => {
        // Preferences live in the database, so they can only be read once
        // it is open. A failure here costs the defaults, not the launch.
        try {
          const prefs = await initPrefs();
          setPlayIntro(prefs.intro);
        } catch (e) {
          console.warn('Could not read preferences', e);
        }
        setDbState('ready');
      })
      .catch((e) => {
        console.error('Database init failed', e);
        setDbError(String(e?.message ?? e));
        setDbState('error');
      });
  }, []);

  const settled = (fontsLoaded || fontError != null) && dbState !== 'pending';

  useEffect(() => {
    if (settled) {
      void SplashScreen.hideAsync();
    }
  }, [settled]);

  /**
   * The name in the browser tab, on a bookmark, and on a shared link.
   *
   * Rendered in every branch below, including the one that returns while
   * fonts and the database are still opening. The static web export
   * snapshots this component before either of those settles, so a title
   * placed only in the happy path never reaches the exported HTML — which
   * is exactly how the site came to ship an empty <title> and show its URL
   * where its name should be.
   *
   * Expo Router emits the document's first <title>, and a browser honours
   * the first one, so this is the only place that can fill it. No-ops on a
   * phone.
   */
  const documentTitle = (
    <Head>
      <title>Flipp</title>
    </Head>
  );

  if (!settled) {
    return documentTitle;
  }

  if (dbState === 'error') {
    return (
      <>
        {documentTitle}
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Storage failed to start</Text>
          <Text style={styles.errorBody}>
            Flipp couldn&apos;t open its local database. Restart the app; if it keeps
            happening, reinstall.
          </Text>
          {dbError ? <Text style={styles.errorDetail}>{dbError}</Text> : null}
        </View>
      </>
    );
  }

  return (
    <>
      {documentTitle}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      />
      {playIntro && !introDone ? <IntroOverlay onDone={() => setIntroDone(true)} /> : null}
    </>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  errorScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  errorTitle: {
    fontFamily: font.heading,
    fontSize: 18,
    color: colors.text,
  },
  errorBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
  },
  // Shown so a tester can screenshot the actual failure instead of relaying
  // "it doesn't work" and leaving us to guess at the cause.
  errorDetail: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.7,
  },
});
