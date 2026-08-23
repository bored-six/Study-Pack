import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ComboMeter } from '@/components/ComboMeter';
import { ExamItemView } from '@/components/ExamItemView';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { FORMAT_HOWTO, FORMAT_LABEL } from '@/lib/exam';
import { useExamStore } from '@/store/exam';
import { colors, font, outline, radius, shadow } from '@/theme/tokens';

export default function ExamRunScreen() {
  const insets = useSafeAreaInsets();
  const { status, deck, items, index, briefed, markBriefed, submit } = useExamStore();
  const [showHelp, setShowHelp] = useState(false);
  const [combo, setCombo] = useState(0);
  const glow = useSharedValue(0);

  // A soft frame around the screen once a run gets hot.
  useEffect(() => {
    if (combo >= 10) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0.4, { duration: 900 })
        ),
        -1,
        false
      );
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [combo, glow]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.55 }));

  const handleQuit = useCallback(() => {
    Alert.alert('Leave this exam?', "Your answers so far won't be saved.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  }, []);

  const handleDone = useCallback(
    (correct: boolean) => {
      setCombo((c) => (correct ? c + 1 : 0));
      void submit(correct).then((next) => {
        if (next === 'finished') router.replace('/exam/results');
      });
    },
    [submit]
  );

  if (status !== 'active') {
    return <Redirect href="/" />;
  }

  const item = items[index];
  if (!item) return null;

  const needsBriefing = !briefed.includes(item.format);
  const progress = index / items.length;

  // Introduce each format the first time it comes up in this sitting.
  if (needsBriefing || showHelp) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + 10 }]}>
        <View style={styles.briefCard}>
          <View style={styles.briefBadge}>
            <Icon name="bulb" size={28} color={colors.ink} fill={colors.accentWash} strokeWidth={1.9} />
          </View>
          <Text style={styles.briefKicker}>{FORMAT_LABEL[item.format].toUpperCase()}</Text>
          <Text style={styles.briefBody}>{FORMAT_HOWTO[item.format]}</Text>
          <ChunkyButton
            label="Got it"
            size="lg"
            onPress={() => {
              markBriefed(item.format);
              setShowHelp(false);
            }}
            style={styles.briefBtn}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleQuit}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Icon name="cross" size={14} color={colors.textDim} strokeWidth={2.6} />
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} / {items.length}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill2, { width: `${progress * 100}%` }]} />
          </View>
          <Pressable
            onPress={() => setShowHelp(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Text style={styles.helpText}>?</Text>
          </Pressable>
        </View>

        <OfflineBanner message="Offline — running from device storage" style={styles.offline} />

        <View style={styles.formatRow}>
          <Text style={styles.formatLabel}>{FORMAT_LABEL[item.format]}</Text>
          <ComboMeter combo={combo} />
          <Text style={styles.deckName} numberOfLines={1}>
            {deck?.name}
          </Text>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View key={index} entering={FadeInDown.springify().damping(16)}>
            <ExamItemView item={item} onDone={handleDone} />
          </Animated.View>
        </ScrollView>

        <Animated.View pointerEvents="none" style={[styles.glowFrame, glowStyle]} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  glowFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3.5,
    borderColor: '#C24E38',
    borderRadius: 26,
    margin: 4,
  },
  fill: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: {
    fontFamily: font.heading,
    fontSize: 15,
    color: colors.textDim,
  },
  counter: {
    fontFamily: font.bodyHeavy,
    fontSize: 12.5,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill2: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accentDeep,
  },
  offline: {
    marginTop: 10,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  formatLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.accentDeep,
  },
  deckName: {
    flexShrink: 1,
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  content: {
    paddingTop: 8,
  },
  briefCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 26,
    alignItems: 'center',
    gap: 8,
    ...shadow.pop,
  },
  briefBadge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    marginBottom: 6,
  },
  briefKicker: {
    fontFamily: font.bodyHeavy,
    fontSize: 11.5,
    letterSpacing: 1.4,
    color: colors.accentDeep,
  },
  briefBody: {
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textDim,
    textAlign: 'center',
  },
  briefBtn: {
    alignSelf: 'stretch',
    marginTop: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
