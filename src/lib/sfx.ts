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
  bell: require('../../assets/sfx/bell.wav'),
  star: require('../../assets/sfx/star.wav'),
  aplus: require('../../assets/sfx/aplus.wav'),
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
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

export function playSfx(name: SfxName): void {
  void init();
  if (!enabled) return;
  try {
    let player = players[name];
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      player.volume = 0.55;
      players[name] = player;
    }
    void player.seekTo(0).then(() => player.play());
  } catch {
    /* no sound is never an error */
  }
}
