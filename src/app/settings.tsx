import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
import { colors, derpRadius, font, outline, radius, shadow, tabClearance } from '@/theme/tokens';

/** Which destructive action is waiting on a yes. */
type Pending = 'trivia' | 'history' | 'erase' | 'eraseReally';

function SectionHeading({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionBadge}>
        <Icon name={icon} size={14} color={colors.ink} strokeWidth={2.4} />
      </View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

function SwitchRow({
  icon,
  title,
  body,
  value,
  onChange,
}: {
  icon: IconName;
  title: string;
  body: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBadge}>
        <Icon
          name={icon}
          size={19}
          color={colors.ink}
          fill={value ? colors.accentWash : colors.surface2}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ true: colors.accent, false: colors.track }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

function ActionRow({
  icon,
  title,
  body,
  label,
  onPress,
  tone,
}: {
  icon: IconName;
  title: string;
  body: string;
  label: string;
  onPress: () => void;
  tone?: 'danger';
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowBadge, tone === 'danger' && styles.rowBadgeDanger]}>
        <Icon
          name={icon}
          size={19}
          color={tone === 'danger' ? colors.coral : colors.ink}
          fill={tone === 'danger' ? colors.coralWash : colors.surface2}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
      <ChunkyButton
        label={label}
        variant="paper"
        size="sm"
        onPress={onPress}
        labelColor={tone === 'danger' ? colors.coral : undefined}
      />
    </View>
  );
}

export default function SettingsScreen() {
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

  // One writer for all four switches: flip the UI now, persist after, so a
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
      setNotice({
        title: 'Wiped',
        message: 'Flipp is back to the day you installed it.',
      });
    }
    readStorage();
  }, [pending, readStorage, refreshDecks, refreshNotes, refreshPlanner, refreshProgress]);

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const leadLabel =
    leads.length > 0
      ? leads.map((lead) => LEAD_LABEL[lead] ?? `${lead} min`).join(' · ')
      : 'No advance warning';

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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + tabClearance }]}
        showsVerticalScrollIndicator={false}>
        <SectionHeading icon="bell" label="SOUND & FEEL" />

        <SwitchRow
          icon="bell"
          title="Sound effects"
          body={prefs.sound ? 'Blups, boings, and the sad trombone.' : 'The exam sits quietly.'}
          value={prefs.sound}
          onChange={change('sound', setSound)}
        />
        <SwitchRow
          icon="smartphone"
          title="Vibration"
          body={prefs.vibration ? 'A little buzz on every answer.' : 'No buzzing.'}
          value={prefs.vibration}
          onChange={change('vibration', setVibration)}
        />
        <SwitchRow
          icon="star"
          title="Opening animation"
          body={prefs.intro ? 'The logo does its thing on launch.' : 'Straight to your subjects.'}
          value={prefs.intro}
          onChange={change('intro', setIntro)}
        />

        <SectionHeading icon="book" label="STUDYING" />

        <SwitchRow
          icon="question"
          title="Format how-tos"
          body={
            prefs.briefings
              ? 'Each exam format explains itself the first time it shows up.'
              : 'Hidden. The ? button in an exam still brings them back.'
          }
          value={prefs.briefings}
          onChange={change('briefings', setBriefings)}
        />

        <SectionHeading icon="clock" label="REMINDERS" />

        {capability === 'unsupported' ? (
          <View style={styles.row}>
            <View style={styles.rowBadge}>
              <Icon name="alert" size={19} color={colors.ink} fill={colors.surface2} strokeWidth={1.9} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Not on this device</Text>
              <Text style={styles.rowBody}>
                Reminders need a phone. Plans still show up in the Planner here.
              </Text>
            </View>
          </View>
        ) : capability === 'denied' ? (
          <ActionRow
            icon="bell"
            title="Reminders are off"
            body="Flipp can't nudge you about a planned quiz until you allow notifications."
            label="Turn on"
            onPress={() => void askForReminders()}
          />
        ) : (
          <View style={styles.row}>
            <View style={styles.rowBadge}>
              <Icon name="bell" size={19} color={colors.ink} fill={colors.accentWash} strokeWidth={1.9} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Reminders are on</Text>
              <Text style={styles.rowBody}>
                {leadLabel} · Android delivers these around the time, not to the minute.
              </Text>
            </View>
          </View>
        )}

        <Pressable
          onPress={() => router.push('/planner')}
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
          <View style={styles.rowBadge}>
            <Icon name="calendar" size={19} color={colors.ink} fill={colors.surface2} strokeWidth={1.9} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>When to remind you</Text>
            <Text style={styles.rowBody}>Set lead times next to your plans.</Text>
          </View>
          <Icon name="play" size={14} color={colors.accentDeep} />
        </Pressable>

        <SectionHeading icon="smartphone" label="ON THIS DEVICE" />

        <View style={styles.storageCard}>
          <Tape rotate="-3deg" />
          <Text style={styles.storageTitle}>Everything is stored here</Text>
          <Text style={styles.storageBody}>
            No account, no cloud, no internet needed. Which also means: uninstalling Flipp takes
            your notes with it.
          </Text>
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
        </View>

        {storage && storage.triviaDecks > 0 ? (
          <ActionRow
            icon="dice"
            title="Saved trivia"
            body={`${storage.triviaDecks} deck${storage.triviaDecks === 1 ? '' : 's'} · ${
              storage.triviaQuestions
            } questions kept offline.`}
            label="Remove"
            onPress={() => setPending('trivia')}
          />
        ) : null}

        <ActionRow
          icon="chart"
          title="Clear practice history"
          body="Scores, streak, mastery, and moments. Your notes stay."
          label="Clear"
          onPress={() => setPending('history')}
          tone="danger"
        />

        <ActionRow
          icon="trash"
          title="Delete everything"
          body="Subjects, notes, plans, history — all of it, off this phone."
          label="Delete"
          onPress={() => setPending('erase')}
          tone="danger"
        />

        <SectionHeading icon="bulb" label="ABOUT" />

        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>Flipp v{version}</Text>
          <Text style={styles.aboutBody}>
            Built to work with the plane on. Notes become questions on your phone, and nothing you
            write ever leaves it.
          </Text>
        </View>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingTop: 2,
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 9,
  },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  sectionLabel: {
    fontFamily: font.bodyHeavy,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.text,
  },
  sectionRule: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.lineSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 13,
    marginBottom: 9,
    ...shadow.card,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    ...outline,
    borderRadius: radius.card,
    padding: 13,
    marginBottom: 9,
    ...shadow.card,
  },
  rowBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.edge,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  rowBadgeDanger: {
    backgroundColor: colors.coralWash,
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
  rowBody: {
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.textDim,
  },
  storageCard: {
    backgroundColor: colors.goldWash,
    ...outline,
    borderRadius: radius.card,
    padding: 15,
    marginBottom: 9,
    ...shadow.card,
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
    backgroundColor: colors.surface,
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
  aboutCard: {
    backgroundColor: colors.surface2,
    ...outline,
    borderRadius: radius.card,
    padding: 15,
  },
  aboutTitle: {
    fontFamily: font.hero,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  aboutBody: {
    fontFamily: font.bodySemibold,
    fontSize: 12,
    lineHeight: 16.5,
    color: colors.textDim,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.8,
  },
});
