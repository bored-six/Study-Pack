import { create } from 'zustand';

import {
  createSchedule,
  deleteSchedule,
  disableSchedules,
  listSchedules,
  readSetting,
  setScheduleEnabled,
  setScheduleStart,
  writeSetting,
  type NewSchedule,
} from '@/lib/db';
import {
  armReminders,
  cancelAll,
  cancelSession,
  getCapability,
  requestPermission,
  type Capability,
} from '@/lib/notifications';
import {
  bucketIntoSessions,
  DEFAULT_LEADS,
  expandOccurrences,
  isSpent,
  nextOccurrenceFrom,
  planReminders,
  SESSION_WINDOW_MIN,
  spentScheduleIds,
  type PlannedReminder,
  type Session,
} from '@/lib/schedule';
import type { Schedule } from '@/lib/types';

const LEADS_KEY = 'reminder_leads';
const LOOKAHEAD_DAYS = 14;

interface PlannerState {
  schedules: Schedule[];
  /** Lead times in minutes the student has switched on. */
  leads: number[];
  capability: Capability;
  /** Reminders currently armed with the OS — what the UI reports back. */
  armed: PlannedReminder[];
  status: 'idle' | 'loading' | 'ready';
  refresh: () => Promise<void>;
  add: (schedule: NewSchedule) => Promise<void>;
  toggle: (id: number, enabled: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
  setLeads: (leads: number[]) => Promise<void>;
  askPermission: () => Promise<Capability>;
  /** Sittings coming up, soonest first — drives the Planner and Home. */
  upcoming: (now?: number) => Session[];
  /** Called when a planned quiz is finished so its reminders stop. */
  completeSession: (sessionAt: number) => Promise<void>;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  schedules: [],
  leads: [...DEFAULT_LEADS],
  capability: 'unsupported',
  armed: [],
  status: 'idle',

  refresh: async () => {
    set({ status: 'loading' });
    const [schedules, savedLeads, capability] = await Promise.all([
      listSchedules(),
      readSetting(LEADS_KEY),
      getCapability(),
    ]);

    const leads = parseLeads(savedLeads) ?? [...DEFAULT_LEADS];
    const live = await retireSpent(schedules);
    set({ schedules: live, leads, capability, status: 'ready' });
    await reArm(live, leads, set);
  },

  add: async (schedule) => {
    await createSchedule(schedule);
    const schedules = await listSchedules();
    set({ schedules });
    await reArm(schedules, get().leads, set);
  },

  toggle: async (id, enabled) => {
    // Switching a spent one-off back on has to give it a future date,
    // or the sweep would flick it straight off again.
    const current = get().schedules.find((s) => s.id === id);
    if (enabled && current && isSpent(current)) {
      await setScheduleStart(id, nextOccurrenceFrom(current.timeOfDay));
    }
    await setScheduleEnabled(id, enabled);
    const schedules = await listSchedules();
    set({ schedules });
    await reArm(schedules, get().leads, set);
  },

  remove: async (id) => {
    await deleteSchedule(id);
    const schedules = await listSchedules();
    set({ schedules });
    await reArm(schedules, get().leads, set);
  },

  setLeads: async (leads) => {
    const sorted = [...new Set(leads)].sort((a, b) => b - a);
    await writeSetting(LEADS_KEY, JSON.stringify(sorted));
    set({ leads: sorted });
    await reArm(get().schedules, sorted, set);
  },

  askPermission: async () => {
    const capability = await requestPermission();
    set({ capability });
    if (capability === 'approximate') {
      await reArm(get().schedules, get().leads, set);
    }
    return capability;
  },

  upcoming: (now = Date.now()) => {
    const { schedules } = get();
    return bucketIntoSessions(
      expandOccurrences(schedules, now, now + LOOKAHEAD_DAYS * 86_400_000)
    );
  },

  completeSession: async (sessionAt) => {
    await cancelSession(sessionAt);
  },
}));

/**
 * A quiz planned for one specific moment is done once that moment passes —
 * it can never fire again, so switch it off instead of leaving a dead plan
 * looking armed. Runs on every refresh, which is every time the Planner or
 * Home screen comes into focus.
 */
async function retireSpent(schedules: readonly Schedule[]): Promise<Schedule[]> {
  const spent = spentScheduleIds(schedules);
  if (spent.length === 0) return [...schedules];

  const ids = new Set(spent);
  try {
    await disableSchedules(spent);
  } catch (e) {
    // The plan is still shown either way; it just stays on until next time.
    console.warn('Could not retire spent plans', e);
    return [...schedules];
  }
  return schedules.map((s) => (ids.has(s.id) ? { ...s, enabled: false } : s));
}

function parseLeads(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const leads = parsed.filter((n): n is number => typeof n === 'number');
    return leads.length > 0 ? leads : null;
  } catch {
    return null;
  }
}

/**
 * Re-arms the OS from scratch after any change. Failing to schedule must
 * never break the UI — the plan is still saved and visible either way.
 */
async function reArm(
  schedules: readonly Schedule[],
  leads: readonly number[],
  set: (partial: Partial<PlannerState>) => void
): Promise<void> {
  try {
    if (schedules.length === 0) {
      await cancelAll();
      set({ armed: [] });
      return;
    }
    const result = await armReminders(schedules, leads);
    set({ capability: result.capability, armed: result.reminders });
  } catch (e) {
    console.warn('Could not arm reminders', e);
    set({ armed: planReminders(schedules, { leads }) });
  }
}

export { SESSION_WINDOW_MIN };
