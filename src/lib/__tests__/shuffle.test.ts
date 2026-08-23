import { shuffle } from '../shuffle';

describe('shuffle', () => {
  it('keeps exactly the same elements', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffle(input);
    expect(result).toHaveLength(4);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });

  it('actually reorders (statistically)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const changed = Array.from({ length: 50 }, () => shuffle(input)).some(
      (result) => result.join(',') !== input.join(',')
    );
    expect(changed).toBe(true);
  });
});
