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
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IntroOverlay } from '@/components/IntroOverlay';
import { initDb } from '@/lib/db';
import { colors, font } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

type DbState = 'pending' | 'ready' | 'error';

export default function RootLayout() {
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
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    initDb()
      .then(() => setDbState('ready'))
      .catch((e) => {
        console.error('Database init failed', e);
        setDbState('error');
      });
  }, []);

  const settled = (fontsLoaded || fontError != null) && dbState !== 'pending';

  useEffect(() => {
    if (settled) {
      void SplashScreen.hideAsync();
    }
  }, [settled]);

  if (!settled) {
    return null;
  }

  if (dbState === 'error') {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Storage failed to start</Text>
        <Text style={styles.errorBody}>
          Flipp couldn't open its local database. Restart the app; if it keeps
          happening, reinstall.
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {!introDone ? <IntroOverlay onDone={() => setIntroDone(true)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
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
});
