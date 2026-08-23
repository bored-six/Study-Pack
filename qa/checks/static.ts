/**
 * Whole-project checks that no amount of feeding data through a function
 * will find: type errors the app ships with, unit tests that no longer
 * pass, work that exists but was never wired to a screen, and fields
 * dropped on their way into the database.
 *
 * The last one is the quiet killer. Losing a column on write turns every
 * saved question into the same *kind* of question, which is exactly how a
 * generator that reads its input carefully ends up producing identical
 * behaviour for everything.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Report } from '../report';

const ROOT = resolve(__dirname, '..', '..');
const SKIP_SUBPROCESS = process.env.QA_SKIP_SUBPROCESS === '1';

function run(command: string, args: string[]): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
      env: { ...process.env, CI: '1' },
    });
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` || (err.message ?? '') };
  }
}

/** Every .ts/.tsx under a directory. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

export function checkStatic(): Report {
  const report = new Report(
    'Project health',
    'Type errors, the existing unit tests, code that was written but never wired to a screen, and fields lost on the way into SQLite.',
    'STATIC'
  );

  // --- typecheck ----------------------------------------------------------

  if (SKIP_SUBPROCESS) {
    report.metric('Typecheck', 'skipped', 'QA_SKIP_SUBPROCESS=1');
  } else {
    const tsc = run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);
    const errors = tsc.output
      .split('\n')
      .filter((line) => /error TS\d+/.test(line))
      .filter((line) => !line.includes('/qa/'));

    // A failed run with nothing that looks like a compiler error means the
    // compiler never started — say that rather than reporting a clean tree.
    if (!tsc.ok && errors.length === 0) {
      report.metric('Typecheck', 'could not run');
      report.add(
        'info',
        'The typecheck could not be run',
        'npx tsc did not produce compiler output, so this run says nothing about whether the app typechecks.',
        [tsc.output.split('\n').slice(0, 5).join('\n')],
        'npx tsc --noEmit'
      );
    } else {
      report.metric('Typecheck', errors.length === 0 ? 'clean' : `${errors.length} errors`);
    }
    report.flagIf(
      errors.length > 0,
      'high',
      'The app does not typecheck',
      'Each of these is a value the compiler knows is not there. TS2339 on a store field means the screen reads `undefined` at runtime and renders a blank where a number belongs.',
      errors,
      'npx tsc --noEmit'
    );
  }

  // --- the project's own tests -------------------------------------------

  if (SKIP_SUBPROCESS) {
    report.metric('Unit tests', 'skipped', 'QA_SKIP_SUBPROCESS=1');
  } else {
    const jest = run('npx', ['jest', '--silent', '--ci']);
    const summary = jest.output
      .split('\n')
      .filter((line) => /^(Tests|Test Suites):/.test(line.trim()))
      .map((line) => line.trim());
    const ranAtAll = summary.length > 0;
    report.metric('Unit tests', summary.join(' · ') || (jest.ok ? 'passed' : 'could not run'));
    report.flagIf(
      !jest.ok && !ranAtAll,
      'info',
      'The unit test suite could not be run',
      'npx jest produced no test summary, so this run says nothing about whether the existing tests pass.',
      [jest.output.split('\n').slice(0, 5).join('\n')],
      'npm test'
    );
    report.flagIf(
      !jest.ok && ranAtAll,
      'high',
      'The existing unit tests do not pass',
      'The suite in src/lib/__tests__ is the safety net for the parser and the scheduler.',
      jest.output
        .split('\n')
        .filter((line) => /✕|●|failed/i.test(line))
        .slice(0, 20),
      'npm test'
    );
  }

  // --- work that never reached a screen -----------------------------------

  const files = sourceFiles(join(ROOT, 'src'));
  const libModules = files
    .filter((f) => f.includes(`${join('src', 'lib')}`) && !f.includes('__tests__'))
    .map((f) => f.replace(/.*src[\\/]lib[\\/]/, '').replace(/\.tsx?$/, ''));

  const consumers = files.filter(
    (f) => !f.includes('__tests__') && !f.includes(`${join('src', 'lib')}`)
  );
  const consumerText = consumers.map((f) => readFileSync(f, 'utf8')).join('\n');

  const orphans = libModules.filter((module) => {
    const patterns = [`@/lib/${module}`, `../lib/${module}`, `./lib/${module}`, `lib/${module}'`];
    return !patterns.some((p) => consumerText.includes(p));
  });

  report.metric(
    'lib modules reachable from a screen',
    `${libModules.length - orphans.length} of ${libModules.length}`
  );

  report.flagIf(
    orphans.length > 0,
    'medium',
    'Modules that no screen imports',
    'These are finished, tested modules that nothing in the app calls, so none of their behaviour reaches a student. Either wire them up or the feature does not exist yet.',
    orphans.map((m) => `src/lib/${m}.ts`)
  );

  // --- fields dropped on the way into the database ------------------------

  const dbPath = join(ROOT, 'src', 'lib', 'db.ts');
  const storePath = join(ROOT, 'src', 'store', 'notes.ts');

  if (existsSync(dbPath) && existsSync(storePath)) {
    const dbSource = readFileSync(dbPath, 'utf8');
    const storeSource = readFileSync(storePath, 'utf8');

    // Columns the questions table can hold beyond the bare minimum.
    const optionalColumns = ['kind', 'source_line', 'ordered'];
    const storable = optionalColumns.filter((column) => dbSource.includes(column));

    // The object literal handed to the writer.
    const callSite = /addQuestionsToDeck\(([\s\S]{0,400}?)\n\s*\);/.exec(storeSource);

    if (storable.length === 0 || !callSite) {
      report.metric('Write-path field check', 'skipped', 'call site or schema not recognised');
    } else {
      const written = callSite[1];
      const camel: Record<string, string> = {
        kind: 'kind',
        source_line: 'sourceLine',
        ordered: 'ordered',
      };
      const dropped = storable.filter((column) => !written.includes(camel[column]));

      report.metric(
        'Fields carried into SQLite',
        `${storable.length - dropped.length} of ${storable.length}`,
        'parser output vs what the store actually writes'
      );

      report.flagIf(
        dropped.length > 0,
        'high',
        'The parser’s classification is thrown away when notes are saved',
        `The questions table stores ${storable.join(', ')} and the parser fills all of them, but the save path writes only prompt, correctAnswer and answers. Because DownloadableQuestion marks the rest optional, TypeScript cannot catch it, and the missing columns fall back to their defaults — kind becomes 'trivia' and sourceLine becomes null for every note question ever saved.\n\n` +
          `The visible consequence: supportedFormats() keys off kind, so every saved question offers the same two formats no matter what the notes contained. Definitions stop offering matching, cloze questions stop offering fill-in-the-blank and true/false, and an enumeration is stored as a multiple-choice question whose "right answer" is just the first item in the list. That is one deck behaving identically for every subject a student pastes.`,
        [
          `dropped on write: ${dropped.map((c) => camel[c]).join(', ')}`,
          written.replace(/\s+/g, ' ').trim(),
        ],
        'src/store/notes.ts → saveDraft'
      );
    }
  }

  // --- leftovers ----------------------------------------------------------

  const markers: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const relative = file.replace(`${ROOT}/`, '');
    source.split('\n').forEach((line, i) => {
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) {
        markers.push(`${relative}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
      if (/console\.log\(/.test(line) && !relative.includes('__tests__')) {
        markers.push(`${relative}:${i + 1}  console.log left in shipped code`);
      }
    });
  }

  report.metric('Leftover markers', markers.length, 'TODO / FIXME / stray console.log');
  report.flagIf(
    markers.length > 0,
    'low',
    'Unfinished markers in shipped code',
    'Worth a sweep before a build goes out.',
    markers
  );

  return report;
}
