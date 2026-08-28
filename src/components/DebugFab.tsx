import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AchievementModal } from '@/components/AchievementModal';
import { DoodleFlame } from '@/components/DoodleFlame';
import { Icon } from '@/components/Icon';
import { ACHIEVEMENTS, achievementById, type Unlock } from '@/lib/achievements';
import { clearPracticeHistory, eraseEverything, getDb, writeSetting } from '@/lib/db';
import { FIRE_TIERS } from '@/lib/fire';
import { useAchievementsStore } from '@/store/achievements';
import { useProgressStore } from '@/store/progress';
import { derpRadius, font, getColors, outline, shadow, useThemeStore } from '@/theme/tokens';

/**
 * The bug button: a movable control panel for exercising states that are
 * otherwise slow to reach — a 300-day streak, a specific achievement, a
 * full wall chart.
 *
 * Three things make it usable rather than merely present:
 *
 *   - it drags, so it never sits on top of the thing being inspected;
 *   - the panel is not a Modal, so the screen behind stays visible *and*
 *     tappable — set a tier and watch Progress redraw underneath;
 *   - every action reports what it did, because silence is
 *     indistinguishable from a no-op.
 *
 * It returns null outside development, so it cannot reach a real build.
 */

/** Attempts written by this panel, so they can be cleaned up on their own. */
const DEBUG_DECK = 'debug_deck';

const DAY = 86_400_000;

export function DebugFab() {
  if (!__DEV__) return null;
  return <DebugFabInner />;
}

function DebugFabInner() {
  const isDark = useThemeStore((s) => s.isDark);
  const colors = getColors(isDark);
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Unlock[]>([]);
  const [showReveal, setShowReveal] = useState(false);
  const [customDays, setCustomDays] = useState('');

  const currentStreak = useProgressStore((s) => s.currentStreak);
  const unlocked = useAchievementsStore((s) => s.unlocked);

  // ---- the button drags, so it can be parked out of the way ----
  const [pos, setPos] = useState({ x: screen.width - 78, y: screen.height - 220 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragged = useRef(false);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch immediately. Only asking for it on movement
        // means a plain tap is never granted, so the release handler --
        // and with it the whole button -- never fires.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          dragged.current = false;
        },
        onPanResponderMove: (_e, g) => {
          dragged.current = true;
          const x = Math.min(Math.max(0, posRef.current.x + g.dx), screen.width - 54);
          const y = Math.min(Math.max(insets.top, posRef.current.y + g.dy), screen.height - 90);
          setPos({ x, y });
        },
        onPanResponderRelease: () => {
          if (!dragged.current) setOpen((o) => !o);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [insets.top, screen.height, screen.width]
  );

  const say = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((t) => (t === message ? null : t)), 2600);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      useProgressStore.getState().refresh(),
      useAchievementsStore.getState().refresh(),
    ]);
  }, []);

  /**
   * Writes one attempt per day for the last `days` days, in a single
   * transaction. Row-at-a-time autocommits made a year-long streak take
   * the better part of a minute.
   */
  const setStreak = useCallback(
    async (days: number) => {
      if (busy) return;
      setBusy(true);
      try {
        const db = getDb();
        await db.runAsync(`DELETE FROM attempts WHERE deck_id = ?`, DEBUG_DECK);
        if (days > 0) {
          const now = Date.now();
          await db.withTransactionAsync(async () => {
            for (let i = 0; i < days; i++) {
              await db.runAsync(
                `INSERT INTO attempts (deck_id, score, total, duration_ms, completed_at)
                 VALUES (?, ?, ?, ?, ?)`,
                DEBUG_DECK,
                5,
                5,
                60_000,
                now - i * DAY
              );
            }
          });
        }
        await refreshAll();
        say(days === 0 ? 'Streak cleared' : `Streak set to ${days} days`);
      } catch (e) {
        say(`Failed: ${String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, refreshAll, say]
  );

  /** Scatters activity across twelve weeks so the wall chart has shape. */
  const fillChart = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const db = getDb();
      const now = Date.now();
      await db.withTransactionAsync(async () => {
        for (let d = 0; d < 84; d++) {
          // leave roughly a third of days empty, so gaps are visible
          const rounds = Math.random() < 0.34 ? 0 : 1 + Math.floor(Math.random() * 4);
          for (let r = 0; r < rounds; r++) {
            await db.runAsync(
              `INSERT INTO attempts (deck_id, score, total, duration_ms, completed_at)
               VALUES (?, ?, ?, ?, ?)`,
              DEBUG_DECK,
              3 + Math.floor(Math.random() * 3),
              5,
              60_000,
              now - d * DAY - r * 3_600_000
            );
          }
        }
      });
      await refreshAll();
      say('Wall chart filled with 12 weeks');
    } catch (e) {
      say(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAll, say]);

  /** Reveals a specific achievement and keeps it, so the album fills. */
  const unlock = useCallback(
    async (id: string) => {
      const def = achievementById(id);
      if (!def) return;
      const already = useAchievementsStore.getState().unlocked;
      const entry: Unlock = {
        id,
        at: Date.now(),
        note: def.notes[Math.floor(Math.random() * def.notes.length)],
      };
      if (!already.some((u) => u.id === id)) {
        await writeSetting('achievements_unlocked', JSON.stringify([...already, entry]));
        await useAchievementsStore.getState().refresh();
      }
      setReveal([entry]);
      setShowReveal(true);
    },
    []
  );

  const lockAll = useCallback(async () => {
    await writeSetting('achievements_unlocked', JSON.stringify([]));
    await useAchievementsStore.getState().refresh();
    say('All stickers re-locked');
  }, [say]);

  const wipeHistory = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearPracticeHistory();
      await refreshAll();
      say('Practice history cleared');
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAll, say]);

  const wipeAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await eraseEverything();
      await refreshAll();
      say('Everything erased');
    } finally {
      setBusy(false);
    }
  }, [busy, refreshAll, say]);

  const unlockedIds = useMemo(() => new Set(unlocked.map((u) => u.id)), [unlocked]);

  return (
    <>
      {/* The panel is deliberately not a Modal: the screen behind stays
          visible and usable, so a tier change can be watched live. */}
      {open ? (
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.grabber} />

          <View style={styles.headRow}>
            <Text style={styles.title}>Debug</Text>
            <Text style={styles.headNote}>
              streak {currentStreak}d · {unlocked.length}/{ACHIEVEMENTS.length} stickers
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} style={styles.closeX}>
              <Icon name="cross" size={16} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            <Text style={styles.section}>FIRE TIER — tap to jump</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierRow}>
              {FIRE_TIERS.map((tier) => {
                const active = FIRE_TIERS.filter((t) => currentStreak >= t.from).pop() === tier;
                return (
                  <Pressable
                    key={tier.from}
                    disabled={busy}
                    onPress={() => setStreak(tier.from === 0 ? 0 : tier.from)}
                    style={[styles.tierChip, active && styles.tierChipOn]}>
                    <DoodleFlame tier={tier} size={38} lit={tier.from > 0} />
                    <Text style={styles.tierDays}>{tier.from}</Text>
                    <Text style={styles.tierName} numberOfLines={1}>
                      {tier.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.inlineRow}>
              <TextInput
                style={styles.input}
                value={customDays}
                onChangeText={setCustomDays}
                keyboardType="number-pad"
                placeholder="days"
                placeholderTextColor={colors.textFaint}
                maxLength={4}
              />
              <Pressable
                disabled={busy}
                onPress={() => setStreak(Math.max(0, parseInt(customDays, 10) || 0))}
                style={[styles.btn, styles.btnGrow]}>
                <Text style={styles.btnText}>Set exact streak</Text>
              </Pressable>
            </View>

            <Text style={styles.section}>DATA</Text>
            <View style={styles.btnRow}>
              <Pressable disabled={busy} onPress={fillChart} style={[styles.btn, styles.btnGrow]}>
                <Text style={styles.btnText}>Fill wall chart</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={wipeHistory} style={[styles.btn, styles.btnGrow]}>
                <Text style={styles.btnText}>Clear history</Text>
              </Pressable>
            </View>
            <Pressable disabled={busy} onPress={wipeAll} style={[styles.btn, styles.btnDanger]}>
              <Text style={[styles.btnText, styles.btnDangerText]}>Erase everything</Text>
            </Pressable>

            <Text style={styles.section}>
              STICKERS — tap to unlock and reveal
            </Text>
            <View style={styles.btnRow}>
              <Pressable
                onPress={() => unlock(ACHIEVEMENTS[Math.floor(Math.random() * ACHIEVEMENTS.length)].id)}
                style={[styles.btn, styles.btnGrow]}>
                <Text style={styles.btnText}>Random</Text>
              </Pressable>
              <Pressable onPress={lockAll} style={[styles.btn, styles.btnGrow]}>
                <Text style={styles.btnText}>Re-lock all</Text>
              </Pressable>
            </View>
            <View style={styles.achGrid}>
              {ACHIEVEMENTS.map((a) => {
                const got = unlockedIds.has(a.id);
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => unlock(a.id)}
                    style={[styles.achChip, got && styles.achChipOn]}>
                    <Icon
                      name={a.icon}
                      size={15}
                      color={got ? colors.accentDeep : colors.textDim}
                      fill="#FFFFFF"
                      strokeWidth={1.7}
                    />
                    <Text style={[styles.achText, got && styles.achTextOn]} numberOfLines={1}>
                      {a.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {toast ? (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{busy ? 'Working…' : toast}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        {...pan.panHandlers}
        style={[styles.fab, { left: pos.x, top: pos.y }, open && styles.fabOpen]}>
        <Text style={styles.fabText}>{open ? '×' : '🐞'}</Text>
      </View>

      <AchievementModal
        visible={showReveal}
        celebrate
        unlocks={reveal}
        onClose={() => setShowReveal(false)}
      />
    </>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    fab: {
      position: 'absolute',
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.goldWash,
      ...outline,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.pop,
      zIndex: 10000,
      elevation: 12,
    },
    fabOpen: {
      backgroundColor: colors.coralWash,
    },
    fabText: {
      fontSize: 24,
      lineHeight: 28,
      color: colors.text,
    },

    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '62%',
      backgroundColor: colors.surface,
      borderTopWidth: 2,
      borderColor: colors.ink,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 14,
      paddingTop: 8,
      zIndex: 9998,
      elevation: 10,
    },
    grabber: {
      alignSelf: 'center',
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.edge,
      marginBottom: 8,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 4,
    },
    title: {
      fontFamily: font.hero,
      fontSize: 22,
      color: colors.text,
    },
    headNote: {
      flex: 1,
      fontFamily: font.bodySemibold,
      fontSize: 11,
      color: colors.textFaint,
    },
    closeX: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },

    scroll: { flexGrow: 0 },
    scrollBody: { paddingBottom: 10 },

    section: {
      fontFamily: font.bodyHeavy,
      fontSize: 9.5,
      letterSpacing: 1.3,
      color: colors.accentDeep,
      marginTop: 14,
      marginBottom: 6,
    },

    tierRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
    tierChip: {
      width: 62,
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 2,
      backgroundColor: colors.bg,
      ...outline,
      borderRadius: 12,
    },
    tierChipOn: {
      backgroundColor: colors.accentWash,
      borderColor: colors.accentDeep,
    },
    tierDays: {
      fontFamily: font.hero,
      fontSize: 14,
      color: colors.text,
      lineHeight: 16,
    },
    tierName: {
      fontFamily: font.bodySemibold,
      fontSize: 7.5,
      color: colors.textFaint,
    },

    inlineRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    input: {
      width: 78,
      backgroundColor: colors.bg,
      ...outline,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      fontFamily: font.bodyBold,
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
    },

    btnRow: { flexDirection: 'row', gap: 8 },
    btn: {
      backgroundColor: colors.bg,
      ...outline,
      ...derpRadius,
      paddingVertical: 11,
      paddingHorizontal: 12,
      alignItems: 'center',
      marginBottom: 8,
    },
    btnGrow: { flex: 1 },
    btnText: {
      fontFamily: font.heading,
      fontSize: 13.5,
      color: colors.text,
    },
    btnDanger: { backgroundColor: colors.coralWash, borderColor: colors.coral },
    btnDangerText: { color: colors.coral },

    achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    achChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.bg,
      ...outline,
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 9,
      maxWidth: '48%',
    },
    achChipOn: {
      backgroundColor: colors.accentWash,
      borderColor: colors.accentDeep,
    },
    achText: {
      fontFamily: font.bodySemibold,
      fontSize: 10.5,
      color: colors.textDim,
      flexShrink: 1,
    },
    achTextOn: { color: colors.accentDeep },

    toast: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: -44,
      backgroundColor: colors.ink,
      borderRadius: 999,
      paddingVertical: 9,
      paddingHorizontal: 16,
      alignItems: 'center',
      ...shadow.pop,
    },
    toastText: {
      fontFamily: font.bodyBold,
      fontSize: 12.5,
      color: colors.bg,
    },
  });
