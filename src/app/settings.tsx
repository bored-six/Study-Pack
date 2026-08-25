import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChunkyButton } from '@/components/ChunkyButton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Icon, type IconName } from '@/components/Icon';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import {
  clearPracticeHistory,
  clearTriviaDownloads,
  eraseEverything,
  storageSummary,
  type StorageSummary,
} from '@/lib/db';
import {
  DEFAULT_PREFS,
  loadPrefs,
  setBriefings,
  setIntro,
  setSound,
  setVibration,
  type Prefs,
} from '@/lib/prefs';
import { LEAD_LABEL } from '@/lib/schedule';
import { useDecksStore } from '@/store/decks';
import { useNotesStore } from '@/store/notes';
import { usePlannerStore } from '@/store/planner';
import { useProgressStore } from '@/store/progress';
import { derpRadius, font, outline, radius, shadow, useThemeStore, getColors } from '@/theme/tokens';

/** Which destructive action is waiting on a yes. */
type Pending = 'trivia' | 'history' | 'erase' | 'eraseReally';

/**
 * One line of a settings card. Rows are grouped inside a single card with
 * hairlines between them rather than each floating on its own sticker —
 * five choices should read as one short list, not nine separate objects.
 */
function Row({
  icon,
  title,
  hint,
  right,
  onPress,
  tone,
  style,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  tone?: 'danger' | 'info';
  style?: StyleProp<ViewStyle>;
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);

  const ink = tone === 'danger' ? colors.coral : colors.ink;
  const body = (
    <>
      <Icon
        name={icon}
        size={19}
        color={ink}
        fill={tone === 'danger' ? colors.coralWash : colors.surface2}
        strokeWidth={1.9}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, tone === 'danger' && styles.rowTitleDanger]}>{title}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {right}
    </>
  );

  if (!onPress) return <View style={[styles.row, style]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (on: boolean) => void; label: string }) {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);

  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.accent, false: colors.track }}
      thumbColor={colors.surface}
    />
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
  const refreshDecks = useDecksStore((s) => s.refresh);

  const readStorage = useCallback(() => {
    void storageSummary().then(setStorage);
  }, []);

  useEffect(() => {
    void loadPrefs().then(setPrefs);
    readStorage();
  }, [readStorage]);

  // One writer for every switch: flip the UI now, persist after, so a
  // toggle never feels like it lagged behind the thumb.
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
        message:
          "Android is holding the permission. Open Flipp's notification settings on your phone to let reminders through.",
      });
      void Linking.openSettings().catch(() => {
        /* a phone with no settings intent is not an error */
      });
    }
  }, [askPermission]);

  const runPending = useCallback(async () => {
    const action = pending;
    if (!action) return;

    // The second yes is a separate question, not a second click of the
    // same one — deleting everything is the one thing with no way back.
    if (action === 'erase') {
      setPending('eraseReally');
      return;
    }
    setPending(null);

    if (action === 'trivia') {
      await clearTriviaDownloads();
      await refreshDecks();
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
      await Promise.all([refreshNotes(), refreshDecks(), refreshProgress(), refreshPlanner()]);
      setPrefs(DEFAULT_PREFS);
      setNotice({ title: 'Wiped', message: 'Flipp is back to the day you installed it.' });
    }
    readStorage();
  }, [pending, readStorage, refreshDecks, refreshNotes, refreshPlanner, refreshProgress]);

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
      <View style={styles.navRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Your</Text>
            <View style={styles.titleSticker}>
              <Text style={styles.titleStickerText}>settings!</Text>
            </View>
          </View>
          <Squiggle width={94} style={styles.squiggle} />
        </View>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Row
            icon="bulb"
            title="Dark mode"
            hint="Switch to dark paper"
            right={<Toggle label="Dark mode" value={isDark} onChange={toggleTheme} />}
            style={styles.divided}
          />
          <Row
            icon="sound"
            title="Sound effects"
            right={<Toggle label="Sound effects" value={prefs.sound} onChange={change('sound', setSound)} />}
            style={styles.divided}
          />
          <Row
            icon="smartphone"
            title="Vibration"
            right={
              <Toggle
                label="Vibration"
                value={prefs.vibration}
                onChange={change('vibration', setVibration)}
              />
            }
            style={styles.divided}
          />
          <Row
            icon="star"
            title="Opening animation"
            right={<Toggle label="Opening animation" value={prefs.intro} onChange={change('intro', setIntro)} />}
            style={styles.divided}
          />
          <Row
            icon="question"
            title="Format how-tos"
            hint="Shown the first time a format appears"
            right={
              <Toggle
                label="Format how-tos"
                value={prefs.briefings}
                onChange={change('briefings', setBriefings)}
              />
            }
            style={styles.divided}
          />
          {capability === 'denied' ? (
            <Row
              icon="bell"
              title="Reminders"
              hint="Allow notifications and Flipp can nudge you"
              right={<ChunkyButton label="Turn on" variant="paper" size="sm" onPress={() => void askForReminders()} />}
            />
          ) : (
            <Row
              icon="bell"
              title="Reminders"
              right={
                <View style={styles.value}>
                  <Text style={styles.valueText}>{reminderValue}</Text>
                  {capability === 'approximate' ? (
                    <Icon name="play" size={13} color={colors.accentDeep} />
                  ) : null}
                </View>
              }
              onPress={capability === 'approximate' ? () => router.push('/planner') : undefined}
            />
          )}
        </View>

        <View style={styles.card}>
          <Row
            icon="bulb"
            title="Dark mode"
            hint="Switch to dark paper"
            right={<Toggle label="Dark mode" value={isDark} onChange={toggleTheme} />}
            style={styles.divided}
          />
          <View style={styles.storageHead}>
            <Tape rotate="-3deg" />
            <Text style={styles.storageTitle}>Everything is stored here</Text>
            <Text style={styles.storageBody}>
              No account, no cloud. Uninstalling Flipp takes your notes with it.
            </Text>
            {storage && storage.subjects + storage.noteQuestions + storage.sittings > 0 ? (
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{storage?.subjects ?? 0}</Text>
                <Text style={styles.statLabel}>subjects</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{storage?.noteQuestions ?? 0}</Text>
                <Text style={styles.statLabel}>questions</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{storage?.sittings ?? 0}</Text>
                <Text style={styles.statLabel}>sittings</Text>
              </View>
            </View>
            ) : null}
          </View>

          {storage && storage.triviaDecks > 0 ? (
            <Row
              icon="dice"
              title="Remove saved trivia"
              hint={`${storage.triviaDecks} deck${storage.triviaDecks === 1 ? '' : 's'} kept offline`}
              onPress={() => setPending('trivia')}
              style={styles.dividedTop}
            />
          ) : null}
          <Row
            icon="chart"
            title="Clear practice history"
            hint="Scores and streak. Your notes stay."
            tone="danger"
            onPress={() => setPending('history')}
            style={styles.dividedTop}
          />
          <Row
            icon="trash"
            title="Delete everything"
            hint="Notes, plans, and history."
            tone="danger"
            onPress={() => setPending('erase')}
            style={styles.dividedTop}
          />
        </View>

        <Text style={styles.footer}>Flipp v{version} · made to work offline</Text>
      </ScrollView>

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
    paddingHorizontal: 16,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingTop: 6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface,
    ...outline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backArrow: {
    fontFamily: font.heading,
    fontSize: 19,
    lineHeight: 24,
    color: colors.ink,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: font.hero,
    fontSize: 26,
    lineHeight: 34,
    color: colors.text,
  },
  titleSticker: {
    backgroundColor: colors.accentWash,
    ...outline,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 1,
    transform: [{ rotate: '-2.5deg' }],
    ...shadow.card,
  },
  titleStickerText: {
    fontFamily: font.hero,
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
  },
  squiggle: {
    marginTop: 1,
    marginLeft: 2,
  },
  card: {
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    marginBottom: 14,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
    minHeight: 56,
  },
  // Hairlines instead of gaps: one list, not a stack of stickers.
  divided: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.lineSoft,
  },
  dividedTop: {
    borderTopWidth: 1.5,
    borderTopColor: colors.lineSoft,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: font.heading,
    fontSize: 15.5,
    lineHeight: 20,
    color: colors.text,
  },
  rowTitleDanger: {
    color: colors.coral,
  },
  rowHint: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: colors.textFaint,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  valueText: {
    fontFamily: font.bodyBold,
    fontSize: 12.5,
    color: colors.textDim,
  },
  storageHead: {
    padding: 15,
  },
  storageTitle: {
    fontFamily: font.heading,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
  },
  storageBody: {
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.textDim,
    marginTop: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface2,
    ...derpRadius,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statNumber: {
    fontFamily: font.hero,
    fontSize: 22,
    lineHeight: 27,
    color: colors.text,
  },
  statLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textFaint,
  },
  footer: {
    fontFamily: font.bodySemibold,
    fontSize: 11.5,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 2,
  },
  pressed: {
    opacity: 0.8,
  },
});
