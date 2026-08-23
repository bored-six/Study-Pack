/**
 * Entry point for the audit.
 *
 *   npm run qa                 full report, fails on a high-severity finding
 *   QA_FAIL_ON=none npm run qa report only, never fails
 *   QA_FAIL_ON=medium npm run qa
 *   QA_SKIP_SUBPROCESS=1 …     skip the typecheck and unit-test shell-outs
 *
 * The markdown report is written to qa/report.md on every run.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runAudit } from './audit';
import { SEVERITY_ORDER, type Severity } from './report';

const FAIL_ON = (process.env.QA_FAIL_ON ?? 'high') as Severity | 'none';

describe('StudyPack QA audit', () => {
  it(
    'reports on the current state of the app',
    () => {
      const audit = runAudit();
      const reportPath = join(__dirname, 'report.md');
      writeFileSync(reportPath, audit.markdown, 'utf8');

      const { high, medium, low, info } = audit.counts;
      process.stdout.write(audit.console);
      process.stdout.write(
        `\n\n${'═'.repeat(64)}\n` +
          `  ${high} high · ${medium} medium · ${low} low · ${info} info` +
          `   (${(audit.elapsedMs / 1000).toFixed(1)}s)\n` +
          `  Full report: qa/report.md\n` +
          `${'═'.repeat(64)}\n\n`
      );

      if (FAIL_ON === 'none') return;

      const threshold = SEVERITY_ORDER.indexOf(FAIL_ON as Severity);
      const blocking = audit.sections
        .flatMap((section) => section.findings)
        .filter((finding) => SEVERITY_ORDER.indexOf(finding.severity) <= threshold);

      if (blocking.length > 0) {
        throw new Error(
          `${blocking.length} finding(s) at or above ${FAIL_ON}:\n` +
            blocking.map((f) => `  ${f.id}  ${f.title}`).join('\n') +
            `\n\nSee qa/report.md. Set QA_FAIL_ON=none to report without failing.`
        );
      }
    },
    300_000
  );
});
