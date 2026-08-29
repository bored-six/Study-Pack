/**
 * The choke point every sound goes through.
 *
 * The cartridge clunked twice on every mode pick, and the call site was
 * only ever written once — an effect re-ran under it. Guarding the call
 * site would have fixed that one sound; guarding here fixes it for every
 * sound, including the ones not written yet.
 */
// Must be `mock`-prefixed: jest hoists the factory above this line. And a
// list rather than a map keyed by the asset — bundled assets stringify
// alike, so a map kept one player and counted the wrong one's plays.
const mockPlayers: { play: jest.Mock; seekTo: jest.Mock; currentTime: number }[] = [];

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => {
    const player = { play: jest.fn(), seekTo: jest.fn(async () => undefined), currentTime: 0 };
    mockPlayers.push(player);
    return player;
  }),
}));
jest.mock('@/lib/db', () => ({ readSetting: async () => null }));

import { playSfx, resetSfxThrottle, setSfxEnabled } from '../sfx';

/** Every play() across every warmed player. */
function plays(): number {
  return mockPlayers.reduce((total, p) => total + p.play.mock.calls.length, 0);
}

beforeEach(() => {
  resetSfxThrottle();
  setSfxEnabled(true);
  for (const player of mockPlayers) player.play.mockClear();
});

describe('the same sound twice in a breath', () => {
  it('plays once, however many times it is asked for', () => {
    playSfx('cartridge_click');
    playSfx('cartridge_click');
    playSfx('cartridge_click');
    expect(plays()).toBe(1);
  });

  it('plays again once the moment has passed', () => {
    playSfx('cartridge_click');
    resetSfxThrottle(); // stands in for the ninety milliseconds passing
    playSfx('cartridge_click');
    expect(plays()).toBe(2);
  });

  it('never silences a different sound', () => {
    // Two sounds at once is a chord, not a stutter — the clunk and the
    // cartridge's own note are meant to land together.
    playSfx('cartridge_click');
    playSfx('tier_up');
    expect(plays()).toBe(2);
  });

  it('leaves a per-second tick alone', () => {
    // Beat the clock ticks through its last five seconds, a second apart —
    // far outside the guard. A guard that swallowed those would have traded
    // one bug for a worse one.
    for (let second = 0; second < 5; second++) {
      resetSfxThrottle();
      playSfx('tick');
    }
    expect(plays()).toBe(5);
  });

  it('stays silent when sound is off, however it is asked', () => {
    setSfxEnabled(false);
    playSfx('star');
    playSfx('star');
    expect(plays()).toBe(0);
  });
});
