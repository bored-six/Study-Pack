/**
 * Reminders and streaks — the two places where date maths quietly ruins an
 * app. A reminder that fires in the past never arrives; one that fires
 * twice is why people turn notifications off; a streak that resets at
 * midnight in the wrong timezone loses a student their run.
 */

import {
  HORIZON_DAYS,
  MAX_REMINDERS,
  MIN_GAP_MIN,
  planReminders,
  reminderCopy,
} from '../../src/lib/schedule';
import { computeStreaks } from '../../src/lib/streak';
import type { Schedule } from '../../src/lib/types';
import { Report } from '../report';
import { unique } from '../util';

const DAY_MS = 86_400_000;

/** A Monday morning, so weekday rules are easy to reason about. */
const NOW = new Date(2026, 2, 2, 9, 0, 0).getTime();

function schedule(partial: Partial<Schedule> & Pick<Schedule, 'id' | 'deckName'>): Schedule {
  return {
    deckId: `note:${partial.deckName.toLowerCase()}`,
    timeOfDay: 19 * 60,
    repeat: 'daily',
    startDate: NOW,
    enabled: true,
    createdAt: NOW,
    ...partial,
  };
}

const SCHEDULES: Schedule[] = [
  schedule({ id: 1, deckName: 'Biology', timeOfDay: 19 * 60 }),
  // Same sitting as Biology — must not produce a second notification.
  schedule({ id: 2, deckName: 'Chemistry', timeOfDay: 19 * 60 + 5 }),
  // Close enough to collide with the Biology reminders, different sitting.
  schedule({ id: 3, deckName: 'History', timeOfDay: 19 * 60 + 25, repeat: 'weekdays' }),
  schedule({ id: 4, deckName: 'Economics', timeOfDay: 7 * 60, repeat: 'daily' }),
  schedule({ id: 5, deckName: 'Geography', timeOfDay: 16 * 60, repeat: 'weekly' }),
  schedule({ id: 6, deckName: 'Computing', timeOfDay: 12 * 60, repeat: 'once', startDate: NOW + 3 * DAY_MS }),
  schedule({ id: 7, deckName: 'Silenced', enabled: false }),
  schedule({ id: 8, deckName: 'Expired', repeat: 'once', startDate: NOW - 5 * DAY_MS }),
];

export function checkPlanner(): Report {
  const report = new Report(
    'Reminders & streaks',
    'Plans a fortnight of reminders from a realistic set of schedules and checks the guarantees the module documents: nothing in the past, nothing stacked, nothing silently dropped, and a streak that survives timezone edges.',
    'PLAN'
  );

  const plan = planReminders(SCHEDULES, { now: NOW });
  const horizonEnd = NOW + HORIZON_DAYS * DAY_MS;

  const inThePast = plan.filter((r) => r.at <= NOW);
  const beyondHorizon = plan.filter((r) => r.at > horizonEnd);
  const outOfOrder = plan.filter((r, i) => i > 0 && r.at < plan[i - 1].at);

  const tooClose: string[] = [];
  for (let i = 1; i < plan.length; i++) {
    const previous = plan[i - 1];
    const current = plan[i];
    const sameSitting = previous.session.at === current.session.at;
    if (!sameSitting && current.at - previous.at < MIN_GAP_MIN * 60_000) {
      tooClose.push(
        `${new Date(previous.at).toLocaleString()} then ${new Date(current.at).toLocaleString()} — ${Math.round(
          (current.at - previous.at) / 60_000
        )} min apart, different sittings`
      );
    }
  }

  // Disabled and lapsed schedules must contribute nothing at all.
  const mentioned = new Set(
    plan.flatMap((r) => [...r.session.occurrences.map((o) => o.deckName), ...r.foldedDeckNames])
  );
  const ghosts = ['Silenced', 'Expired'].filter((name) => mentioned.has(name));
  const missing = ['Biology', 'Chemistry', 'History', 'Economics', 'Geography', 'Computing'].filter(
    (name) => !mentioned.has(name)
  );

  // Weekday and weekly rules.
  const weekdayMisfires = plan
    .flatMap((r) => r.session.occurrences)
    .filter((o) => o.deckName === 'History')
    .filter((o) => [0, 6].includes(new Date(o.at).getDay()));

  const weeklyMisfires = plan
    .flatMap((r) => r.session.occurrences)
    .filter((o) => o.deckName === 'Geography')
    .filter((o) => new Date(o.at).getDay() !== new Date(NOW).getDay());

  // Wall-clock stability: a 07:00 daily reminder is 07:00 every day of the
  // fortnight, DST changeover included.
  const clockDrift = plan
    .flatMap((r) => r.session.occurrences)
    .filter((o) => o.deckName === 'Economics')
    .filter((o) => {
      const d = new Date(o.at);
      return d.getHours() !== 7 || d.getMinutes() !== 0;
    })
    .map((o) => new Date(o.at).toLocaleString());

  // Copy.
  const copies = plan.map(reminderCopy);
  const brokenCopy = copies
    .filter(
      (c) =>
        !c.title.trim() ||
        !c.body.trim() ||
        /undefined|null|NaN/.test(`${c.title} ${c.body}`) ||
        /\s{2,}/.test(`${c.title}${c.body}`) ||
        /(?:^|\s)\.|\.\s*$/.test(c.body.replace(/\.\.\./g, ''))
    )
    .map((c) => `${c.title} — ${c.body}`);

  const distinctBodies = unique(copies.map((c) => `${c.title}|${c.body}`)).length;

  report.metric('Reminders planned', `${plan.length} over ${HORIZON_DAYS} days`, `cap is ${MAX_REMINDERS}`);
  report.metric(
    'Distinct notification texts',
    `${distinctBodies} of ${copies.length}`,
    'identical copy for different subjects is what makes reminders ignorable'
  );
  report.metric(
    'Sample copy',
    copies.slice(0, 3).map((c) => `“${c.title} — ${c.body}”`).join('  ·  ') || 'none',
    'read it as a student would'
  );

  report.flagIf(
    inThePast.length > 0,
    'high',
    'Reminders scheduled in the past',
    'A notification armed for a moment that has already passed either fires immediately or never — both look broken.',
    inThePast.map((r) => new Date(r.at).toLocaleString())
  );

  report.flagIf(
    missing.length > 0,
    'high',
    'A planned quiz gets no reminder at all',
    'These schedules are enabled and fall inside the horizon, yet no reminder mentions them — the student planned a session and will not be told about it.',
    missing
  );

  report.flagIf(
    ghosts.length > 0,
    'high',
    'A disabled or lapsed schedule still produces reminders',
    'Switching a plan off, or letting a one-off date pass, must silence it.',
    ghosts
  );

  report.flagIf(
    tooClose.length > 0,
    'medium',
    `Two reminders for different sittings less than ${MIN_GAP_MIN} minutes apart`,
    'The coalescing rule exists to stop notifications stacking up; these slipped past it.',
    tooClose,
    'src/lib/schedule.ts → planReminders'
  );

  report.flagIf(
    beyondHorizon.length > 0 || plan.length > MAX_REMINDERS,
    'medium',
    'Plan exceeds its own bounds',
    `Reminders must stay inside ${HORIZON_DAYS} days and under ${MAX_REMINDERS} armed notifications.`,
    beyondHorizon.map((r) => new Date(r.at).toLocaleString())
  );

  report.flagIf(
    outOfOrder.length > 0,
    'medium',
    'Reminders are not in chronological order',
    'The gap rule compares each reminder with the previous one, so an unsorted list means the rule was applied to the wrong pair.',
    outOfOrder.map((r) => new Date(r.at).toLocaleString())
  );

  report.flagIf(
    weekdayMisfires.length > 0,
    'medium',
    'A weekdays-only quiz is scheduled at the weekend',
    'The repeat rule says Monday to Friday.',
    weekdayMisfires.map((o) => new Date(o.at).toDateString())
  );

  report.flagIf(
    weeklyMisfires.length > 0,
    'medium',
    'A weekly quiz drifts off its weekday',
    'A weekly repeat should land on the same day of the week as its start date.',
    weeklyMisfires.map((o) => new Date(o.at).toDateString())
  );

  report.flagIf(
    clockDrift.length > 0,
    'high',
    'Reminder time drifts against the wall clock',
    'A 07:00 daily reminder must be 07:00 on every day of the fortnight. Drift here means the clocks-change day fires an hour out.',
    clockDrift,
    'src/lib/schedule.ts → atLocalTime'
  );

  report.flagIf(
    brokenCopy.length > 0,
    'low',
    'Notification copy renders badly',
    'Empty text, a stray "undefined", doubled spaces, or a dangling full stop.',
    brokenCopy,
    'src/lib/schedule.ts → reminderCopy'
  );

  report.flagIf(
    copies.length > 3 && distinctBodies === 1,
    'medium',
    'Every reminder says exactly the same thing',
    'Different subjects at different times produce identical copy, so the notification carries no information beyond "something is due".'
  );

  // --- streaks -----------------------------------------------------------

  const day = (offset: number, hour = 12) =>
    new Date(2026, 2, 2 + offset, hour, 0, 0).getTime();

  const cases: { name: string; timestamps: number[]; expect: number; why: string }[] = [
    { name: 'no attempts', timestamps: [], expect: 0, why: 'nothing to count' },
    { name: 'today only', timestamps: [day(0)], expect: 1, why: 'one day is a streak of one' },
    {
      name: 'yesterday only',
      timestamps: [day(-1)],
      expect: 1,
      why: 'documented: a streak stays alive until midnight',
    },
    { name: 'two days ago only', timestamps: [day(-2)], expect: 0, why: 'the run has been broken' },
    {
      name: 'three in a row',
      timestamps: [day(-2), day(-1), day(0)],
      expect: 3,
      why: 'consecutive days',
    },
    {
      name: 'unsorted input',
      timestamps: [day(0), day(-2), day(-1)],
      expect: 3,
      why: 'attempt order must not matter',
    },
    {
      name: 'several attempts one day',
      timestamps: [day(0, 8), day(0, 13), day(0, 22)],
      expect: 1,
      why: 'a day counts once however hard you study',
    },
    {
      name: 'gap in the middle',
      timestamps: [day(-6), day(-5), day(-1), day(0)],
      expect: 2,
      why: 'only the run touching today counts',
    },
    {
      name: 'just before midnight, then just after',
      timestamps: [day(-1, 23), day(0, 0)],
      expect: 2,
      why: 'local midnight separates two days',
    },
  ];

  const streakFailures: string[] = [];
  for (const testCase of cases) {
    const { current, longest } = computeStreaks(testCase.timestamps, day(0, 15));
    if (current !== testCase.expect) {
      streakFailures.push(
        `${testCase.name}: current streak ${current}, expected ${testCase.expect} — ${testCase.why}`
      );
    }
    if (longest < current) {
      streakFailures.push(`${testCase.name}: longest (${longest}) is below current (${current})`);
    }
  }

  const future = computeStreaks([day(0), day(5)], day(0, 15));
  if (future.current !== 1) {
    streakFailures.push(
      `a timestamp from a device with a fast clock changed today's streak to ${future.current}`
    );
  }

  report.metric('Streak cases exercised', cases.length + 1);
  report.flagIf(
    streakFailures.length > 0,
    'high',
    'Streak counted wrongly',
    'The streak is the number a student checks daily; getting it wrong is immediately visible and feels like lost work.',
    streakFailures,
    'src/lib/streak.ts → computeStreaks'
  );

  return report;
}
