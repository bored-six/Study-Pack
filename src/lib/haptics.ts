/**
 * The exam's sense of touch. Thin wrappers so call sites read as intent,
 * every buzz stays optional at one choke point, and a platform without
 * haptics simply feels nothing rather than crashing.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const ON = Platform.OS === 'android' || Platform.OS === 'ios';

function quiet(run: () => Promise<void>): void {
  if (!ON) return;
  run().catch(() => {
    /* a missing vibrator is not an error */
  });
}

/** Picking up / playing a card. */
export function tapSelect(): void {
  quiet(() => Haptics.selectionAsync());
}

/** A correct answer. */
export function tapCorrect(): void {
  quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A wrong answer — unmistakably different from a right one. */
export function tapWrong(): void {
  quiet(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** The stamp coming down, a page tearing off. */
export function tapThud(): void {
  quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Combo tier reached — bigger tiers, bigger buzz. */
export function tapTier(combo: number): void {
  if (combo >= 20 || combo === 10) {
    quiet(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  } else if (combo === 5 || combo === 3) {
    quiet(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  }
}
