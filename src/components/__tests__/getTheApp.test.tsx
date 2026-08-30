/**
 * The web build shares every screen with the phone, so a section that cannot
 * work in a browser has to say so itself. Left alone, Progress showed a
 * student who had studied all week the same "Nothing to show yet" card a
 * brand new one sees — which reads as lost work rather than as a limit of
 * the browser.
 */
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';

import { GetTheApp } from '@/components/GetTheApp';

function textOf(tree: ReturnType<typeof create>): string {
  return JSON.stringify(tree.toJSON() ?? '');
}

describe('the "get the app" notice', () => {
  const real = Platform.OS;
  afterEach(() => {
    (Platform as { OS: string }).OS = real;
  });

  it('says nothing on a phone', () => {
    (Platform as { OS: string }).OS = 'android';
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<GetTheApp what="Reminders" />);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('explains itself on the web, and names the section', () => {
    (Platform as { OS: string }).OS = 'web';
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<GetTheApp what="Reminders that actually arrive" />);
    });
    const said = textOf(tree);
    expect(said).toContain('This bit needs the app');
    expect(said).toContain('Reminders that actually arrive');
    expect(said).toContain('Download the app');
  });
});
