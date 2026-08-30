const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Strips permissions Flipp does not use out of the merged manifest.
 *
 * A library's own AndroidManifest is merged into the app's, and the merge is
 * additive: expo-audio declares RECORD_AUDIO because the library can record,
 * so the app inherits it even though nothing in Flipp ever records. Setting
 * `recordAudioAndroid: false` on the plugin only stops it being written into
 * *our* manifest — it cannot unsay what the library declared. The only way to
 * drop an inherited permission is to name it with `tools:node="remove"`.
 *
 * This is not tidiness. Flipp is handed out as an APK from a link, so the
 * install screen is the only thing standing between a stranger and deciding
 * this is malware. "Microphone" and "Display over other apps" on a study app
 * — two taps from a Settings card promising no tracking — is exactly what
 * makes a careful person back out.
 *
 * Every entry below is justified in the list itself. Anything Flipp genuinely
 * uses (notifications, vibration, boot-completed for reminders that survive a
 * restart) is deliberately absent.
 */
const REMOVE = [
  // expo-audio can record; Flipp only ever plays. No recorder exists in src,
  // and a test enforces that.
  'android.permission.RECORD_AUDIO',
  // React Native's debug overlay asks for this. Nothing draws over other apps.
  'android.permission.SYSTEM_ALERT_WINDOW',
  // Every byte Flipp keeps is in its own private SQLite database.
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  // Background media playback. Flipp's sounds are UI feedback and stop with
  // the screen, so it never runs a foreground service.
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  // Nothing in Flipp opens a socket. This used to be needed by the offline
  // banner, which asked NetInfo whether the device was online — and NetInfo
  // answers that by pinging clients3.google.com. With trivia gone, being
  // offline changed nothing, so the banner reported a state with no
  // consequence at the cost of the one outbound request the app made. Both
  // are gone, and dropping the permission is what makes "Flipp never calls
  // the internet" a promise Android enforces rather than one we merely keep.
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
];

const TOOLS = 'http://schemas.android.com/tools';

module.exports = function withTrimmedPermissions(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // The remove directive is a tools: attribute, so the namespace has to be
    // declared or the merger ignores it silently.
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = TOOLS;

    const existing = manifest['uses-permission'] || [];

    // Drop any we declare ourselves, then re-add each as an explicit removal
    // so the merger takes it out of whatever a library contributed.
    const kept = existing.filter(
      (entry) => !REMOVE.includes(entry.$?.['android:name'])
    );

    manifest['uses-permission'] = [
      ...kept,
      ...REMOVE.map((name) => ({
        $: { 'android:name': name, 'tools:node': 'remove' },
      })),
    ];

    return mod;
  });
};
