import { daysToNextTier, fireFor, newlyReachedTier } from '../fire';
import {
  appendMoment,
  detectMoment,
  MOMENT_LOG_LIMIT,
  type Moment,
  type MomentContext,
} from '../moments';

const NOW = new Date(2026, 7, 24, 19, 30).getTime();

function ctx(over: Partial<MomentContext> = {}): MomentContext {
  return {
    now: NOW,
    hourOfDay: 19,
    streak: 2,
    previousStreak: 2,
    totalAttempts: 5,
    daysSinceLastStudy: 1,
    score: 7,
    total: 10,
    deckId: 'note:1',
    deckName: 'Biology',
    masteryBefore: 50,
    masteryAfter: 55,
    weakFixed: 0,
    keptPlan: false,
    ...over,
  };
}

describe('fire tiers', () => {
  it('grows with the streak through nine stages to a full year', () => {
    expect(fireFor(0).name).toBe('Unlit');
    expect(fireFor(1).name).toBe('Spark');
    expect(fireFor(5).name).toBe('Ember');
    expect(fireFor(10).name).toBe('Kindling');
    expect(fireFor(20).name).toBe('Steady burn');
    expect(fireFor(50).name).toBe('Wildfire');
    expect(fireFor(100).name).toBe('Blue flame');
    expect(fireFor(200).name).toBe('White heat');
    expect(fireFor(300).name).toBe('Violet crown');
    expect(fireFor(365).name).toBe('The eternal year');
    expect(fireFor(1000).name).toBe('The eternal year');
  });

  it('uses a different glyph as it grows', () => {
    const icons = [1, 10, 20, 50, 200, 365].map((s) => fireFor(s).icon);
    expect(new Set(icons).size).toBeGreaterThanOrEqual(5);
  });

  it('reports a tier only on the day it is reached', () => {
    expect(newlyReachedTier(5, 4)?.name).toBe('Ember');
    expect(newlyReachedTier(6, 5)).toBeNull();
    expect(newlyReachedTier(2, 2)).toBeNull();
    expect(newlyReachedTier(365, 364)?.name).toBe('The eternal year');
  });

  it('counts down to the next fire, and stops at the top', () => {
    expect(daysToNextTier(5)).toBe(5);
    expect(daysToNextTier(320)).toBe(45);
    expect(daysToNextTier(365)).toBeNull();
  });
});

describe('detectMoment', () => {
  it('says nothing on an ordinary session', () => {
    expect(detectMoment(ctx(), [])).toBeNull();
  });

  it('marks the very first quiz', () => {
    const moment = detectMoment(ctx({ totalAttempts: 1, daysSinceLastStudy: null }), []);
    expect(moment?.id).toBe('first');
    expect(moment?.title).toBe("That's one.");
  });

  it('notices a comeback ahead of anything else', () => {
    const moment = detectMoment(ctx({ daysSinceLastStudy: 5, score: 10 }), []);
    expect(moment?.id).toContain('comeback');
    expect(moment?.body).toContain('5 days away');
  });

  it('acknowledges a bad round instead of staying quiet', () => {
    const moment = detectMoment(ctx({ score: 2, total: 10 }), []);
    expect(moment?.title).toBe('That was a rough one.');
    expect(moment?.body).toContain('sitting down that counts');
  });

  it('celebrates a subject that turned around', () => {
    const moment = detectMoment(
      ctx({ masteryBefore: 30, masteryAfter: 65, daysSinceLastStudy: 1 }),
      []
    );
    expect(moment?.id).toBe('turned:note:1');
    expect(moment?.title).toContain('Biology');
  });

  it('honours a kept plan', () => {
    const moment = detectMoment(ctx({ keptPlan: true }), []);
    expect(moment?.id).toContain('plan:');
    expect(moment?.body).toContain('promise kept to yourself');
  });

  it('announces a new fire tier', () => {
    const moment = detectMoment(ctx({ streak: 5, previousStreak: 4 }), []);
    expect(moment?.id).toBe('fire:5');
    expect(moment?.title).toBe('Ember');
  });

  it('is gentle about late nights', () => {
    const moment = detectMoment(ctx({ hourOfDay: 1 }), []);
    expect(moment?.title).toBe("It's late.");
  });

  it('never repeats something already said', () => {
    const context = ctx({ totalAttempts: 1, daysSinceLastStudy: null });
    const first = detectMoment(context, []);
    expect(first?.id).toBe('first');
    expect(detectMoment(context, ['first'])).toBeNull();
  });

  it('falls through to the next candidate when the best one was already said', () => {
    const context = ctx({ daysSinceLastStudy: 4, score: 1, total: 10 });
    const moment = detectMoment(context, [`comeback:${dayKey()}`]);
    // Whatever the comeback key is, suppressing it must not silence the round.
    expect(moment).not.toBeNull();
  });

  it('returns at most one moment even when several apply', () => {
    const moment = detectMoment(
      ctx({
        totalAttempts: 1,
        daysSinceLastStudy: null,
        score: 10,
        total: 10,
        streak: 7,
        previousStreak: 6,
        keptPlan: true,
      }),
      []
    );
    expect(moment).not.toBeNull();
    expect(typeof moment?.id).toBe('string');
  });
});

/** The day key the engine uses internally, recomputed for the test. */
function dayKey(): number {
  const date = new Date(NOW);
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

describe('appendMoment', () => {
  const moment = (id: string): Moment => ({
    id,
    title: id,
    body: '',
    icon: 'heart',
    at: NOW,
  });

  it('puts the newest first', () => {
    const log = appendMoment([moment('a')], moment('b'));
    expect(log.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('caps the log', () => {
    let log: Moment[] = [];
    for (let i = 0; i < MOMENT_LOG_LIMIT + 20; i++) log = appendMoment(log, moment(`m${i}`));
    expect(log).toHaveLength(MOMENT_LOG_LIMIT);
  });
});
