/**
 * Dark mode, guarded at the source rather than screen by screen.
 *
 * Dark mode kept being "fixed" and kept being broken, because the breakage
 * was never on the screen being looked at. `tokens.ts` exports a static
 * light palette as a fallback, and seven shared files — the icons, the
 * hand-drawn glyphs, the pen marks, the ruled paper, the exam-stage
 * furniture — imported it and baked light values into module-level
 * stylesheets. Those files appear on every screen, so every screen was
 * wrong, and no amount of fixing individual screens could reach them.
 *
 * The same went for `outline`, spread by seventy-odd styles across
 * twenty-five files: it closed over the light theme's edge, so at night
 * every card drew a dark border on a dark ground and had none.
 *
 * These tests read the source. That is unusual, and deliberate: the bug is
 * "a file imported the wrong thing", which no amount of rendering will
 * catch, because a component looks fine until you switch themes.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { darkColors, lightColors, outline, outlineOn } from '../tokens';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

const FILES = sourceFiles(SRC).filter((f) => !f.endsWith(join('theme', 'tokens.ts')));

/** How a file names what it pulled out of the theme. */
function themeImports(source: string): string[] {
  const match = /import\s+\{([^}]*)\}\s+from\s+'@\/theme\/tokens';/.exec(source);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((name) => name.trim().replace(/^type\s+/, ''))
    .filter(Boolean);
}

describe('nothing outside the theme uses the light palette', () => {
  it.each(FILES.map((f) => [f.replace(SRC, 'src'), f]))('%s', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    // `colors` is the light theme frozen at import time. A screen that wants
    // colours asks getColors(isDark) for them.
    expect(themeImports(source)).not.toContain('colors');
  });

  it.each(FILES.map((f) => [f.replace(SRC, 'src'), f]))('%s spreads no fixed outline', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    // ...outline is the light edge; ...outlineOn(colors) is this theme's.
    expect(source).not.toMatch(/\.\.\.outline\s*,/);
  });
});

describe('the two palettes stay in step', () => {
  it('defines exactly the same tokens in both themes', () => {
    // A token that exists in one and not the other is a crash or a hole in
    // whichever theme is missing it.
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('gives every token a real colour in both', () => {
    for (const key of Object.keys(lightColors) as (keyof typeof lightColors)[]) {
      expect(typeof lightColors[key]).toBe('string');
      expect(typeof darkColors[key]).toBe('string');
      expect(lightColors[key].length).toBeGreaterThan(0);
      expect(darkColors[key].length).toBeGreaterThan(0);
    }
  });

  it('never paints the two themes the same', () => {
    // The grounds and the ink must actually differ, or "dark mode" is a
    // setting that does nothing.
    expect(darkColors.bg).not.toBe(lightColors.bg);
    expect(darkColors.text).not.toBe(lightColors.text);
    expect(darkColors.surface).not.toBe(lightColors.surface);
    expect(darkColors.edge).not.toBe(lightColors.edge);
  });
});

describe('the outline follows the palette it is given', () => {
  it('draws the dark edge at night and the light one by day', () => {
    expect(outlineOn(darkColors).borderColor).toBe(darkColors.edge);
    expect(outlineOn(lightColors).borderColor).toBe(lightColors.edge);
    expect(outlineOn(darkColors).borderColor).not.toBe(outlineOn(lightColors).borderColor);
  });

  it('keeps the light constant only as the fallback it is documented to be', () => {
    expect(outline.borderColor).toBe(lightColors.edge);
  });
});
