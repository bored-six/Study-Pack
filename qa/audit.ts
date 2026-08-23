/**
 * Runs every check and assembles the report.
 *
 * A check that throws is itself a finding — the audit never dies quietly.
 */

import { checkExam } from './checks/exam';
import { checkGrading } from './checks/grading';
import { checkMastery } from './checks/mastery';
import { checkParser } from './checks/parser';
import { checkPlanner } from './checks/planner';
import { checkRobustness } from './checks/robustness';
import { checkSameness } from './checks/sameness';
import { checkStatic } from './checks/static';
import {
  countBySeverity,
  renderConsole,
  renderReport,
  type Section,
  type Severity,
} from './report';

type Check = () => { section: () => Section };

const CHECKS: { name: string; run: Check }[] = [
  { name: 'Project health', run: checkStatic },
  { name: 'Question integrity', run: checkParser },
  { name: 'Repetition & input sensitivity', run: checkSameness },
  { name: 'Grading', run: checkGrading },
  { name: 'Exam formats', run: checkExam },
  { name: 'Reminders & streaks', run: checkPlanner },
  { name: 'Mastery model', run: checkMastery },
  { name: 'Robustness', run: checkRobustness },
];

export interface AuditResult {
  sections: Section[];
  counts: Record<Severity, number>;
  markdown: string;
  console: string;
  elapsedMs: number;
}

export function runAudit(): AuditResult {
  const started = Date.now();
  const sections: Section[] = [];

  for (const check of CHECKS) {
    try {
      sections.push(check.run().section());
    } catch (e) {
      sections.push({
        name: check.name,
        purpose: 'This check could not complete.',
        metrics: [],
        findings: [
          {
            id: 'AUDIT-00',
            severity: 'high',
            title: `The "${check.name}" check crashed`,
            detail:
              'The audit could not finish this section, which usually means the code under test threw on input the check assumed was safe.',
            evidence: [(e as Error).stack ?? String(e)],
          },
        ],
      });
    }
  }

  const elapsedMs = Date.now() - started;
  const counts = countBySeverity(sections);

  const markdown = renderReport(sections, {
    Generated: new Date().toISOString(),
    Scope: 'src/lib pure modules, the notes → quiz → exam → grading chain, and project health',
    Duration: `${(elapsedMs / 1000).toFixed(1)}s`,
  });

  return { sections, counts, markdown, console: renderConsole(sections), elapsedMs };
}
