import { useState, type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

import { ExamItemView } from '../ExamItemView';
import { emptyDraft, type DraftValue } from '@/lib/draft';
import type {
  ChoiceItem,
  EnumerationItem,
  ExamItem,
  MatchingItem,
  ModifiedTrueFalseItem,
  TrueFalseItem,
  TypedItem,
} from '@/lib/exam';

/** Renders anything and returns helpers for driving it like a student would. */
function mount(element: ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });

  const texts = () =>
    tree.root
      .findAllByType(Text)
      .map((node) => {
        const children = Array.isArray(node.props.children)
          ? node.props.children
          : [node.props.children];
        return children.filter((c: unknown) => typeof c === 'string').join('');
      })
      .filter(Boolean);

  /**
   * React Native wraps Pressable in memo/forwardRef, so findAllByType misses
   * it. Anything with an onPress handler is a control as far as we care.
   */
  const controls = (): ReactTestInstance[] =>
    tree.root.findAll(
      (node) => typeof node.props?.onPress === 'function' && node.props.disabled !== true,
      { deep: true }
    );

  /** Presses the innermost enabled control whose rendered text contains `label`. */
  const press = (label: string) => {
    const matches = controls().filter((node) =>
      node.findAllByType(Text).some((t) => JSON.stringify(t.props.children ?? '').includes(label))
    );
    // Deepest match wins, so an outer wrapper never swallows the tap.
    const target = matches[matches.length - 1];
    if (!target) throw new Error(`No enabled control showing "${label}"`);
    act(() => target.props.onPress());
  };

  const type = (value: string, which = 0) => {
    const input = tree.root.findAllByType(TextInput).filter((i) => i.props.editable !== false)[
      which
    ];
    if (!input) throw new Error('No editable input on screen');
    act(() => input.props.onChangeText(value));
  };

  const inputCount = () =>
    tree.root.findAllByType(TextInput).filter((i) => i.props.editable !== false).length;

  return { texts, press, type, inputCount, tree };
}

/** Instant feedback: the component keeps the answer itself. */
function drive(item: ExamItem) {
  const onDone = jest.fn();
  return { onDone, ...mount(<ExamItemView item={item} onDone={onDone} />) };
}

/**
 * Exam simulation: the answer lives outside the component and nothing is
 * marked. `answer()` reads back whatever the paper is currently holding.
 */
function driveDeferred(item: ExamItem) {
  const onDone = jest.fn();
  let latest: DraftValue = emptyDraft(item);

  function Paper() {
    const [value, setValue] = useState<DraftValue>(() => emptyDraft(item));
    latest = value;
    return (
      <ExamItemView
        item={item}
        value={value}
        onChange={setValue}
        reveal={false}
        onDone={onDone}
      />
    );
  }

  return { onDone, answer: () => latest, ...mount(<Paper />) };
}

const CHOICE: ChoiceItem = {
  id: 'q1:mc',
  format: 'multiple_choice',
  questionId: 'q1',
  prompt: 'Which term means: the green pigment?',
  options: ['Chlorophyll', 'Osmosis', 'Mitosis', 'Glycolysis'],
  correctAnswer: 'Chlorophyll',
};

describe('multiple choice', () => {
  it('reports a correct pick after Check, then Next', () => {
    const { press, onDone } = drive(CHOICE);
    press('Chlorophyll');
    // Ticking is not answering: nothing is marked until Check.
    expect(onDone).not.toHaveBeenCalled();
    press('Check');
    expect(onDone).not.toHaveBeenCalled();
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('lets a pick be changed before it is checked', () => {
    // The whole point of a confirm step: a brushed line is not an answer.
    const { press, texts } = drive(CHOICE);
    press('Osmosis');
    press('Chlorophyll');
    press('Check');
    expect(texts().join(' ')).toContain('Correct');
  });

  it('reports a wrong pick', () => {
    const { press, onDone } = drive(CHOICE);
    press('Osmosis');
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it('locks the options once answered', () => {
    const { press, texts } = drive(CHOICE);
    press('Chlorophyll');
    press('Check');
    expect(texts()).toContain('Correct');
    // A second pick must not change anything.
    expect(() => press('Osmosis')).toThrow();
  });
});

describe('true or false', () => {
  const TRUE_ITEM: TrueFalseItem = {
    id: 'q2:tf',
    format: 'true_false',
    questionId: 'q2',
    statement: 'Mitochondria produce 36 ATP per glucose molecule.',
    isTrue: true,
  };

  it('accepts True on a true statement', () => {
    const { press, onDone } = drive(TRUE_ITEM);
    press('True');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('rejects False on a true statement and says which it was', () => {
    const { press, onDone, texts } = drive(TRUE_ITEM);
    press('False');
    expect(texts().join(' ')).toContain('was true');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });
});

describe('modified true or false', () => {
  const FALSE_ITEM: ModifiedTrueFalseItem = {
    id: 'q3:mtf',
    format: 'modified_true_false',
    questionId: 'q3',
    words: ['Mitochondria', 'produce', '27', 'ATP', 'per', 'glucose', 'molecule.'],
    isTrue: false,
    falseWordIndex: 2,
    correctWord: '36',
  };

  it('needs the call, the word, and the correction to all be right', () => {
    const { press, type, onDone } = drive(FALSE_ITEM);
    press('False');
    press('27');
    type('36');
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('fails when the wrong word is blamed', () => {
    const { press, type, onDone, texts } = drive(FALSE_ITEM);
    press('False');
    press('glucose');
    type('36');
    press('Check');
    expect(texts().join(' ')).toContain('wrong word was');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it('fails on a misspelled correction and shows the slip', () => {
    const { press, type, onDone, texts } = drive({
      ...FALSE_ITEM,
      words: ['Water', 'moves', 'by', 'osmossis', 'across', 'membranes'],
      falseWordIndex: 3,
      correctWord: 'osmosis',
    });
    press('False');
    press('osmossis');
    type('osmossis');
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it('ends immediately when a false statement is called true', () => {
    const { press, onDone, texts } = drive(FALSE_ITEM);
    press('True');
    expect(texts().join(' ')).toContain('was false');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it('needs only the call when the statement is genuinely true', () => {
    const { press, onDone } = drive({
      ...FALSE_ITEM,
      words: ['Mitochondria', 'produce', '36', 'ATP', 'per', 'glucose', 'molecule.'],
      isTrue: true,
      falseWordIndex: -1,
    });
    press('True');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });
});

describe('typed answers', () => {
  const TYPED: TypedItem = {
    id: 'q4:id',
    format: 'identification',
    questionId: 'q4',
    prompt: 'Which term means: the green pigment that absorbs light?',
    correctAnswer: 'Chlorophyll',
  };

  it('ignores capitalisation', () => {
    const { type, press, onDone } = drive(TYPED);
    type('chlorophyll');
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('marks a misspelling wrong but shows what was typed', () => {
    const { type, press, onDone, texts } = drive(TYPED);
    type('chlorophyl');
    press('Check');
    const said = texts().join(' ');
    expect(said).toContain('chlorophyl');
    expect(said).toContain('Chlorophyll');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });
});

describe('enumeration', () => {
  const LIST: EnumerationItem = {
    id: 'q5:enum',
    format: 'enumeration',
    questionId: 'q5',
    prompt: 'List the 3: types of rock',
    items: ['Igneous', 'Sedimentary', 'Metamorphic'],
    ordered: false,
  };

  it('gives one input per item', () => {
    expect(drive(LIST).inputCount()).toBe(3);
  });

  it('accepts every item in any order', () => {
    const { type, press, onDone } = drive(LIST);
    type('metamorphic', 0);
    type('igneous', 1);
    type('sedimentary', 2);
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('reports how many were found when the list is incomplete', () => {
    const { type, press, onDone, texts } = drive(LIST);
    type('igneous', 0);
    type('sedimentary', 1);
    press('Check');
    expect(texts().join(' ')).toContain('2 of 3');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(false);
  });
});

describe('matching', () => {
  const MATCH: MatchingItem = {
    id: 'match:1',
    format: 'matching',
    questionId: 'q6',
    terms: ['Osmosis', 'Mitosis', 'Glycolysis'],
    meanings: ['breakdown of glucose', 'movement of water', 'cell division'],
    correctIndexFor: [1, 2, 0],
  };

  it('scores a fully correct pairing', () => {
    const { press, onDone } = drive(MATCH);
    press('Osmosis');
    press('movement of water');
    press('Mitosis');
    press('cell division');
    press('Glycolysis');
    press('breakdown of glucose');
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('lets a mistaken pair be undone by tapping the term again', () => {
    const { press, onDone } = drive(MATCH);
    press('Osmosis');
    press('cell division'); // wrong on purpose
    press('Osmosis'); // tap again to release it
    press('movement of water'); // now the right one
    press('Mitosis');
    press('cell division');
    press('Glycolysis');
    press('breakdown of glucose');
    press('Check');
    press('Next');
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it('will not check until every term is paired', () => {
    const { press } = drive(MATCH);
    press('Osmosis');
    press('movement of water');
    expect(() => press('Check')).toThrow();
  });

  /**
   * The pen lines are an absolutely-positioned layer over both columns, so
   * whether the chips can be tapped at all depends on that layer letting
   * touches through. It only appears once the columns have been measured,
   * which never happens in the test renderer — so every test above passes
   * with the layer absent, and on web it was covering the chips and
   * swallowing every tap. Measure the columns first, then look at it.
   */
  describe('once the pen lines are on screen', () => {
    /** Feeds the component the layout it would get on a real screen. */
    const withLayout = (item: MatchingItem) => {
      const driven = drive(item);
      const layout = { x: 0, y: 0, width: 130, height: 220 };
      act(() => {
        driven.tree.root
          .findAll((node) => typeof node.props?.onLayout === 'function', { deep: true })
          .forEach((node) => node.props.onLayout({ nativeEvent: { layout } }));
      });
      return driven;
    };

    it('lets touches through to the chips underneath', () => {
      const { press, tree } = withLayout(MATCH);
      press('Osmosis');
      press('movement of water');

      const svg = tree.root.findAll(
        (node) => typeof node.type !== 'string' && node.props?.style && node.props?.width == null,
        { deep: true }
      );
      expect(svg.length).toBeGreaterThan(0);

      // Every absolutely-positioned layer sitting over the columns has to be
      // transparent to touch.
      const overlays = tree.root.findAll(
        (node) => node.props?.pointerEvents === 'none',
        { deep: true }
      );
      expect(overlays.length).toBeGreaterThan(0);
    });

    it('can still be answered end to end', () => {
      const { press, onDone } = withLayout(MATCH);
      press('Osmosis');
      press('movement of water');
      press('Mitosis');
      press('cell division');
      press('Glycolysis');
      press('breakdown of glucose');
      press('Check');
      press('Next');
      expect(onDone).toHaveBeenCalledWith(true);
    });

    it('says how many pairs landed rather than the same line every time', () => {
      // Two right, one wrong. The old copy said "Some pairs were wrong"
      // whatever happened, including on a clean sheet.
      const { press, texts } = withLayout(MATCH);
      press('Osmosis');
      press('cell division'); // wrong
      press('Mitosis');
      press('movement of water'); // wrong
      press('Glycolysis');
      press('breakdown of glucose'); // right
      press('Check');
      expect(texts().join(' ')).toContain('You joined 1 of 3');
    });
  });
});

describe('withheld answers (exam simulation)', () => {
  const TYPED_ITEM: TypedItem = {
    id: 'q4:id',
    format: 'identification',
    questionId: 'q4',
    prompt: 'Which term means: the green pigment that absorbs light?',
    correctAnswer: 'Chlorophyll',
  };

  const LIST_ITEM: EnumerationItem = {
    id: 'q5:enum',
    format: 'enumeration',
    questionId: 'q5',
    prompt: 'List the 3: types of rock',
    items: ['Igneous', 'Sedimentary', 'Metamorphic'],
    ordered: false,
  };

  const MATCH_ITEM: MatchingItem = {
    id: 'match:1',
    format: 'matching',
    questionId: 'q6',
    terms: ['Osmosis', 'Mitosis', 'Glycolysis'],
    meanings: ['breakdown of glucose', 'movement of water', 'cell division'],
    correctIndexFor: [1, 2, 0],
  };

  it('takes a pick without saying a word about it', () => {
    const { press, texts, onDone, answer } = driveDeferred(CHOICE);
    press('Chlorophyll');
    const said = texts().join(' ');
    expect(said).not.toContain('Correct');
    expect(said).not.toContain('Not quite');
    expect(onDone).not.toHaveBeenCalled();
    expect(answer()).toEqual({ kind: 'choice', picked: 'Chlorophyll', checked: false });
  });

  it('lets a pick be changed, because the paper is not submitted yet', () => {
    const { press, answer } = driveDeferred(CHOICE);
    press('Chlorophyll');
    press('Osmosis');
    expect(answer()).toEqual({ kind: 'choice', picked: 'Osmosis', checked: false });
  });

  it('offers no Check button to press', () => {
    expect(() => driveDeferred(TYPED_ITEM).press('Check')).toThrow();
    expect(() => driveDeferred(LIST_ITEM).press('Check')).toThrow();
  });

  it('keeps typing without marking it', () => {
    const { type, texts, answer } = driveDeferred(TYPED_ITEM);
    type('chlorophyl');
    expect(texts().join(' ')).not.toContain('Chlorophyll');
    expect(answer()).toEqual({ kind: 'typed', text: 'chlorophyl', checked: false });
  });

  it('does not leak the answer by ending a wrongly-called statement early', () => {
    // Instant mode says "that statement was true" here. A withheld paper
    // must send them to the correction step exactly as if they were right.
    const TRUE_MTF: ModifiedTrueFalseItem = {
      id: 'q7:mtf',
      format: 'modified_true_false',
      questionId: 'q7',
      words: ['Mitochondria', 'produce', '36', 'ATP'],
      isTrue: true,
      falseWordIndex: -1,
      correctWord: '36',
    };
    const { press, texts } = driveDeferred(TRUE_MTF);
    press('False');
    const said = texts().join(' ');
    expect(said).toContain('Which word is wrong');
    expect(said).not.toContain('was true');
  });

  it('records a matching grid as it is built', () => {
    const { press, answer } = driveDeferred(MATCH_ITEM);
    press('Osmosis');
    press('movement of water');
    expect(answer()).toMatchObject({ kind: 'matching', pairs: { 0: 1 } });
  });
});
