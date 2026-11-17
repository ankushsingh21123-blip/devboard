/**
 * Project summaries, with an optional Gemini API call.
 *
 * Behaviour:
 *  - With GEMINI_API_KEY set, the task list is sent to the Gemini REST API
 *    (generateContent) and the model returns a short summary + next steps.
 *  - Without a key — or if the API call fails, times out, or returns
 *    unusable output — a deterministic local summary is built from task
 *    counts and priorities instead. The caller always gets a usable
 *    summary; the `source` field says which path produced it.
 *
 * The API key is read from the environment by the caller (the GraphQL
 * resolver) and is never logged, never returned, and never stored. Input is
 * bounded (max 30 tasks, truncated titles/descriptions) so prompts stay
 * small. `fetch` is injectable so tests can use a mock and never hit the
 * network.
 */

export interface SummaryTaskInput {
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | Date | null;
}

export interface ProjectSummaryResult {
  summary: string;
  nextSteps: string[];
  source: 'gemini' | 'local';
  totalTasks: number;
  doneTasks: number;
  openTasks: number;
  overdueTasks: number;
}

export interface SummariseDeps {
  /** Gemini API key. When absent, the local summary is used. */
  apiKey?: string;
  /** Gemini model name. Defaults to gemini-2.5-flash. */
  model?: string;
  /** Injectable fetch (tests pass a mock). Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Override for tests. Defaults to the current time. */
  now?: Date;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_TASKS_IN_PROMPT = 30;
const REQUEST_TIMEOUT_MS = 8000;

interface Counts {
  total: number;
  done: number;
  open: number;
  overdue: number;
}

function countTasks(tasks: SummaryTaskInput[], now: Date): Counts {
  let done = 0;
  let overdue = 0;
  for (const task of tasks) {
    if (task.status === 'DONE') {
      done += 1;
      continue;
    }
    if (task.dueDate) {
      const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
      if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) overdue += 1;
    }
  }
  return { total: tasks.length, done, open: tasks.length - done, overdue };
}

function priorityRank(priority: string): number {
  if (priority === 'HIGH') return 0;
  if (priority === 'MEDIUM') return 1;
  return 2;
}

function dueTime(task: SummaryTaskInput): number {
  if (!task.dueDate) return Number.POSITIVE_INFINITY;
  const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  return Number.isNaN(due.getTime()) ? Number.POSITIVE_INFINITY : due.getTime();
}

/** Top open tasks, highest priority first, earliest due date first. */
function pickNextSteps(tasks: SummaryTaskInput[]): string[] {
  return tasks
    .filter((task) => task.status !== 'DONE')
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || dueTime(a) - dueTime(b))
    .slice(0, 3)
    .map((task) => {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      const dueLabel =
        due && !Number.isNaN(due.getTime()) ? `, due ${due.toISOString().slice(0, 10)}` : '';
      return `${task.title} (${task.priority} priority${dueLabel})`;
    });
}

function localSummary(projectName: string, tasks: SummaryTaskInput[], now: Date): ProjectSummaryResult {
  const counts = countTasks(tasks, now);
  const nextSteps = pickNextSteps(tasks);
  let summary: string;
  if (counts.total === 0) {
    summary = `Project "${projectName}" has no tasks yet. Add the first task to get started.`;
  } else if (counts.open === 0) {
    summary = `Project "${projectName}" has ${counts.total} task${counts.total === 1 ? '' : 's'}, all done. Nothing open.`;
  } else {
    const overduePart =
      counts.overdue > 0
        ? ` ${counts.overdue} overdue task${counts.overdue === 1 ? '' : 's'} need${counts.overdue === 1 ? 's' : ''} attention.`
        : '';
    summary =
      `Project "${projectName}" has ${counts.total} tasks: ${counts.done} done, ${counts.open} open.${overduePart}` +
      (nextSteps.length > 0 ? ` Next focus: ${nextSteps[0]}.` : '');
  }
  return {
    summary,
    nextSteps,
    source: 'local',
    totalTasks: counts.total,
    doneTasks: counts.done,
    openTasks: counts.open,
    overdueTasks: counts.overdue,
  };
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function buildPrompt(projectName: string, tasks: SummaryTaskInput[]): string {
  const lines = tasks.slice(0, MAX_TASKS_IN_PROMPT).map((task) => {
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const dueLabel = due && !Number.isNaN(due.getTime()) ? `, due ${due.toISOString().slice(0, 10)}` : '';
    const desc = task.description ? ` — ${truncate(task.description, 200)}` : '';
    return `- [${task.status}] (${task.priority}${dueLabel}) ${truncate(task.title, 120)}${desc}`;
  });
  return [
    'You are helping summarise a software project task board. Use ONLY the tasks listed below; do not invent tasks, dates, or results.',
    `Project: ${projectName}`,
    'Tasks:',
    ...(lines.length > 0 ? lines : ['(no tasks yet)']),
    '',
    'Return ONLY a JSON object with this shape, no markdown, no extra text:',
    '{"summary": "2-3 sentences: overall progress, what is open, and what needs attention first.", "nextSteps": ["up to 3 concrete next steps, each naming a real task from the list"]}',
  ].join('\n');
}

/** Extract a JSON object from model text, tolerating code fences. */
function parseModelJson(text: string): { summary: string; nextSteps: string[] } | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { summary, nextSteps } = parsed as { summary?: unknown; nextSteps?: unknown };
    if (typeof summary !== 'string' || summary.trim().length === 0) return null;
    const steps = Array.isArray(nextSteps)
      ? nextSteps.filter((step): step is string => typeof step === 'string' && step.trim().length > 0).slice(0, 5)
      : [];
    return { summary: summary.trim(), nextSteps: steps };
  } catch {
    return null;
  }
}

function modelTextFromResponse(body: unknown): string | null {
  try {
    const candidates = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates;
    const parts = candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part) => part.text ?? '').join('');
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function summariseProject(
  projectName: string,
  tasks: SummaryTaskInput[],
  deps: SummariseDeps = {},
): Promise<ProjectSummaryResult> {
  const now = deps.now ?? new Date();
  const fallback = localSummary(projectName, tasks, now);
  const apiKey = deps.apiKey?.trim();
  if (!apiKey) return fallback;

  const model = deps.model?.trim() || DEFAULT_MODEL;
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const response = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(projectName, tasks) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) return fallback;
    const body: unknown = await response.json();
    const text = modelTextFromResponse(body);
    if (!text) return fallback;
    const parsed = parseModelJson(text);
    if (!parsed) return fallback;
    return { ...fallback, summary: parsed.summary, nextSteps: parsed.nextSteps, source: 'gemini' };
  } catch {
    // Network error, timeout, bad JSON — the local summary is the fallback.
    return fallback;
  }
}
