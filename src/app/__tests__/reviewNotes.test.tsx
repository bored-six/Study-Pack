import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import type { ParsedQuestion } from '@/lib/noteParser';
import ReviewNotesScreen from '../notes/review';

const mockState: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissAll: jest.fn() },
  Redirect: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/sfx', () => ({ playSfx: jest.fn() }));
jest.mock('@/store/notes', () => {
  const use = () => mockState;
  use.getState = () => mockState;
  return { useNotesStore: use };
});

function setStore(over: Record<string, unknown> = {}) {
  Object.keys(mockState).forEach((k) => delete mockState[k]);
  Object.assign(
    mockState,
    {
      draft: [],
      stats: { kept: 0, skipped: [] },
      subjects: [{ id: 's1', name: 'Biology', color: null }],
      targetId: 's1',
      setTarget: jest.fn(),
      addSubject: jest.fn(),
      reviseDraftQuestion: jest.fn(),
      removeDraftQuestion: jest.fn(),
      saveDraft: jest.fn(),
      clearDraft: jest.fn(),
    },
    over
  );
}

function textOf(children: unknown): string {
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return '';
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll((n) => n.type === Text, { deep: true })
    .map((n) => textOf(n.props.children))
    .join(' | ');
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ReviewNotesScreen />);
  });
  return tree;
}

/** Presses the last thing carrying this accessibility label. */
function press(tree: ReactTestRenderer, label: string) {
  const hits = tree.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label
  );
  const target = hits[hits.length - 1];
  if (!target) throw new Error(`nothing labelled "${label}"`);
  act(() => {
    target.props.onPress();
  });
}

/* --- fixtures. Flag state is deliberate in each, not incidental. --------- */

/** Nothing wrong with it: distinct options, a full line, a short answer. */
const solid: ParsedQuestion = {
  prompt: 'What is osmosis in living cells?',
  correctAnswer: 'the movement of water',
  answers: ['the movement of water', 'a kind of sugar', 'a gas exchange', 'a cell wall'],
  kind: 'definition',
  sourceLine: 'Osmosis is the movement of water across a semi-permeable membrane.',
};

/** Built from four words, so he admits the line was thin. */
const thin: ParsedQuestion = {
  prompt: 'What is turgor pressure in plants?',
  correctAnswer: 'water pushing out',
  answers: ['water pushing out', 'a salt', 'a membrane', 'a gas'],
  kind: 'definition',
  sourceLine: 'Turgor pressure pushes outward.',
};

/** A list, complete and properly sourced — he has no complaint. */
const list: ParsedQuestion = {
  prompt: 'Name the stages of mitosis in order.',
  correctAnswer: 'prophase',
  answers: ['prophase', 'metaphase', 'anaphase', 'telophase'],
  kind: 'enumeration',
  sourceLine: 'The four stages of mitosis are prophase, metaphase, anaphase and telophase.',
  ordered: true,
};

describe('what Nib leads with', () => {
  it('splits the batch and says so, instead of showing a wall', () => {
    setStore({ draft: [solid, list, thin], stats: { kept: 3, skipped: [] } });
    const said = allText(render());
    expect(said).toContain("2 of these I'd bet on");
    expect(said).toContain("One I'd look at");
    expect(said).toContain("HE'S SURE");
    expect(said).toContain('WORTH A LOOK');
  });

  it('tells you to just save when nothing is doubtful', () => {
    setStore({ draft: [solid, list], stats: { kept: 2, skipped: [] } });
    const said = allText(render());
    expect(said).toContain("I'd bet on all of these");
    // The counters stay, reading 2 and 0. A visible zero is the reassurance;
    // a missing panel would just look like the check never ran.
    expect(said).toContain("2 | HE'S SURE | 0 | WORTH A LOOK");
    // And nothing is laid out as a card to be worked through.
    expect(said).not.toContain('Worth a look');
  });

  it('counts the whole batch on the button, not just the flagged ones', () => {
    // A flag is a suspicion, never a removal — everything saves unless binned.
    setStore({ draft: [solid, list, thin], stats: { kept: 3, skipped: [] } });
    expect(allText(render())).toContain('Save 3 to Biology');
  });
});

describe('the ones worth a look', () => {
  it('are the only questions laid out, and they say why', () => {
    setStore({ draft: [solid, list, thin], stats: { kept: 3, skipped: [] } });
    const said = allText(render());
    // The flagged one is a full card, with his reason on it.
    expect(said).toContain('What is turgor pressure in plants?');
    expect(said).toContain('I built this off one short line');
    // The other two are folded into the stack, not rendered as cards.
    expect(said).not.toContain('What is osmosis in living cells?');
    expect(said).not.toContain('Name the stages of mitosis in order.');
  });

  it('names the option he is actually worried about', () => {
    // Two questions asking the same thing, one's answer offered as the
    // other's wrong option. Whichever the student picks they are marked
    // wrong, so the question cannot be answered at all.
    const asked: ParsedQuestion = {
      prompt: 'What moves water across a membrane in living cells?',
      correctAnswer: 'osmosis',
      answers: ['osmosis', 'diffusion', 'mitosis', 'lysis'],
      kind: 'definition',
      sourceLine: 'Osmosis moves water across a semi-permeable membrane in living cells.',
    };
    const alsoAsked: ParsedQuestion = {
      prompt: 'What moves water across a membrane in living cells called?',
      correctAnswer: 'diffusion',
      answers: ['diffusion', 'turgor', 'lysis', 'mitosis'],
      kind: 'definition',
      sourceLine: 'Diffusion moves particles down a concentration gradient without energy.',
    };
    setStore({ draft: [asked, alsoAsked], stats: { kept: 2, skipped: [] } });
    expect(allText(render())).toContain('One of my wrong answers is also true here');
  });

  it('moves one into the sure pile once you keep it', () => {
    setStore({ draft: [solid, thin], stats: { kept: 2, skipped: [] } });
    const tree = render();
    expect(allText(tree)).toContain('I built this off one short line');

    press(tree, 'Keep this question as it is');

    const said = allText(tree);
    expect(said).not.toContain('I built this off one short line');
    expect(said).toContain("I'd bet on all of these");
  });
});

describe('the ones he is sure about', () => {
  it('are one object, not a list, until you ask', () => {
    setStore({ draft: [solid, list, thin], stats: { kept: 3, skipped: [] } });
    const tree = render();
    expect(allText(tree)).toContain("he'd stake his allowance on");

    press(tree, 'Open the 2 he is sure about');

    const said = allText(tree);
    expect(said).toContain('What is osmosis in living cells?');
    expect(said).toContain('Name the stages of mitosis in order.');
  });
});

describe('what each question is called', () => {
  it('names a definition, a fill-the-blank and a list separately', () => {
    // The screen used to ask one question — "is it a definition?" — and call
    // everything else a fill-the-blank, so every list came out mislabelled.
    const cloze: ParsedQuestion = {
      prompt: 'Water moves by ______ across a membrane in cells.',
      correctAnswer: 'osmosis',
      answers: ['osmosis', 'turgor', 'mitosis', 'lysis'],
      kind: 'cloze',
      sourceLine: 'Cells move water by osmosis.',
    };
    setStore({ draft: [thin, cloze, { ...list, sourceLine: 'Mitosis has stages.' }], stats: { kept: 3, skipped: [] } });
    const said = allText(render());
    expect(said).toContain('DEFINITION');
    expect(said).toContain('FILL THE BLANK');
    expect(said).toContain('LIST');
  });

  it('credits a question the student wrote themselves', () => {
    // No source line means they wrote it, and he never flags those.
    setStore({
      draft: [{ ...solid, sourceLine: null }, thin],
      stats: { kept: 2, skipped: [] },
    });
    const tree = render();
    press(tree, 'Open the 1 he is sure about');
    expect(allText(tree)).toContain('What is osmosis in living cells?');
  });
});

describe('a list is not multiple choice', () => {
  it('shows every item numbered, because every item is the answer', () => {
    setStore({
      draft: [{ ...list, sourceLine: 'Mitosis has stages.' }],
      stats: { kept: 1, skipped: [] },
    });
    const said = allText(render());
    for (const stage of list.answers) expect(said).toContain(stage);
    expect(said).toContain('All of these, in this order.');
  });

  it('still letters a multiple-choice question', () => {
    setStore({ draft: [thin], stats: { kept: 1, skipped: [] } });
    const said = allText(render());
    expect(said).toContain('A');
    expect(said).toContain('D');
  });
});
