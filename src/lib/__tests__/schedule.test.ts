import {
  bucketIntoSessions,
  expandOccurrences,
  joinDeckNames,
  planReminders,
  reminderCopy,
  type Occurrence,
} from '../schedule';
import type { Schedule } from '../types';

/** Local-time timestamp helper so tests read like a wall clock. */
function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 7, day, hour, minute).getTime();
}

function schedule(over: Partial<Schedule> & Pick<Schedule, 'id' | 'deckName'>): Schedule {
  return {
    deckId: `deck-${over.id}`,
    timeOfDay: 19 * 60,
    repeat: 'once',
    startDate: at(24, 0),
    enabled: true,
    createdAt: at(20, 0),
    ...over,
  };
}

describe('expandOccurrences', () => {
  it('emits a single occurrence for a one-off', () => {
    const found = expandOccurrences([schedule({ id: 1, deckName: 'Biology' })], at(24, 0), at(31, 0));
    expect(found).toHaveLength(1);
    expect(found[0].at).toBe(at(24, 19));
  });

  it('repeats daily and stays inside the window', () => {
    const daily = schedule({ id: 1, deckName: 'Biology', repeat: 'daily' });
    const found = expandOccurrences([daily], at(24, 0), at(26, 23, 59));
    expect(found.map((o) => o.at)).toEqual([at(24, 19), at(25, 19), at(26, 19)]);
  });

  it('skips weekends for weekdays repeats', () => {
    // 2026-08-29 is a Saturday, 30th a Sunday.
    const weekdays = schedule({
      id: 1,
      deckName: 'Biology',
      repeat: 'weekdays',
      startDate: at(28, 0),
    });
    const found = expandOccurrences([weekdays], at(28, 0), at(31, 23, 59));
    const days = found.map((o) => new Date(o.at).getDate());
    expect(days).toEqual([28, 31]);
  });

  it('ignores disabled schedules and days before the start date', () => {
    const off = schedule({ id: 1, deckName: 'Biology', repeat: 'daily', enabled: false });
    expect(expandOccurrences([off], at(24, 0), at(28, 0))).toHaveLength(0);

    const later = schedule({ id: 2, deckName: 'Chem', repeat: 'daily', startDate: at(26, 0) });
    const found = expandOccurrences([later], at(24, 0), at(27, 23, 59));
    expect(found.map((o) => new Date(o.at).getDate())).toEqual([26, 27]);
  });
});

describe('bucketIntoSessions', () => {
  const occurrence = (name: string, when: number): Occurrence => ({
    scheduleId: 1,
    deckId: name,
    deckName: name,
    at: when,
  });

  it('groups quizzes at the same time into one sitting', () => {
    const sessions = bucketIntoSessions([
      occurrence('Biology', at(24, 19)),
      occurrence('Chemistry', at(24, 19)),
      occurrence('History', at(24, 19, 10)),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].occurrences).toHaveLength(3);
  });

  it('keeps distant quizzes separate', () => {
    const sessions = bucketIntoSessions([
      occurrence('Biology', at(24, 19)),
      occurrence('History', at(24, 21)),
    ]);
    expect(sessions).toHaveLength(2);
  });
});

describe('planReminders', () => {
  const now = at(24, 12);

  it('emits one advance and one start per sitting by default', () => {
    const plan = planReminders([schedule({ id: 1, deckName: 'Biology' })], { now });
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ kind: 'advance', at: at(24, 18, 50) });
    expect(plan[1]).toMatchObject({ kind: 'start', at: at(24, 19) });
  });

  it('collapses three quizzes at one time into two notifications', () => {
    const plan = planReminders(
      [
        schedule({ id: 1, deckName: 'Biology' }),
        schedule({ id: 2, deckName: 'Chemistry' }),
        schedule({ id: 3, deckName: 'History', timeOfDay: 19 * 60 + 10 }),
      ],
      { now }
    );

    expect(plan).toHaveLength(2);
    expect(plan[0].session.occurrences).toHaveLength(3);
    expect(reminderCopy(plan[0]).title).toBe('3 quizzes in 10 min');
  });

  it('never fires two notifications inside the minimum gap', () => {
    const plan = planReminders(
      [
        schedule({ id: 1, deckName: 'Biology' }),
        schedule({ id: 2, deckName: 'Chemistry', timeOfDay: 19 * 60 + 20 }),
        schedule({ id: 3, deckName: 'History', timeOfDay: 19 * 60 + 40 }),
      ],
      { now }
    );

    // Reminders for *different* sittings must never crowd each other. A
    // sitting's own warning-then-start pair is exempt: the user asked for it.
    for (let i = 1; i < plan.length; i++) {
      if (plan[i].session.at === plan[i - 1].session.at) continue;
      expect(plan[i].at - plan[i - 1].at).toBeGreaterThanOrEqual(15 * 60_000);
    }

    // Nothing is silently lost: the crowded-out decks ride along in the copy.
    const mentioned = plan.flatMap((r) => [
      ...r.session.occurrences.map((o) => o.deckName),
      ...r.foldedDeckNames,
    ]);
    expect(new Set(mentioned)).toEqual(new Set(['Biology', 'Chemistry', 'History']));
  });

  it('lets a start alert beat a colliding advance warning, keeping both decks', () => {
    // Chemistry's 10-min warning lands exactly on Biology's start time.
    const plan = planReminders(
      [
        schedule({ id: 1, deckName: 'Biology' }),
        schedule({ id: 2, deckName: 'Chemistry', timeOfDay: 19 * 60 + 20 }),
      ],
      { now }
    );

    const start = plan.find((r) => r.at === at(24, 19));
    expect(start?.kind).toBe('start');
    const copy = reminderCopy(start!);
    expect(copy.body).toContain('Biology');
  });

  it('drops reminders whose lead time has already passed', () => {
    const soon = planReminders([schedule({ id: 1, deckName: 'Biology' })], {
      now: at(24, 18, 55),
    });
    expect(soon).toHaveLength(1);
    expect(soon[0].kind).toBe('start');
  });

  it('respects the reminder budget', () => {
    const daily = schedule({ id: 1, deckName: 'Biology', repeat: 'daily' });
    const plan = planReminders([daily], { now, maxReminders: 5 });
    expect(plan).toHaveLength(5);
  });

  it('honours custom lead times', () => {
    const plan = planReminders([schedule({ id: 1, deckName: 'Biology' })], {
      now,
      leads: [60, 0],
    });
    expect(plan.map((r) => r.leadMinutes)).toEqual([60, 0]);
  });
});

describe('copy', () => {
  it('names up to two decks and counts the rest', () => {
    expect(joinDeckNames(['Biology'])).toBe('Biology');
    expect(joinDeckNames(['Biology', 'Chem'])).toBe('Biology & Chem');
    expect(joinDeckNames(['Biology', 'Chem', 'History', 'Art'])).toBe('Biology, Chem +2');
  });

  it('deduplicates repeated deck names', () => {
    expect(joinDeckNames(['Biology', 'Biology'])).toBe('Biology');
  });

  it('uses singular wording for a lone quiz', () => {
    const plan = planReminders([schedule({ id: 1, deckName: 'Biology' })], { now: at(24, 12) });
    expect(reminderCopy(plan[0]).title).toBe('1 quiz in 10 min');
    expect(reminderCopy(plan[1]).title).toBe('Time to study');
  });
});
