/**
 * The reminder sound is held together by three files agreeing.
 *
 * The sound is named in notifications.ts, bundled by a plugin entry in
 * app.json, and lives in assets/sfx — and Android freezes a channel's
 * sound the moment the channel is created, so a change that misses any one
 * of those ships silently and correctly does nothing. You would hear the
 * default chime, conclude the feature was broken, and be wrong.
 *
 * None of that can be caught by running the app in Expo Go, where the file
 * is never compiled in and the default chime is the expected result. So it
 * is checked here instead.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const SOURCE = readFileSync(join(ROOT, 'src', 'lib', 'notifications.ts'), 'utf8');
const APP_JSON = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));

/** A `const NAME = '...'` from the adapter. */
function constant(name: string): string {
  const match = new RegExp(`const ${name} = '([^']+)'`).exec(SOURCE);
  if (!match) throw new Error(`notifications.ts no longer declares ${name}`);
  return match[1];
}

/** Every sound the config plugin bundles into the native app. */
function bundledSounds(): string[] {
  const plugins: unknown[] = APP_JSON.expo.plugins ?? [];
  const entry = plugins.find(
    (plugin): plugin is [string, { sounds?: string[] }] =>
      Array.isArray(plugin) && plugin[0] === 'expo-notifications'
  );
  return entry?.[1]?.sounds ?? [];
}

describe('the reminder sound', () => {
  it('is bundled by the config plugin, or Android will never find it', () => {
    const sound = constant('REMINDER_SOUND');
    const basenames = bundledSounds().map((path) => path.split('/').pop());
    expect(basenames).toContain(sound);
  });

  it('is a file that actually exists', () => {
    for (const path of bundledSounds()) {
      expect(existsSync(join(ROOT, path))).toBe(true);
    }
  });

  it('is a .wav, which is the format the platform wants', () => {
    for (const path of bundledSounds()) {
      expect(path).toMatch(/\.wav$/);
    }
  });

  it('is short enough to be a notification rather than a song', () => {
    // Well under the platform's cap, and under a second in practice — a
    // reminder that plays for five seconds is a reminder people turn off.
    for (const path of bundledSounds()) {
      const bytes = readFileSync(join(ROOT, path)).length;
      expect(bytes).toBeLessThan(400_000);
    }
  });
});

describe('the channel the sound rides on', () => {
  it('is not one the app has already created under another name', () => {
    // Android takes a channel's sound at creation and refuses every change
    // after. Reusing a retired id means the new sound reaches nobody who
    // has opened the app before.
    const channel = constant('CHANNEL_ID');
    const retired = /const RETIRED_CHANNELS = \[([^\]]*)\]/.exec(SOURCE)?.[1] ?? '';
    const names = [...retired.matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain(channel);
  });

  it('carries the sound, so the channel is what actually plays it', () => {
    // On Android the notification's own sound is ignored; only the
    // channel's counts. A channel written without one is silent by default.
    expect(SOURCE).toMatch(/setNotificationChannelAsync\([\s\S]*?sound: REMINDER_SOUND/);
  });

  it('clears the channels it replaced, so settings shows one entry', () => {
    expect(SOURCE).toContain('deleteNotificationChannelAsync');
  });
});
