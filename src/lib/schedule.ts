/**
 * The scheduling engine: turns saved schedules into a coalesced list of
 * reminders to arm. Pure date math — no platform APIs, no I/O — so the
 * same plan drives Android notifications and the desktop build, and the
 * whole thing is unit-testable.
 *
 * The unit of notification is a *session* (one sitting, possibly several
 * decks), never an individual schedule. That is what stops five schedules
 * at 7pm from firing five notifications.
 */
import type { Repeat, Schedule } from './types';

/** Occurrences this far apart or closer are the same sitting. */
export const SESSION_WINDOW_MIN = 15;

/** Never fire two notifications closer together than this. */
export const MIN_GAP_MIN = 15;

/** How far ahead to plan. Re-armed on every app foreground. */
export const HORIZON_DAYS = 14;

/**
 * Upper bound on armed notifications. Android has no hard cap like iOS,
 * but chatty apps get punished by OEM battery managers, so stay modest.
 */
export const MAX_REMINDERS = 48;

/** Default lead times in minutes; 0 means "at the scheduled time". */
export const DEFAULT_LEADS = [10, 0];

/** Every lead the user can switch on, longest first. */
export const AVAILABLE_LEADS = [60, 30, 10, 5, 1, 0];

export const LEAD_LABEL: Record<number, string> = {
  60: '1 hour before',
  30: '30 min before',
  10: '10 min before',
  5: '5 min before',
  1: '1 min before',
  0: 'At start time',
};

export interface Occurrence {
  scheduleId: number;
  deckId: string;
  deckName: string;
  at: number;
}

export interface Session {
  /** Earliest occurrence in the sitting. */
  at: number;
  occurrences: Occurrence[];
}

export interface PlannedReminder {
  at: number;
  kind: 'advance' | 'start';
  leadMinutes: number;
  session: Session;
  /** Deck names from nearby sessions folded in by coalescing. */
  foldedDeckNames: string[];
}

const DAY_MS = 86_400_000;

function startOfLocalDay(timestamp: number): Date {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Builds a timestamp for `minutes` past local midnight on `day`. Built via
 * the local-time Date constructor so DST shifts resolve the way a wall
 * clock would.
 */
function atLocalTime(day: Date, minutes: number): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
}

function occursOn(repeat: Repeat, day: Date, start: Date): boolean {
  switch (repeat) {
    case 'once':
      return day.getTime() === start.getTime();
    case 'daily':
      return true;
    case 'weekdays': {
      const dow = day.getDay();
      return dow >= 1 && dow <= 5;
    }
    case 'weekly':
      return day.getDay() === start.getDay();
  }
}

/** The single moment a plan's start day and time of day land on. */
export function occurrenceAt(schedule: Pick<Schedule, 'startDate' | 'timeOfDay'>): number {
  return atLocalTime(startOfLocalDay(schedule.startDate), schedule.timeOfDay);
}

/**
 * A one-off plan is *spent* once its moment has gone by: it can never fire
 * again, so leaving the switch on would be a lie. Repeats are never spent.
 */
export function isSpent(schedule: Schedule, now: number = Date.now()): boolean {
  return schedule.repeat === 'once' && occurrenceAt(schedule) <= now;
}

/**
 * Ids of enabled one-offs that have gone by. The planner switches these
 * off for the student rather than leaving dead plans looking armed.
 */
export function spentScheduleIds(
  schedules: readonly Schedule[],
  now: number = Date.now()
): number[] {
  return schedules.filter((s) => s.enabled && isSpent(s, now)).map((s) => s.id);
}

/**
 * The next time this time of day comes around — today if it is still
 * ahead, otherwise tomorrow. Switching a spent one-off back on moves it
 * here, so the switch means something instead of flicking straight off.
 */
export function nextOccurrenceFrom(timeOfDay: number, now: number = Date.now()): number {
  const today = startOfLocalDay(now);
  const at = atLocalTime(today, timeOfDay);
  if (at > now) return at;
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return atLocalTime(tomorrow, timeOfDay);
}

/** Expands schedules into concrete dated occurrences within the window. */
export function expandOccurrences(
  schedules: readonly Schedule[],
  from: number,
  to: number
): Occurrence[] {
  const out: Occurrence[] = [];
  const firstDay = startOfLocalDay(from);

  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    const start = startOfLocalDay(schedule.startDate);

    for (let i = 0; ; i++) {
      const day = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + i);
      const dayStart = day.getTime();
      if (dayStart > to) break;
      if (dayStart < start.getTime()) continue;
      if (!occursOn(schedule.repeat, day, start)) continue;

      const at = atLocalTime(day, schedule.timeOfDay);
      if (at >= from && at <= to) {
        out.push({
          scheduleId: schedule.id,
          deckId: schedule.deckId,
          deckName: schedule.deckName,
          at,
        });
      }
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

/**
 * Groups occurrences that land within SESSION_WINDOW_MIN of each other
 * into one sitting, so "Biology 7:00 + Chemistry 7:00" is a single event.
 */
export function bucketIntoSessions(occurrences: readonly Occurrence[]): Session[] {
  const sorted = [...occurrences].sort((a, b) => a.at - b.at);
  const windowMs = SESSION_WINDOW_MIN * 60_000;
  const sessions: Session[] = [];

  for (const occurrence of sorted) {
    const last = sessions[sessions.length - 1];
    if (last && occurrence.at - last.at <= windowMs) {
      last.occurrences.push(occurrence);
    } else {
      sessions.push({ at: occurrence.at, occurrences: [occurrence] });
    }
  }

  return sessions;
}

/** A start alert always outranks an advance warning. */
function outranks(a: PlannedReminder, b: PlannedReminder): boolean {
  if (a.kind !== b.kind) return a.kind === 'start';
  return a.session.at <= b.session.at;
}

export interface PlanOptions {
  now?: number;
  leads?: readonly number[];
  horizonDays?: number;
  maxReminders?: number;
}

/**
 * The whole pipeline: expand → bucket into sessions → generate reminders →
 * coalesce anything closer than MIN_GAP_MIN, folding the loser's decks
 * into the survivor so nothing silently disappears from the copy.
 */
export function planReminders(
  schedules: readonly Schedule[],
  options: PlanOptions = {}
): PlannedReminder[] {
  const {
    now = Date.now(),
    leads = DEFAULT_LEADS,
    horizonDays = HORIZON_DAYS,
    maxReminders = MAX_REMINDERS,
  } = options;

  const sessions = bucketIntoSessions(
    expandOccurrences(schedules, now, now + horizonDays * DAY_MS)
  );

  const candidates: PlannedReminder[] = [];
  for (const session of sessions) {
    for (const lead of leads) {
      const at = session.at - lead * 60_000;
      if (at <= now) continue;
      candidates.push({
        at,
        kind: lead === 0 ? 'start' : 'advance',
        leadMinutes: lead,
        session,
        foldedDeckNames: [],
      });
    }
  }

  candidates.sort((a, b) => a.at - b.at || (a.kind === 'start' ? -1 : 1));

  const gapMs = MIN_GAP_MIN * 60_000;
  const kept: PlannedReminder[] = [];

  for (const candidate of candidates) {
    const last = kept[kept.length - 1];
    // Reminders for the same sitting are spaced by the lead times the user
    // chose, so they are never coalesced against each other. The gap rule
    // exists to stop *different* sessions from stacking up.
    const sameSession = last != null && last.session.at === candidate.session.at;
    if (!last || sameSession || candidate.at - last.at >= gapMs) {
      kept.push(candidate);
      continue;
    }

    // Too close to the previous one — only one of them survives.
    const names = candidate.session.occurrences.map((o) => o.deckName);
    if (outranks(candidate, last)) {
      kept[kept.length - 1] = {
        ...candidate,
        foldedDeckNames: mergeNames(last.foldedDeckNames, last.session.occurrences.map((o) => o.deckName)),
      };
    } else {
      last.foldedDeckNames = mergeNames(last.foldedDeckNames, names);
    }
  }

  return kept.slice(0, maxReminders);
}

function mergeNames(existing: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(existing);
  const out = [...existing];
  for (const name of incoming) {
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** "Biology", "Biology & Chemistry", "Biology, Chemistry +2". */
export function joinDeckNames(names: readonly string[]): string {
  const unique = mergeNames([], names);
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
  return `${unique[0]}, ${unique[1]} +${unique.length - 2}`;
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Notification copy lives here rather than in the platform adapter so it
 * is testable and identical on every platform.
 */
export function reminderCopy(reminder: PlannedReminder): { title: string; body: string } {
  const names = reminder.session.occurrences.map((o) => o.deckName);
  const count = new Set(reminder.session.occurrences.map((o) => o.deckId)).size;
  const subject = joinDeckNames(names);
  const quizWord = count === 1 ? 'quiz' : 'quizzes';

  const title =
    reminder.kind === 'start'
      ? count === 1
        ? 'Time to study'
        : `Time to study — ${count} ${quizWord}`
      : `${count} ${quizWord} in ${reminder.leadMinutes} min`;

  let body = reminder.kind === 'start' ? `${subject} — ready when you are` : subject;

  if (reminder.foldedDeckNames.length > 0) {
    body += `. Then ${joinDeckNames(reminder.foldedDeckNames)}`;
  }

  return { title, body };
}
