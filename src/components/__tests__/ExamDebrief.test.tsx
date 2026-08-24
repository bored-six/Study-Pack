import { type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { ExamDebrief } from '../ExamDebrief';
import type { Debrief } from '@/lib/debrief';

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

  const controls = (): ReactTestInstance[] =>
    tree.root.findAll((node) => typeof node.props?.onPress === 'function', { deep: true });

  const press = (label: string) => {
    const matches = controls().filter((node) =>
      node.findAllByType(Text).some((t) => JSON.stringify(t.props.children ?? '').includes(label))
    );
    const target = matches[matches.length - 1];
    if (!target) throw new Error(`No control showing "${label}"`);
    act(() => target.props.onPress());
  };

  return { texts, press };
}

const FULL: Debrief = {
  headline: 'You know more than that says.',
  wrong: [{ id: 'blank', weight: 3, text: '3 went down blank.' }],
  strengths: [{ id: 'fixed', weight: 2, text: '2 came back right today.' }],
  weaknesses: [{ id: 'repeat', weight: 2, text: '2 have caught you twice.' }],
  next: {
    title: 'Drill the ones that keep coming back',
    body: 'Weak spots pulls exactly those.',
    action: 'weak_spots',
    format: null,
    actionLabel: 'Drill weak spots',
  },
};

describe('ExamDebrief', () => {
  it('reads out one line each and what to do about it', () => {
    const { texts } = mount(<ExamDebrief debrief={FULL} onAction={() => {}} />);
    const shown = texts();

    expect(shown).toEqual([
      'LOST',
      '3 went down blank.',
      'WORKING',
      '2 came back right today.',
      'WEAK',
      '2 have caught you twice.',
      'DO THIS NEXT',
      'Drill the ones that keep coming back',
      'Weak spots pulls exactly those.',
      'Drill weak spots',
    ]);
  });

  it('hides a line it has nothing true to put in', () => {
    const quiet: Debrief = { ...FULL, wrong: [], weaknesses: [] };
    const { texts } = mount(<ExamDebrief debrief={quiet} onAction={() => {}} />);
    const shown = texts();

    expect(shown).not.toContain('LOST');
    expect(shown).not.toContain('WEAK');
    expect(shown).toContain('WORKING');
  });

  it('drops the note entirely when the paper said nothing at all', () => {
    const silent: Debrief = { ...FULL, wrong: [], strengths: [], weaknesses: [] };
    const { texts } = mount(<ExamDebrief debrief={silent} onAction={() => {}} />);

    expect(texts()).toEqual([
      'DO THIS NEXT',
      'Drill the ones that keep coming back',
      'Weak spots pulls exactly those.',
      'Drill weak spots',
    ]);
  });

  it('offers no button when the advice is not something to launch', () => {
    const advice: Debrief = {
      ...FULL,
      next: {
        title: 'Leave it a day',
        body: 'Coming back after a gap is what makes it stick.',
        action: 'none',
        format: null,
        actionLabel: null,
      },
    };
    const { texts } = mount(<ExamDebrief debrief={advice} onAction={() => {}} />);

    expect(texts()).toContain('Leave it a day');
    expect(texts()).not.toContain('Drill weak spots');
  });

  it('hands the step back when the button is pressed', () => {
    const onAction = jest.fn();
    const { press } = mount(<ExamDebrief debrief={FULL} onAction={onAction} />);

    press('Drill weak spots');
    expect(onAction).toHaveBeenCalledWith(FULL.next);
  });
});
