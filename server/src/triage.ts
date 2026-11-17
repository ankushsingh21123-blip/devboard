/**
 * Rule-based task triage.
 *
 * Deterministic, explainable suggestions: no model call, no API key, no
 * training data. Every suggestion carries the reasons that produced it, so
 * the UI can show *why* a priority was suggested instead of asking the user
 * to trust a black box.
 *
 * Rules (in order):
 *  1. Urgency keywords in the title/description (urgent, blocker, crash,
 *     security, …) suggest HIGH.
 *  2. Low-effort / deferrable keywords (nice to have, cleanup, research, …)
 *     suggest LOW — but only when no urgency keyword matched.
 *  3. Due dates adjust the result: overdue tasks suggest HIGH; tasks due
 *     within 48 hours are bumped one level (LOW -> MEDIUM, MEDIUM -> HIGH).
 *  4. With no signal at all, the suggestion is MEDIUM with a default reason.
 *
 * Labels are a separate keyword classification (bug / docs / chore /
 * feature) used to describe the kind of work; they do not change priority.
 */

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TriageLabel = 'BUG' | 'FEATURE' | 'DOCS' | 'CHORE' | 'TASK';

export interface TriageInput {
  title: string;
  description?: string | null;
  /** ISO date string or Date. Invalid / missing values are ignored. */
  dueDate?: string | Date | null;
  /** Override for tests. Defaults to the current time. */
  now?: Date;
}

export interface TriageSuggestion {
  suggestedPriority: Priority;
  reasons: string[];
  label: TriageLabel;
}

const HIGH_KEYWORDS = [
  'urgent',
  'asap',
  'critical',
  'blocker',
  'blocking',
  'blocked',
  'crash',
  'outage',
  'security',
  'vulnerability',
  'data loss',
  'production',
  'broken',
  'emergency',
  'hotfix',
];

const LOW_KEYWORDS = [
  'nice to have',
  'someday',
  'cleanup',
  'clean up',
  'tidy',
  'polish',
  'research',
  'explore',
  'low priority',
];

const LABEL_RULES: Array<{ label: TriageLabel; keywords: string[] }> = [
  { label: 'BUG', keywords: ['bug', 'crash', 'error', 'broken', 'fails', 'failing', 'fix'] },
  { label: 'DOCS', keywords: ['doc', 'docs', 'readme', 'guide', 'tutorial', 'changelog'] },
  {
    label: 'CHORE',
    keywords: ['cleanup', 'clean up', 'refactor', 'upgrade', 'dependency', 'dependencies', 'chore', 'migrate', 'lint'],
  },
  {
    label: 'FEATURE',
    keywords: ['add', 'implement', 'build', 'create', 'support', 'feature', 'new'],
  },
];

const PRIORITY_ORDER: Priority[] = ['LOW', 'MEDIUM', 'HIGH'];

function containsKeyword(text: string, keyword: string): boolean {
  // Word-boundary match so "research" does not match "search", while
  // multi-word keywords ("data loss") still match as a phrase.
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function matchedKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => containsKeyword(text, keyword));
}

function classifyLabel(text: string): TriageLabel {
  for (const rule of LABEL_RULES) {
    if (matchedKeywords(text, rule.keywords).length > 0) return rule.label;
  }
  return 'TASK';
}

function parseDueDate(dueDate: string | Date | null | undefined): Date | null {
  if (!dueDate) return null;
  const parsed = dueDate instanceof Date ? dueDate : new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function suggestTriage(input: TriageInput): TriageSuggestion {
  const text = `${input.title ?? ''} ${input.description ?? ''}`.trim();
  const now = input.now ?? new Date();
  const due = parseDueDate(input.dueDate);
  const reasons: string[] = [];

  let level = 1; // MEDIUM by default

  const highHits = matchedKeywords(text, HIGH_KEYWORDS);
  const lowHits = highHits.length === 0 ? matchedKeywords(text, LOW_KEYWORDS) : [];

  if (highHits.length > 0) {
    level = 2;
    for (const hit of highHits.slice(0, 3)) {
      reasons.push(`contains urgency keyword "${hit}"`);
    }
  } else if (lowHits.length > 0) {
    level = 0;
    for (const hit of lowHits.slice(0, 3)) {
      reasons.push(`contains deferrable keyword "${hit}"`);
    }
  }

  if (due) {
    const msUntilDue = due.getTime() - now.getTime();
    if (msUntilDue < 0) {
      level = 2;
      const daysOverdue = Math.max(1, Math.ceil(-msUntilDue / 86_400_000));
      reasons.push(`overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`);
    } else if (msUntilDue <= 48 * 3_600_000) {
      level = Math.min(2, level + 1);
      reasons.push('due within 48 hours');
    }
  }

  if (reasons.length === 0) {
    reasons.push('no strong urgency signals — default priority');
  }

  return {
    suggestedPriority: PRIORITY_ORDER[level],
    reasons,
    label: classifyLabel(text),
  };
}
