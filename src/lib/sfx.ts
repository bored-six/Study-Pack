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

export function playSfx(name: SfxName): void {
  void init();
  if (!enabled) return;
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
