/**
 * A layout animation and a transform cannot share one view.
 *
 * Reanimated drives `entering`, `exiting` and `transform` through the same
 * property, so a view that has both loses the transform the moment the
 * layout animation runs — and says so, once per render. A star per
 * first-try-correct answer meant the warning arrived seven times a page and
 * buried everything else in the Expo log.
 *
 * The fix is always the same shape: the layout animation goes on a wrapper,
 * the transform stays on the view inside it. That is easy to write and easy
 * to forget, and nothing about the app looks broken when you do forget —
 * the animation simply wins and the tilt disappears. So it is checked here,
 * by reading the source, the way the theme guard reads it for hard-coded
 * colours.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(path);
    }
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Names of styles built by useAnimatedStyle that move the view about. */
function transformingStyles(source: string): string[] {
  const names: string[] = [];
  const declaration = /const (\w+) = useAnimatedStyle\(/g;
  for (let match = declaration.exec(source); match; match = declaration.exec(source)) {
    // Read to the end of the call, counting brackets, and see what it sets.
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (/transform:/.test(source.slice(match.index, i))) names.push(match[1]);
  }
  return names;
}

/** Every `<Animated.View …>` opening tag, brace-aware so props survive. */
function openingTags(source: string): string[] {
  const tags: string[] = [];
  const opener = /<Animated\.View\b/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 0;
    let i = match.index;
    for (; i < source.length; i++) {
      const char = source[i];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0) break;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

/** StyleSheet entries that move the view about: `stamp: { transform: [...] }`. */
function transformingSheetKeys(source: string): string[] {
  const names: string[] = [];
  const entry = /^\s{2,}(\w+): \{$/gm;
  for (let match = entry.exec(source); match; match = entry.exec(source)) {
    const start = match.index + match[0].length;
    const end = source.indexOf('\n  },', start);
    if (end === -1) continue;
    if (/transform:/.test(source.slice(start, end))) names.push(match[1]);
  }
  return names;
}

const LAYOUT_PROP = /\b(?:entering|exiting|layout)=/;

describe('layout animations and transforms', () => {
  const files = sourceFiles(SRC);

  it('finds the components to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never puts a layout animation on a view that also has a transform', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const moving = transformingStyles(source);
      const sheetKeys = transformingSheetKeys(source);

      for (const tag of openingTags(source)) {
        if (!LAYOUT_PROP.test(tag)) continue;

        const inlineTransform = /transform:\s*\[/.test(tag);
        // `(?!=)` so the `style=` prop itself is never mistaken for a
        // variable that happens to be called `style`.
        const animatedTransform = moving.some((name) =>
          new RegExp(`\\b${name}\\b(?!=)`).test(tag)
        );
        const sheetTransform = sheetKeys.some((name) =>
          new RegExp(`styles\\.${name}\\b`).test(tag)
        );
        if (!inlineTransform && !animatedTransform && !sheetTransform) continue;

        offenders.push(
          `${file.replace(/.*src[\\/]/, 'src/')}: ${tag.replace(/\s+/g, ' ').slice(0, 120)}`
        );
      }
    }

    expect(offenders).toEqual([]);
  });
});
