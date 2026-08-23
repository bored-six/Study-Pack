/**
 * Tiny reporting framework for the QA audit.
 *
 * A *finding* is something that looks wrong. A *metric* is a number worth
 * seeing even when nothing is wrong — the repetition scores live here, so
 * "is my generator producing the same thing for different notes?" gets an
 * answer whether or not it crosses a threshold.
 */

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  /** Stable id so a finding can be tracked between runs: 'PARSE-03'. */
  id: string;
  severity: Severity;
  title: string;
  /** What is wrong and why it matters to a student using the app. */
  detail: string;
  /** Concrete examples. Capped when rendered — the first few are enough. */
  evidence?: string[];
  /** Where to look. */
  where?: string;
}

export interface Metric {
  label: string;
  value: string;
  /** How to read the number. */
  note?: string;
}

export interface Section {
  name: string;
  /** One line on what this section checks. */
  purpose: string;
  findings: Finding[];
  metrics: Metric[];
}

export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'info'];

const BADGE: Record<Severity, string> = {
  high: 'HIGH',
  medium: 'MED ',
  low: 'LOW ',
  info: 'INFO',
};

const MAX_EVIDENCE = 4;

/** Collects findings and metrics for one section without ceremony. */
export class Report {
  readonly findings: Finding[] = [];
  readonly metrics: Metric[] = [];

  constructor(
    private readonly name: string,
    private readonly purpose: string,
    private readonly prefix: string
  ) {}

  private nextId(): string {
    return `${this.prefix}-${String(this.findings.length + 1).padStart(2, '0')}`;
  }

  add(severity: Severity, title: string, detail: string, evidence?: string[], where?: string) {
    this.findings.push({ id: this.nextId(), severity, title, detail, evidence, where });
  }

  /** Adds the finding only when `condition` is true. Reads better in checks. */
  flagIf(
    condition: boolean,
    severity: Severity,
    title: string,
    detail: string,
    evidence?: string[],
    where?: string
  ) {
    if (condition) this.add(severity, title, detail, evidence, where);
  }

  metric(label: string, value: string | number, note?: string) {
    this.metrics.push({ label, value: String(value), note });
  }

  section(): Section {
    return {
      name: this.name,
      purpose: this.purpose,
      findings: this.findings,
      metrics: this.metrics,
    };
  }
}

export function countBySeverity(sections: Section[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const section of sections) {
    for (const f of section.findings) counts[f.severity]++;
  }
  return counts;
}

function truncate(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function renderReport(sections: Section[], meta: Record<string, string>): string {
  const counts = countBySeverity(sections);
  const total = counts.high + counts.medium + counts.low + counts.info;
  const lines: string[] = [];

  lines.push('# StudyPack — QA audit');
  lines.push('');
  for (const [key, value] of Object.entries(meta)) lines.push(`**${key}:** ${value}  `);
  lines.push('');
  lines.push(
    `**Findings:** ${counts.high} high · ${counts.medium} medium · ${counts.low} low · ${counts.info} info` +
      (total === 0 ? '  \n\nNothing flagged.' : '')
  );
  lines.push('');

  if (total > 0) {
    lines.push('## Summary');
    lines.push('');
    lines.push('| | ID | Finding | Where |');
    lines.push('|---|---|---|---|');
    for (const severity of SEVERITY_ORDER) {
      for (const section of sections) {
        for (const f of section.findings.filter((x) => x.severity === severity)) {
          lines.push(`| ${BADGE[severity].trim()} | ${f.id} | ${f.title} | ${f.where ?? '—'} |`);
        }
      }
    }
    lines.push('');
  }

  for (const section of sections) {
    lines.push(`## ${section.name}`);
    lines.push('');
    lines.push(`_${section.purpose}_`);
    lines.push('');

    if (section.metrics.length > 0) {
      lines.push('| Metric | Value | Reading |');
      lines.push('|---|---|---|');
      for (const m of section.metrics) {
        lines.push(`| ${m.label} | \`${m.value}\` | ${m.note ?? ''} |`);
      }
      lines.push('');
    }

    if (section.findings.length === 0) {
      lines.push('No findings.');
      lines.push('');
      continue;
    }

    for (const severity of SEVERITY_ORDER) {
      for (const f of section.findings.filter((x) => x.severity === severity)) {
        lines.push(`### ${BADGE[severity].trim()} · ${f.id} — ${f.title}`);
        lines.push('');
        lines.push(f.detail);
        if (f.where) lines.push(`\n\`${f.where}\``);
        if (f.evidence?.length) {
          lines.push('');
          lines.push('```');
          for (const e of f.evidence.slice(0, MAX_EVIDENCE)) lines.push(truncate(e, 220));
          if (f.evidence.length > MAX_EVIDENCE) {
            lines.push(`… ${f.evidence.length - MAX_EVIDENCE} more`);
          }
          lines.push('```');
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/** Compact terminal rendering — the same content, no markdown noise. */
export function renderConsole(sections: Section[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push('');
    lines.push(`── ${section.name} ${'─'.repeat(Math.max(0, 58 - section.name.length))}`);
    for (const m of section.metrics) {
      lines.push(`   · ${m.label.padEnd(38)} ${m.value}`);
    }
    if (section.findings.length === 0) {
      lines.push('   ✓ no findings');
      continue;
    }
    for (const severity of SEVERITY_ORDER) {
      for (const f of section.findings.filter((x) => x.severity === severity)) {
        lines.push(`   [${BADGE[f.severity]}] ${f.id}  ${f.title}`);
        lines.push(`          ${truncate(f.detail, 150)}`);
        for (const e of (f.evidence ?? []).slice(0, 2)) lines.push(`          › ${truncate(e, 140)}`);
      }
    }
  }
  return lines.join('\n');
}
