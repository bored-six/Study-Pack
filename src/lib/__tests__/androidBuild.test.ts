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
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
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

describe('what Android will tell people this app wants', () => {
  /**
   * expo-audio adds RECORD_AUDIO by default, because the library can record.
   * Flipp only ever plays sounds, so the permission was pure cost: Android
   * lists "Microphone" on the install screen, and for an app handed out as a
   * download from a link that reads as spyware — while the Settings card two
   * taps away promises no tracking of any kind.
   *
   * If this fails, either something genuinely needs the permission and the
   * privacy card has to change, or a plugin default has crept back in.
   */
  it('asks for no permissions it does not use', () => {
    const declared: string[] = expo.android?.permissions ?? [];
    expect(declared).toEqual([]);
  });

  it('tells expo-audio it is a player, not a recorder', () => {
    const audio = expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-audio'
    );
    expect(audio).toBeDefined();
    expect(audio[1].recordAudioAndroid).toBe(false);
  });

  it('has no recording code that would justify one', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== '__tests__') walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(path)) continue;
        if (/useAudioRecorder|AudioRecorder|RecordingPresets/.test(readFileSync(path, 'utf8'))) {
          offenders.push(path.replace(/.*src[\\/]/, 'src/'));
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('the permissions a library sneaks in', () => {
  /**
   * A library's AndroidManifest is merged into the app's, additively. So
   * expo-audio's own manifest hands Flipp RECORD_AUDIO whatever the plugin
   * options say — its `recordAudioAndroid: false` only governs what gets
   * written into our manifest, and cannot unsay what the library declared.
   * The first two builds shipped a microphone permission because of that,
   * and it took reading the APK to notice.
   *
   * withTrimmedPermissions names each one with tools:node="remove", which is
   * the only thing the merger honours.
   */
  const plugin = readFileSync(join(ROOT, 'plugins', 'withTrimmedPermissions.js'), 'utf8');

  it('is registered, or it does nothing at all', () => {
    expect(expo.plugins).toContain('./plugins/withTrimmedPermissions');
  });

  it('removes the ones that scare people off an install', () => {
    for (const permission of [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]) {
      expect(plugin).toContain(permission);
    }
  });

  it('declares the tools namespace, without which the merger ignores it', () => {
    expect(plugin).toContain('xmlns:tools');
    expect(plugin).toContain("'tools:node': 'remove'");
  });

  it('does not touch the ones Flipp actually needs', () => {
    // Reminders, reminders that survive a reboot, and haptics.
    for (const keep of ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'VIBRATE']) {
      expect(plugin).not.toContain(`android.permission.${keep}'`);
    }
  });
});

describe('nothing reaches the network, including libraries', () => {
  /**
   * The first version of this checked src/ for fetch, XHR and WebSocket, and
   * passed — while @react-native-community/netinfo pinged
   * clients3.google.com on a timer to answer "are we online?". None of that
   * appears in our code, so the sweep never saw it, and the Settings card
   * promised something the app was quietly breaking.
   *
   * A dependency that exists to talk to the network is the thing to look
   * for, not a call site. Adding one has to be a deliberate act that turns
   * this red.
   */
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  it('ships no dependency whose job is to reach the network', () => {
    const networked = deps.filter((name) =>
      /netinfo|axios|superagent|socket\.io|pusher|firebase|amplitude|sentry|analytics|expo-updates/.test(
        name
      )
    );
    expect(networked).toEqual([]);
  });

  it('has no offline state to report, because offline changes nothing', () => {
    // The banner was the only reason the app cared whether it was connected.
    expect(existsSync(join(ROOT, 'src', 'hooks', 'useOnline.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'src', 'components', 'OfflineBanner.tsx'))).toBe(false);
  });

  it('gives up the permission, so Android enforces the promise', () => {
    const plugin = readFileSync(join(ROOT, 'plugins', 'withTrimmedPermissions.js'), 'utf8');
    expect(plugin).toContain('android.permission.INTERNET');
  });
});
