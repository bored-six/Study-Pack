/**
 * The exam's sound: eight tiny synthesized tones, deliberately toy-like.
 * All playback goes through playSfx so muting is one flag, a missing
 * audio backend fails silently, and no call site ever awaits anything.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { readSetting } from './db';

const SOURCES = {
  tap: require('../../assets/sfx/tap.wav'),
  correct: require('../../assets/sfx/correct.wav'),
  wrong: require('../../assets/sfx/wrong.wav'),
  combo: require('../../assets/sfx/combo.wav'),
  tear: require('../../assets/sfx/tear.wav'),
  stamp: require('../../assets/sfx/stamp.wav'),
  tick: require('../../assets/sfx/tick.wav'),
  bell: require('../../assets/sfx/bell.wav'),
  star: require('../../assets/sfx/star.wav'),
  aplus: require('../../assets/sfx/aplus.wav'),
  brief_multiple_choice: require('../../assets/sfx/brief_multiple_choice.wav'),
  brief_true_false: require('../../assets/sfx/brief_true_false.wav'),
  brief_modified_true_false: require('../../assets/sfx/brief_modified_true_false.wav'),
  brief_identification: require('../../assets/sfx/brief_identification.wav'),
  brief_fill_blank: require('../../assets/sfx/brief_fill_blank.wav'),
  brief_matching: require('../../assets/sfx/brief_matching.wav'),
  brief_enumeration: require('../../assets/sfx/brief_enumeration.wav'),
  derp_boing: require('../../assets/sfx/derp_boing.wav'),
  derp_pop: require('../../assets/sfx/derp_pop.wav'),
  achievement: require('../../assets/sfx/achievement.wav'),
  tier_up: require('../../assets/sfx/tier_up.wav'),
  sticker_peel: require('../../assets/sfx/sticker_peel.wav'),
  streak_keep: require('../../assets/sfx/streak_keep.wav'),
  cartridge_click: require('../../assets/sfx/cartridge_click.wav'),
  album_open: require('../../assets/sfx/album_open.wav'),
  day_tap: require('../../assets/sfx/day_tap.wav'),
  tab_flip: require('../../assets/sfx/tab_flip.wav'),
} as const;

export type SfxName = keyof typeof SOURCES;

let enabled = true;
let ready = false;
const players: Partial<Record<SfxName, AudioPlayer>> = {};

async function init(): Promise<void> {
  if (ready) return;
  ready = true;
  try {
    // Sounds this small should never silence someone's music, and a phone
    // on the silent switch stays silent.
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
    enabled = (await readSetting('sfx_muted')) !== '1';
  } catch {
    /* audio config is best-effort */
  }
  // Warm every player so the first real play is instant, not a load race.
  for (const name of Object.keys(SOURCES) as SfxName[]) {
    try {
      playerFor(name);
    } catch {
      /* a player that fails to build just stays silent */
    }
  }
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

/** Most sounds sit back; the ones that celebrate cut through. */
const VOLUME: Partial<Record<SfxName, number>> = {
  combo: 0.9,
  aplus: 0.8,
  bell: 0.7,
};

function playerFor(name: SfxName): AudioPlayer {
  let player = players[name];
  if (!player) {
    player = createAudioPlayer(SOURCES[name]);
    player.volume = VOLUME[name] ?? 0.55;
    players[name] = player;
  }
  return player;
}

/**
 * The same clip twice in a breath is a bug, not a rhythm.
 *
 * Nothing in the app ever means to play one sound twice inside a tenth of
 * a second — but an effect that re-runs does exactly that, and the ways an
 * effect re-runs are many and boring: a reduced-motion preference that
 * resolves after the first render, a re-render from a store, a remount.
 * The cartridge clunked twice on every mode pick for that reason.
 *
 * Guarding here rather than at the call site means it is guarded for every
 * sound, including the ones nobody has written yet. Repeats further apart
 * than this — a per-second tick, a run of stars — are untouched.
 */
const REPEAT_GUARD_MS = 90;
const lastPlayedAt: Partial<Record<SfxName, number>> = {};

/** Test seam: forget what was played, so one test cannot mute the next. */
export function resetSfxThrottle(): void {
  for (const key of Object.keys(lastPlayedAt) as SfxName[]) delete lastPlayedAt[key];
}

export function playSfx(name: SfxName): void {
  void init();
  if (!enabled) return;

  const now = Date.now();
  if (now - (lastPlayedAt[name] ?? 0) < REPEAT_GUARD_MS) return;
  lastPlayedAt[name] = now;

  try {
    const player = playerFor(name);
    // A fresh player plays as soon as it loads; only a replay needs the
    // rewind. Waiting on seekTo before the first play left the whole app
    // silent when the seek never resolved on an unloaded player.
    if (player.currentTime > 0) {
      void player.seekTo(0);
    }
    player.play();
  } catch {
    /* no sound is never an error */
  }
}
