/**
 * Achievements: a hidden set of things worth reaching, each holding a
 * hand-written note that is only revealed when it is earned.
 *
 * They differ from moments deliberately. A moment is the app speaking up
 * about *this* session; an achievement is a keepsake — found, kept, and
 * re-readable. Locked ones show nothing about how to get them: they are
 * not a checklist to farm, they are things that find you as you keep
 * going. No points attach to them. The note is the reward.
 */
import type { IconName } from '@/components/Icon';

export interface AchievementContext {
  now: number;
  hourOfDay: number;
  streak: number;
  totalAttempts: number;
  totalAnswers: number;
  /** Mastery percent per subject, only subjects with questions. */
  subjectPercents: number[];
  subjectCount: number;
  perfectRounds: number;
  distinctStudyDays: number;
  attemptsToday: number;
  daysSinceLastStudy: number | null;
  /** True when this weekend has both a Saturday and a Sunday session. */
  weekendPair: boolean;
  /** True when this session was one the student planned. */
  keptPlan: boolean;
  plansKeptTotal: number;
  /** True when a subject with 3+ weak questions ended the session with none. */
  clearedWeakSubject: boolean;
  score: number;
  total: number;
}

/**
 * Which shelf of the album a sticker sits on. Six per family, five
 * families, thirty in all — so every row of the album is a complete set
 * and the page looks finished even when it is empty.
 */
export type AchievementFamily = 'tally' | 'fire' | 'knowledge' | 'promises' | 'character';

export const FAMILY_ORDER: AchievementFamily[] = [
  'tally',
  'fire',
  'knowledge',
  'promises',
  'character',
];

export const FAMILY_LABEL: Record<AchievementFamily, string> = {
  tally: 'THE TALLY',
  fire: 'THE FIRE',
  knowledge: 'WHAT YOU KNOW',
  promises: 'PROMISES KEPT',
  character: 'WHO YOU ARE',
};

export interface AchievementDef {
  id: string;
  title: string;
  icon: IconName;
  family: AchievementFamily;
  earned: (ctx: AchievementContext) => boolean;
  /** One is chosen at random when unlocked, then kept forever. */
  notes: string[];
}

export interface Unlock {
  id: string;
  at: number;
  note: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-quiz',
    title: 'The first one',
    icon: 'sprout',
    family: 'tally',
    earned: (c) => c.totalAttempts >= 1,
    notes: [
      'Every streak, every mastered subject, every good grade that ever came from this app will trace back to today. You started.',
      "Starting is the rarest thing. Most people mean to. You did.",
    ],
  },
  {
    id: 'ten-quizzes',
    title: 'Ten deep',
    icon: 'cards',
    family: 'tally',
    earned: (c) => c.totalAttempts >= 10,
    notes: [
      "Ten quizzes. This stopped being an experiment a while ago — it's just what you do now.",
      'Ten times you sat down when you could have scrolled. It adds up quicker than you think.',
    ],
  },
  {
    id: 'fifty-quizzes',
    title: 'Fifty strong',
    icon: 'flag',
    family: 'tally',
    earned: (c) => c.totalAttempts >= 50,
    notes: [
      'Fifty. Nobody watched you do most of these. That is exactly what makes them count.',
      "Fifty quiet sessions. If discipline had a shape, it would look like this.",
    ],
  },
  {
    id: 'hundred-quizzes',
    title: 'A hundred',
    icon: 'trophy',
    family: 'tally',
    earned: (c) => c.totalAttempts >= 100,
    notes: [
      'One hundred quizzes. Think of who you were at number one — you know things now that person was still afraid of.',
    ],
  },
  {
    id: 'two-fifty-quizzes',
    title: 'Two hundred and fifty',
    icon: 'museum',
    family: 'tally',
    earned: (c) => c.totalAttempts >= 250,
    notes: [
      "Two hundred and fifty. At this point it isn't an app helping you study — it's a record of who you are.",
    ],
  },
  {
    id: 'first-subject',
    title: 'A shelf of your own',
    icon: 'book',
    family: 'knowledge',
    earned: (c) => c.subjectCount >= 1,
    notes: [
      'Your own notes, your own subject, your own pace. This one is nobody else’s syllabus.',
    ],
  },
  {
    id: 'three-subjects',
    title: 'The full shelf',
    icon: 'globe',
    family: 'knowledge',
    earned: (c) => c.subjectCount >= 3,
    notes: [
      'Three subjects, side by side. You are not cramming a topic — you are running your whole life from here.',
    ],
  },
  {
    id: 'getting-there',
    title: 'Getting there',
    icon: 'chart',
    family: 'knowledge',
    earned: (c) => c.subjectPercents.some((p) => p >= 60),
    notes: [
      'A subject crossed sixty. That number never lies and never rounds up — you genuinely know most of this now.',
      "Past sixty percent. Remember when this subject was the scary one?",
    ],
  },
  {
    id: 'solid',
    title: 'Solid ground',
    icon: 'atom',
    family: 'knowledge',
    earned: (c) => c.subjectPercents.some((p) => p >= 85),
    notes: [
      "Eighty-five percent mastery. You could be asked almost anything from these notes and you'd be fine. Sit with that for a second.",
    ],
  },
  {
    id: 'all-steady',
    title: 'All of it, steady',
    icon: 'star',
    family: 'knowledge',
    earned: (c) => c.subjectPercents.length >= 2 && c.subjectPercents.every((p) => p >= 60),
    notes: [
      'Every subject above sixty. No weak flank, nothing you’re quietly avoiding. This is what prepared feels like.',
    ],
  },
  {
    id: 'perfect',
    title: 'Every single one',
    icon: 'burst',
    family: 'promises',
    earned: (c) => c.score === c.total && c.total >= 5,
    notes: [
      'A perfect round. Not luck — you watched yourself know every answer, one after another.',
      "All of them right. Somewhere in the last few weeks, this became knowledge.",
    ],
  },
  {
    id: 'five-perfects',
    title: 'Five flawless',
    icon: 'flower',
    family: 'promises',
    earned: (c) => c.perfectRounds >= 5,
    notes: [
      'Five perfect rounds. Once is a good day. Five is who you are becoming.',
    ],
  },
  {
    id: 'comeback',
    title: 'The return',
    icon: 'heart',
    family: 'character',
    earned: (c) => c.daysSinceLastStudy != null && c.daysSinceLastStudy >= 3,
    notes: [
      'You were gone a while, and you came back anyway. Coming back is the whole game — everything else is detail.',
      "The gap doesn't matter. The door was still open and you walked through it.",
    ],
  },
  {
    id: 'night-owl',
    title: 'While the house sleeps',
    icon: 'ghost',
    family: 'character',
    earned: (c) => c.hourOfDay >= 23 || c.hourOfDay < 5,
    notes: [
      "Studying while everyone else is asleep. Nobody sees these hours — but they're the ones that show up in the result.",
    ],
  },
  {
    id: 'early-bird',
    title: 'Before the day starts',
    icon: 'apple',
    family: 'character',
    earned: (c) => c.hourOfDay >= 5 && c.hourOfDay < 7,
    notes: [
      'A quiz before seven in the morning. You gave the best part of the day to yourself before anyone could ask for it.',
    ],
  },
  {
    id: 'week-fire',
    title: 'Seven days burning',
    icon: 'flameSmall',
    family: 'fire',
    earned: (c) => c.streak >= 7,
    notes: [
      "Seven days in a row. This is the week the habit stopped needing you to push it.",
    ],
  },
  {
    id: 'month-fire',
    title: 'A month of fire',
    icon: 'flame',
    family: 'fire',
    earned: (c) => c.streak >= 30,
    notes: [
      'Thirty days without missing one. Most resolutions die in a fortnight. Yours is just getting warm.',
    ],
  },
  {
    id: 'hundred-fire',
    title: 'The everlasting',
    icon: 'flameCrown',
    family: 'fire',
    earned: (c) => c.streak >= 100,
    notes: [
      'One hundred consecutive days. There is no message equal to this. You already know what you did.',
    ],
  },
  {
    id: 'year-fire',
    title: 'The eternal year',
    icon: 'flameYear',
    family: 'fire',
    earned: (c) => c.streak >= 365,
    notes: [
      'Three hundred and sixty-five days. Not one missed. There is nothing left to say about consistency that you have not already said yourself.',
    ],
  },
  {
    id: 'all-solid',
    title: 'All of it, solid',
    icon: 'planet',
    family: 'knowledge',
    earned: (c) => c.subjectPercents.length >= 2 && c.subjectPercents.every((p) => p >= 85),
    notes: [
      'Every subject above eighty-five. There is no weak one to worry about on the way in. Whatever they ask, you have already answered it.',
    ],
  },
  {
    id: 'long-return',
    title: 'The long way back',
    icon: 'plane',
    family: 'character',
    earned: (c) => c.daysSinceLastStudy != null && c.daysSinceLastStudy >= 30,
    notes: [
      'A month away, and you still came back. Most people who stop, stop for good. You just proved you are not most people.',
    ],
  },
  {
    id: 'kept-plan',
    title: 'Word kept',
    icon: 'clock',
    family: 'promises',
    earned: (c) => c.keptPlan,
    notes: [
      'You set a time, and when it came, you were there. Keeping promises to yourself is the hardest kind of keeping.',
    ],
  },
  {
    id: 'ten-plans',
    title: 'Ten promises',
    icon: 'bell',
    family: 'promises',
    earned: (c) => c.plansKeptTotal >= 10,
    notes: [
      "Ten planned sessions, ten showed up for. People trust others who do that. You get to trust yourself.",
    ],
  },
  {
    id: 'hundred-answers',
    title: 'A hundred answers',
    icon: 'check',
    family: 'tally',
    earned: (c) => c.totalAnswers >= 100,
    notes: [
      'One hundred questions faced. Right or wrong, each one taught the next one something.',
    ],
  },
  {
    id: 'five-hundred-answers',
    title: 'Five hundred answers',
    icon: 'pencil',
    family: 'promises',
    earned: (c) => c.totalAnswers >= 500,
    notes: [
      'Five hundred answers. Grain by grain, this is how the mountain got moved.',
    ],
  },
  {
    id: 'weak-cleared',
    title: 'The stubborn ones',
    icon: 'question',
    family: 'promises',
    earned: (c) => c.clearedWeakSubject,
    notes: [
      "The questions that kept beating you — you went back for them, and now there are none left. That's not studying, that's character.",
    ],
  },
  {
    id: 'marathon',
    title: 'The long sitting',
    icon: 'bolt',
    family: 'fire',
    earned: (c) => c.attemptsToday >= 5,
    notes: [
      'Five quizzes in one day. Some days you find a rhythm and ride it. Today was one of those.',
    ],
  },
  {
    id: 'dedicated',
    title: 'A week of days',
    icon: 'calendar',
    family: 'fire',
    earned: (c) => c.distinctStudyDays >= 7,
    notes: [
      "Seven different days you chose this. Not in a row — that's not the point. The point is you keep choosing it.",
    ],
  },
  {
    id: 'weekender',
    title: 'The whole weekend',
    icon: 'gamepad',
    family: 'character',
    earned: (c) => c.weekendPair,
    notes: [
      'Saturday and Sunday, both. Weekends are the honest test — nobody makes you, and you did anyway.',
    ],
  },
  {
    id: 'rough-day',
    title: 'Stayed anyway',
    icon: 'cross',
    family: 'character',
    earned: (c) => c.total >= 5 && c.score / c.total < 0.4,
    notes: [
      "A hard round, finished anyway. Anyone can study on the good days. You just proved you're not only a good-day student.",
    ],
  },
];

/** What locked tiles say when tapped. Gentle, and gives nothing away. */
export const LOCKED_NOTE =
  "Not yet. No hints for this one — it isn't something to chase. Keep showing up and it will find you.";

/**
 * All achievements newly earned by this session, oldest-defined first.
 * `pick` injects randomness so tests can pin it.
 */
export function detectUnlocks(
  ctx: AchievementContext,
  unlocked: readonly Unlock[],
  pick: (notes: string[]) => string = randomNote
): Unlock[] {
  const have = new Set(unlocked.map((u) => u.id));
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.earned(ctx)).map((a) => ({
    id: a.id,
    at: ctx.now,
    note: pick(a.notes),
  }));
}

function randomNote(notes: string[]): string {
  return notes[Math.floor(Math.random() * notes.length)];
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
