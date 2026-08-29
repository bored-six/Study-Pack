/**
 * The platform adapter. Everything above this file works in plain dates;
 * only this file knows how a given OS delivers a reminder.
 *
 * Android goes through expo-notifications. Desktop (Tauri) will implement
 * the same three functions against its own notification plugin — the
 * scheduling engine in lib/schedule.ts is shared untouched.
 *
 * Timing caveat, deliberately surfaced to the user rather than hidden:
 * expo-notifications declares no SCHEDULE_EXACT_ALARM permission, so
 * Android schedules these as *inexact* alarms. Doze and OEM battery
 * managers can push them late, which is why the UI calls short lead times
 * approximate instead of promising to-the-minute delivery.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { planReminders, reminderCopy, type PlannedReminder } from './schedule';
import type { Schedule } from './types';

export type Capability =
  /** Permission granted; timing is as good as the platform allows. */
  | 'approximate'
  /** The user said no. */
  | 'denied'
  /** No scheduled-notification support here yet (web build). */
  | 'unsupported';

/**
 * The channel this app's reminders live on, versioned.
 *
 * Android freezes a channel's sound the moment it is created and refuses
 * every later change to it — only the name and description stay editable.
 * So giving reminders their own sound needs a channel the device has never
 * seen; adding one to `quiz-reminders` would have changed nothing for
 * anybody who had already opened the app, and would have looked broken
 * while being correct. Bump this again if the sound ever changes.
 */
const CHANNEL_ID = 'quiz-reminders-v2';

/**
 * Channels this app used to create. Left behind they sit in the system
 * notification settings forever, and a student muting the wrong one would
 * wonder why the reminders kept arriving.
 */
const RETIRED_CHANNELS = ['quiz-reminders'];

/**
 * The reminder's own sound: the same small ring the exam rings before its
 * last page, so a reminder sounds like the thing it is reminding you of.
 *
 * Bundled by the expo-notifications config plugin in app.json, and looked
 * up by base filename — Android wants no path. Inert until then: the file
 * is only compiled in by a development or release build, and in Expo Go
 * Android simply falls back to the default chime rather than failing. To
 * change it, put a short .wav in assets/sfx, name it here, list it in the
 * plugin, and bump CHANNEL_ID.
 */
const REMINDER_SOUND = 'bell.wav';

/** Web has no way to fire a local notification while the app is closed. */
const SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Its own channel so a student can mute reminders without silencing the
 * whole app — the alternative is them disabling notifications outright.
 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Quiz reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: REMINDER_SOUND,
  });

  for (const retired of RETIRED_CHANNELS) {
    try {
      await Notifications.deleteNotificationChannelAsync(retired);
    } catch {
      /* never created on this device, which is the common case */
    }
  }
}

export async function getCapability(): Promise<Capability> {
  if (!SUPPORTED) return 'unsupported';
  const { granted } = await Notifications.getPermissionsAsync();
  return granted ? 'approximate' : 'denied';
}

/**
 * Asks for permission. Call this when the student creates their first
 * plan, never at launch — the request makes sense only once they have
 * asked to be reminded of something.
 */
export async function requestPermission(): Promise<Capability> {
  if (!SUPPORTED) return 'unsupported';
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    await ensureChannel();
    return 'approximate';
  }
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return 'denied';
  await ensureChannel();
  return 'approximate';
}

export async function cancelAll(): Promise<void> {
  if (!SUPPORTED) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export interface ArmResult {
  capability: Capability;
  armed: number;
  reminders: PlannedReminder[];
}

/**
 * Rebuilds every pending reminder from scratch: cancel all, re-plan, arm.
 * Idempotent by construction, so a schedule edit can never leave a stale
 * notification behind and there are no per-notification IDs to reconcile.
 * Safe to call on every app foreground.
 */
export async function armReminders(
  schedules: readonly Schedule[],
  leads: readonly number[]
): Promise<ArmResult> {
  const reminders = planReminders(schedules, { leads });

  const capability = await getCapability();
  if (capability !== 'approximate') {
    return { capability, armed: 0, reminders };
  }

  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  let armed = 0;
  for (const reminder of reminders) {
    const { title, body } = reminderCopy(reminder);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          // Android takes its sound from the channel and ignores this;
          // iOS is the other way round and takes it from here.
          sound: REMINDER_SOUND,
          data: {
            deckIds: [...new Set(reminder.session.occurrences.map((o) => o.deckId))],
            sessionAt: reminder.session.at,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.at),
          channelId: CHANNEL_ID,
        },
      });
      armed++;
    } catch (e) {
      // One bad reminder must not sink the rest of the plan.
      console.warn('Could not arm reminder', reminder.at, e);
    }
  }

  return { capability, armed, reminders };
}

/**
 * Drops the reminders for a sitting the student already dealt with.
 * Nothing erodes trust faster than being nagged about a quiz you just
 * finished, so this runs when a scheduled quiz is completed or skipped.
 */
export async function cancelSession(sessionAt: number): Promise<void> {
  if (!SUPPORTED) return;
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of pending) {
    if (notification.content.data?.sessionAt === sessionAt) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
}

/** A sitting is "current" if it is within this much of now, either way. */
const SESSION_REACH_MS = 2 * 60 * 60_000;

/**
 * Retires the reminders for the sitting a just-finished deck belongs to.
 * Starting early is normal — the advance warning does its job and then the
 * start alert is still pending — and being buzzed for a quiz you already
 * took is exactly the nagging this feature exists to avoid.
 *
 * The whole sitting is retired, not just this deck: the student is in the
 * app right now, so any remaining decks are offered on screen instead.
 */
export async function retireSessionForDeck(deckId: string, now = Date.now()): Promise<void> {
  if (!SUPPORTED) return;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of pending) {
      const data = notification.content.data as
        | { deckIds?: unknown; sessionAt?: unknown }
        | undefined;
      const deckIds = Array.isArray(data?.deckIds) ? (data.deckIds as string[]) : [];
      const sessionAt = typeof data?.sessionAt === 'number' ? data.sessionAt : null;
      if (
        sessionAt != null &&
        Math.abs(sessionAt - now) <= SESSION_REACH_MS &&
        deckIds.includes(deckId)
      ) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch (e) {
    // Never let reminder bookkeeping break finishing a quiz.
    console.warn('Could not retire session reminders', e);
  }
}
