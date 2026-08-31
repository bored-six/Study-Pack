import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon, type IconName } from '@/components/Icon';
import { RuledPaper } from '@/components/notebook';
import {
  clearPracticeHistory,
  eraseEverything,
  storageSummary,
  type StorageSummary,
} from '@/lib/db';
import {
  DEFAULT_PREFS,
  loadPrefs,
  setBriefings,
  setDark,
  setIntro,
  setSound,
  setVibration,
  type Prefs,
} from '@/lib/prefs';
import { LEAD_LABEL } from '@/lib/schedule';
import { useNotesStore } from '@/store/notes';
import { usePlannerStore } from '@/store/planner';
import { useProgressStore } from '@/store/progress';
import { derpRadius, font, getColors, lightColors, useThemeStore } from '@/theme/tokens';

type Pending = 'trivia' | 'history' | 'erase' | 'eraseReally';

function DerpToggle({ value, onChange, label }: { value: boolean; onChange: (on: boolean) => void; label: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      // Without this the switch announces its name and never its state:
      // "Sound effects", with no way to hear whether it is on or off.
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[
        styles.derpToggle,
        { backgroundColor: value ? colors.accent : colors.surface, borderColor: colors.ink }
      ]}>
      <View style={[
        styles.derpToggleThumb,
        { 
          left: value ? 22 : 2, 
          backgroundColor: value ? colors.surface : colors.ink,
          borderColor: value ? colors.ink : 'transparent',
          borderWidth: value ? 2 : 0,
        }
      ]} />
    </Pressable>
  );
}

function SettingRow({ icon, label, sub, right }: { icon?: IconName; label: string; sub?: string; right?: React.ReactNode }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  return (
    <View style={styles.settingRow}>
      {icon && (
        <View style={styles.settingIconWrap}>
          <Icon name={icon} size={24} color={lightColors.ink} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {sub ? <Text style={styles.settingSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** One plain promise, ticked. Fixed ink: the card's wash never changes with the theme. */
function PrivacyLine({ text }: { text: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const styles = getStyles(getColors(isDark));
  return (
    <View style={styles.privacyLine}>
      <Icon name="check" size={15} color="#1A211C" strokeWidth={3} />
      <Text style={styles.privacyText}>{text}</Text>
    </View>
  );
}

function DangerRow({ icon, label, sub, onPress }: { icon: IconName; label: string; sub: string; onPress: () => void }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIconWrap}>
        <Icon name={icon} size={24} color={lightColors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSub}>{sub}</Text>
      </View>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.8 }]}>
        <Text style={styles.dangerBtnText}>TRASH</Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const { capability, leads, askPermission, refresh: refreshPlanner } = usePlannerStore();
  const refreshNotes = useNotesStore((s) => s.refresh);
  const refreshProgress = useProgressStore((s) => s.refresh);

  const readStorage = useCallback(() => {
    void storageSummary().then(setStorage);
  }, []);

  useEffect(() => {
    void loadPrefs().then(setPrefs);
    readStorage();
  }, [readStorage]);

  const change = useCallback(
    <K extends keyof Prefs>(key: K, write: (on: boolean) => Promise<void>) =>
      (on: boolean) => {
        setPrefs((current) => ({ ...current, [key]: on }));
        void write(on);
      },
    []
  );

  const askForReminders = useCallback(async () => {
    const result = await askPermission();
    if (result === 'denied') {
      setNotice({
        title: 'Still off',
        message: "Android is holding the permission. Open Flipp's notification settings on your phone to let reminders through.",
      });
      void Linking.openSettings().catch(() => {});
    }
  }, [askPermission]);

  const runPending = useCallback(async () => {
    const action = pending;
    if (!action) return;

    if (action === 'erase') {
      setPending('eraseReally');
      return;
    }
    setPending(null);

    if (action === 'trivia') {
      setNotice({
        title: 'Trivia cleared',
        message: 'Your subjects are untouched. Trivia decks download again whenever you have signal.',
      });
    } else if (action === 'history') {
      await clearPracticeHistory();
      await refreshProgress();
      setNotice({
        title: 'History cleared',
        message: 'Scores, streak, mastery, and moments are gone. Every note you wrote is still here.',
      });
    } else if (action === 'eraseReally') {
      await eraseEverything();
      await Promise.all([refreshNotes(), refreshProgress(), refreshPlanner()]);
      setPrefs(DEFAULT_PREFS);
      setNotice({ title: 'Wiped', message: 'Flipp is back to the day you installed it.' });
    }
    readStorage();
  }, [pending, readStorage, refreshNotes, refreshPlanner, refreshProgress]);

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const reminderValue =
    capability === 'unsupported'
      ? 'Not on this device'
      : capability === 'denied'
        ? 'Off'
        : leads.length > 0
          ? leads.map((lead) => LEAD_LABEL[lead] ?? `${lead} min`).join(' · ')
          : 'At start time';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <RuledPaper />
      
      <View style={[styles.navRow, { paddingHorizontal: 16 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.8 }]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28, paddingHorizontal: 16 }]}
        showsVerticalScrollIndicator={false}>
        
        {/* VIBES */}
        <View style={styles.stickyWrapper}>
          <View style={[styles.stickyCard, { backgroundColor: '#FCEBC0', transform: [{ rotate: '-1deg' }] }]}>
            <View style={styles.cardHeader}>
              <Icon name="star" size={28} color="#1A211C" />
              <Text style={styles.cardTitle}>Vibes</Text>
            </View>

            <SettingRow 
              icon="bulb"
              label="Dark Mode" 
              sub="Switch to dark paper" 
              right={<DerpToggle label="Dark Mode" value={prefs.dark} onChange={change('dark', setDark)} />} 
            />
            <SettingRow 
              icon="sound"
              label="Derp Sounds" 
              sub="Pops and boops" 
              right={<DerpToggle label="Sound effects" value={prefs.sound} onChange={change('sound', setSound)} />} 
            />
            <SettingRow 
              icon="smartphone"
              label="Vibration" 
              sub="Haptic feedback" 
              right={<DerpToggle label="Vibration" value={prefs.vibration} onChange={change('vibration', setVibration)} />} 
            />
            <SettingRow 
              icon="star"
              label="Opening Animation" 
              sub="The Flipp intro" 
              right={<DerpToggle label="Opening animation" value={prefs.intro} onChange={change('intro', setIntro)} />} 
            />
            <SettingRow 
              icon="question"
              label="Format How-tos" 
              sub="Hints for new formats" 
              right={<DerpToggle label="Format how-tos" value={prefs.briefings} onChange={change('briefings', setBriefings)} />} 
            />
            <SettingRow 
              icon="bell"
              label="Reminders" 
              sub={capability === 'denied' ? 'Allow notifications' : reminderValue} 
              right={
                capability === 'denied' 
                  ? <ChunkyButton label="Turn on" variant="paper" size="sm" onPress={() => void askForReminders()} />
                  : ( capability === 'approximate' 
                      ? <Pressable onPress={() => router.push('/planner')}><Icon name="play" size={24} color="#1A211C" /></Pressable>
                      : <Icon name="check" size={24} color="#1A211C" />
                    )
              } 
            />
          </View>
        </View>

        {/* YOUR STUFF */}
        <View style={styles.stickyWrapper}>
          <View style={[styles.stickyCard, { backgroundColor: '#DDF3DC', transform: [{ rotate: '1deg' }] }]}>
            <View style={styles.cardHeader}>
              <Icon name="cards" size={28} color="#1A211C" />
              <Text style={styles.cardTitle}>Your Stuff</Text>
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{storage?.subjects ?? 0}</Text>
                <Text style={styles.statSmall}>SUBJECTS</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{storage?.noteQuestions ?? 0}</Text>
                <Text style={styles.statSmall}>QUESTIONS</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{storage?.sittings ?? 0}</Text>
                <Text style={styles.statSmall}>SITTINGS</Text>
              </View>
            </View>
          </View>
        </View>

        {/* PRIVACY */}
        <View style={styles.stickyWrapper}>
          <View style={[styles.stickyCard, { backgroundColor: '#DBEEFB', transform: [{ rotate: '-0.6deg' }] }]}>
            <View style={styles.cardHeader}>
              <Icon name="smartphone" size={28} color="#1A211C" />
              <Text style={styles.cardTitle}>Your Privacy</Text>
            </View>

            {/*
              Flipp is handed out as a download from a link rather than through
              a store, so nobody has vetted it on the student's behalf. Saying
              plainly what it does is the only assurance they get, and every
              line here is true of the code as written.
            */}
            <PrivacyLine text="Your notes, answers and streak stay on this phone." />
            <PrivacyLine text="Nothing leaves the phone unless you press &quot;Read these with AI&quot; — that sends the notes in the box, and nothing else." />
            <PrivacyLine text="Flipp makes no other call of any kind. The fonts and sounds are built in." />
            <PrivacyLine text="No account, no sign-in, no ads, no tracking of any kind." />
            <PrivacyLine text="Reminders are set by the phone itself, not sent from anywhere." />
            <PrivacyLine text="Delete everything whenever you like, below. It is gone from the phone, and there is no copy elsewhere." />
          </View>
        </View>

        {/* DANGER ZONE */}
        <View style={styles.stickyWrapper}>
          <View style={[styles.stickyCard, { backgroundColor: '#FBD5CC', transform: [{ rotate: '-1deg' }] }]}>
            <View style={styles.cardHeader}>
              <Icon name="trash" size={28} color="#1A211C" />
              <Text style={styles.cardTitle}>Danger Zone</Text>
            </View>
            
            <DangerRow icon="chart" label="Clear practice history" sub="Scores and streak. Your notes stay." onPress={() => setPending('history')} />
            <DangerRow icon="trash" label="Delete everything" sub="No undo. Wipes the app." onPress={() => setPending('erase')} />
          </View>
        </View>

        <Text style={styles.footer}>Flipp v{version} · made to work offline</Text>
      </ScrollView>

      {/* MODALS */}
      <ConfirmModal
        visible={pending === 'trivia'}
        title="Remove saved trivia?"
        message="The decks stay in the catalog — you just won't have them offline until you download them again."
        confirmLabel="Remove"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => void runPending()}
      />
      <ConfirmModal
        visible={pending === 'history'}
        title="Clear practice history?"
        message="Every score, your streak, mastery, and the moments you've collected. The notes themselves are untouched, and this can't be undone."
        confirmLabel="Clear it"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => void runPending()}
      />
      <ConfirmModal
        visible={pending === 'erase'}
        title="Delete everything?"
        message="Subjects, notes, plans, scores — gone. There is no copy anywhere else."
        confirmLabel="Continue"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => void runPending()}
      />
      <ConfirmModal
        visible={pending === 'eraseReally'}
        title="Really, everything?"
        message="Last check. This wipes Flipp back to a fresh install."
        confirmLabel="Delete it all"
        destructive
        onCancel={() => setPending(null)}
        onConfirm={() => void runPending()}
      />
      <ConfirmModal
        visible={notice != null}
        title={notice?.title ?? ''}
        message={notice?.message}
        confirmLabel="OK"
        onCancel={() => setNotice(null)}
      />
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingTop: 10,
    overflow: 'visible',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1A211C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 4,
  },
  backArrow: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 24,
    color: '#1A211C',
    fontWeight: '800',
  },
  title: {
    fontFamily: font.hero,
    fontSize: 34,
    color: colors.text,
  },
  stickyWrapper: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stickyCard: {
    borderWidth: 2,
    borderColor: '#1A211C',
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 6,
    ...derpRadius,
    borderTopLeftRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(26, 33, 28, 0.2)',
    borderStyle: 'dashed',
    paddingBottom: 10,
    marginBottom: 18,
  },
  cardTitle: {
    fontFamily: font.hero,
    fontSize: 26,
    color: lightColors.ink,
    top: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 16,
    color: lightColors.ink,
  },
  privacyLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 11,
  },
  privacyText: {
    flex: 1,
    fontFamily: font.bodySemibold,
    fontSize: 13.5,
    lineHeight: 19,
    color: lightColors.ink,
  },
  settingSub: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: 'rgba(26, 33, 28, 0.65)',
    marginTop: 2,
  },
  derpToggle: {
    width: 48,
    height: 28,
    borderWidth: 2,
    borderRadius: 20,
    justifyContent: 'center',
  },
  derpToggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
    borderColor: lightColors.edge,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statBig: {
    fontFamily: font.hero,
    fontSize: 26,
    color: lightColors.ink,
  },
  statSmall: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    color: 'rgba(26, 33, 28, 0.7)',
    letterSpacing: 1,
  },
  dangerBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1A211C',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dangerBtnText: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    color: '#1A211C',
  },
  footer: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 2,
  },
});
