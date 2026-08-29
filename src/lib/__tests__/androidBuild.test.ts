/**
 * The three config choices that are hard or impossible to take back.
 *
 * Flipp is handed out as an APK from a landing page rather than through a
 * store, so nothing reviews these before they reach a phone — a bad value
 * ships, and the first sign of trouble is somebody saying the app will not
 * install or that their notes are gone.
 *
 * The package name is the worst of them. Android decides whether a download
 * is *an update to Flipp* or *a whole new app* by that string alone. Change
 * it after release and every existing user ends up with two Flipps, and the
 * new one is empty.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const expo = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;

describe('the identity Android installs under', () => {
  it('is set, or no APK can be built at all', () => {
    expect(expo.android?.package).toBeTruthy();
  });

  it('is exactly the string already in the wild', () => {
    // Pinned on purpose. If this test fails, the change is either a mistake
    // or it strands every existing install — decide which before editing it.
    expect(expo.android.package).toBe('com.boredsix.flipp');
  });

  it('looks like a package name Android will accept', () => {
    expect(expo.android.package).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  });

  it('is not the name shown under the icon, which stays Flipp', () => {
    expect(expo.name).toBe('Flipp');
  });
});

describe('the theme the OS is told about', () => {
  it('does not claim the app is light-only, because it ships a dark mode', () => {
    // This flag governs the surfaces the app does not draw — keyboard,
    // alerts, status bar. Left on "light" they stay white at night while
    // everything around them is dark.
    expect(expo.userInterfaceStyle).toBe('automatic');
  });
});


describe('the promise the settings screen makes', () => {
  /**
   * The privacy card tells students Flipp never calls the internet. That was
   * only made true by removing trivia, and it is the kind of claim that
   * quietly becomes a lie the first time somebody adds a fetch. If this
   * fails, either take the network call out or change what the card says —
   * but do not leave both.
   */
  it('is not contradicted by a network call anywhere in the app', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== '__tests__') walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(path)) continue;
        const source = readFileSync(path, 'utf8');
        if (/\bfetch\(|XMLHttpRequest|new WebSocket\(/.test(source)) {
          offenders.push(path.replace(/.*src[\\/]/, 'src/'));
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
