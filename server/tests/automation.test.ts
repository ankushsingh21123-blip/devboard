import { ApolloServer } from '@apollo/server';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { summariseProject } from '../src/aiSummary.js';
import { connectDb, disconnectDb } from '../src/db.js';
import { Project, Task } from '../src/models.js';
import { buildReminders } from '../src/reminders.js';
import { resolvers } from '../src/resolvers.js';
import { typeDefs } from '../src/schema.js';
import { suggestTriage } from '../src/triage.js';

// ---------------------------------------------------------------------------
// Rule-based triage (pure functions, no database)
// ---------------------------------------------------------------------------

describe('suggestTriage', () => {
  const now = new Date('2026-11-17T10:00:00.000Z');

  it('suggests HIGH for urgency keywords and names the keyword', () => {
    const result = suggestTriage({ title: 'URGENT: fix login crash', now });
    expect(result.suggestedPriority).toBe('HIGH');
    expect(result.reasons.some((r) => r.includes('"urgent"'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('"crash"'))).toBe(true);
    expect(result.label).toBe('BUG');
  });

  it('suggests HIGH for a blocker', () => {
    const result = suggestTriage({ title: 'Deploy blocked by failing migration', now });
    expect(result.suggestedPriority).toBe('HIGH');
    expect(result.reasons.some((r) => r.includes('"blocked"'))).toBe(true);
  });

  it('suggests LOW for deferrable work when nothing urgent matches', () => {
    const result = suggestTriage({ title: 'Cleanup old files, someday', now });
    expect(result.suggestedPriority).toBe('LOW');
    expect(result.reasons.some((r) => r.includes('"cleanup"'))).toBe(true);
    expect(result.label).toBe('CHORE');
  });

  it('lets urgency win over deferrable keywords', () => {
    const result = suggestTriage({
      title: 'Research the production outage cause',
      description: 'nice to have a write-up too',
      now,
    });
    expect(result.suggestedPriority).toBe('HIGH');
  });

  it('suggests HIGH for an overdue task even with no keywords', () => {
    const result = suggestTriage({
      title: 'Quarterly report',
      dueDate: '2026-11-15T10:00:00.000Z',
      now,
    });
    expect(result.suggestedPriority).toBe('HIGH');
    expect(result.reasons.some((r) => r.includes('overdue by 2 days'))).toBe(true);
  });

  it('bumps MEDIUM to HIGH when due within 48 hours', () => {
    const result = suggestTriage({
      title: 'Ship release notes',
      dueDate: '2026-11-18T10:00:00.000Z',
      now,
    });
    expect(result.suggestedPriority).toBe('HIGH');
    expect(result.reasons).toContain('due within 48 hours');
  });

  it('bumps LOW to MEDIUM when due within 48 hours', () => {
    const result = suggestTriage({
      title: 'Research caching options',
      dueDate: '2026-11-18T10:00:00.000Z',
      now,
    });
    expect(result.suggestedPriority).toBe('MEDIUM');
  });

  it('keeps the MEDIUM default for a far-future due date and no keywords', () => {
    const result = suggestTriage({
      title: 'Plan next quarter roadmap',
      dueDate: '2026-12-20T10:00:00.000Z',
      now,
    });
    expect(result.suggestedPriority).toBe('MEDIUM');
    expect(result.reasons).toContain('no strong urgency signals — default priority');
  });

  it('ignores an invalid due date', () => {
    const result = suggestTriage({ title: 'Plan next quarter roadmap', dueDate: 'not-a-date', now });
    expect(result.suggestedPriority).toBe('MEDIUM');
    expect(result.reasons).toContain('no strong urgency signals — default priority');
  });

  it('classifies docs, feature, and plain tasks', () => {
    expect(suggestTriage({ title: 'Write docs for the API', now }).label).toBe('DOCS');
    expect(suggestTriage({ title: 'Add user login page', now }).label).toBe('FEATURE');
    expect(suggestTriage({ title: 'Refactor database layer', now }).label).toBe('CHORE');
    expect(suggestTriage({ title: 'Quarterly report', now }).label).toBe('TASK');
  });

  it('also reads keywords from the description', () => {
    const result = suggestTriage({
      title: 'Investigate checkout',
      description: 'Customers report a security warning at payment',
      now,
    });
    expect(result.suggestedPriority).toBe('HIGH');
    expect(result.reasons.some((r) => r.includes('"security"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Due-date reminders (pure functions, no database)
// ---------------------------------------------------------------------------

describe('buildReminders', () => {
  const now = new Date('2026-11-17T10:00:00.000Z');

  it('flags an overdue task', () => {
    const [reminder] = buildReminders(
      [{ id: '1', title: 'Late report', status: 'TODO', dueDate: '2026-11-15T09:00:00.000Z' }],
      now,
    );
    expect(reminder.level).toBe('OVERDUE');
    expect(reminder.message).toBe('Overdue by 2 days');
    expect(reminder.taskId).toBe('1');
  });

  it('flags a task due today', () => {
    const [reminder] = buildReminders(
      [{ id: '1', title: 'Due today', status: 'IN_PROGRESS', dueDate: '2026-11-17T18:00:00.000Z' }],
      now,
    );
    expect(reminder.level).toBe('DUE_TODAY');
    expect(reminder.message).toBe('Due today');
  });

  it('flags a task due within 3 days', () => {
    const [reminder] = buildReminders(
      [{ id: '1', title: 'Due soon', status: 'TODO', dueDate: '2026-11-19T09:00:00.000Z' }],
      now,
    );
    expect(reminder.level).toBe('DUE_SOON');
    expect(reminder.message).toBe('Due in 2 days');
  });

  it('stays silent for tasks due more than 3 days away', () => {
    const reminders = buildReminders(
      [{ id: '1', title: 'Far away', status: 'TODO', dueDate: '2026-11-27T09:00:00.000Z' }],
      now,
    );
    expect(reminders).toHaveLength(0);
  });

  it('stays silent for done tasks and tasks without a due date', () => {
    const reminders = buildReminders(
      [
        { id: '1', title: 'Done late', status: 'DONE', dueDate: '2026-11-10T09:00:00.000Z' },
        { id: '2', title: 'No date', status: 'TODO', dueDate: null },
        { id: '3', title: 'Bad date', status: 'TODO', dueDate: 'not-a-date' },
      ],
      now,
    );
    expect(reminders).toHaveLength(0);
  });

  it('orders overdue first, then due today, then due soon', () => {
    const reminders = buildReminders(
      [
        { id: 'soon', title: 'Soon', status: 'TODO', dueDate: '2026-11-19T09:00:00.000Z' },
        { id: 'late', title: 'Late', status: 'TODO', dueDate: '2026-11-15T09:00:00.000Z' },
        { id: 'today', title: 'Today', status: 'TODO', dueDate: '2026-11-17T12:00:00.000Z' },
      ],
      now,
    );
    expect(reminders.map((r) => r.taskId)).toEqual(['late', 'today', 'soon']);
  });
});

// ---------------------------------------------------------------------------
// AI summary (mocked fetch — never hits the network, never needs a key)
// ---------------------------------------------------------------------------

describe('summariseProject', () => {
  const now = new Date('2026-11-17T10:00:00.000Z');
  const tasks = [
    { title: 'Fix login crash', description: '', status: 'TODO', priority: 'HIGH', dueDate: '2026-11-16T09:00:00.000Z' },
    { title: 'Write docs', description: '', status: 'DONE', priority: 'LOW', dueDate: null },
    { title: 'Add settings page', description: '', status: 'TODO', priority: 'MEDIUM', dueDate: '2026-11-20T09:00:00.000Z' },
  ];

  function geminiBody(text: string) {
    return { candidates: [{ content: { parts: [{ text }] } }] };
  }

  function mockFetch(body: unknown, ok = true, status = 200) {
    return (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;
  }

  it('uses the local summary when no API key is set', async () => {
    const result = await summariseProject('Alpha', tasks, { now });
    expect(result.source).toBe('local');
    expect(result.totalTasks).toBe(3);
    expect(result.doneTasks).toBe(1);
    expect(result.openTasks).toBe(2);
    expect(result.overdueTasks).toBe(1);
    expect(result.summary).toContain('3 tasks');
    expect(result.nextSteps[0]).toContain('Fix login crash');
  });

  it('summarises an empty project locally', async () => {
    const result = await summariseProject('Empty', [], { now });
    expect(result.source).toBe('local');
    expect(result.totalTasks).toBe(0);
    expect(result.nextSteps).toHaveLength(0);
    expect(result.summary).toContain('no tasks yet');
  });

  it('uses the Gemini result when the mocked API returns valid JSON', async () => {
    const seen: string[] = [];
    const fetchFn = (async (url: string) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => geminiBody('{"summary": "AI summary here.", "nextSteps": ["Do the thing"]}') };
    }) as unknown as typeof fetch;
    const result = await summariseProject('Alpha', tasks, { apiKey: 'test-key', fetchFn, now });
    expect(result.source).toBe('gemini');
    expect(result.summary).toBe('AI summary here.');
    expect(result.nextSteps).toEqual(['Do the thing']);
    expect(result.totalTasks).toBe(3);
    expect(seen[0]).toContain('gemini-2.5-flash');
    expect(seen[0]).toContain('generateContent');
  });

  it('falls back to the local summary when fetch throws', async () => {
    const fetchFn = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const result = await summariseProject('Alpha', tasks, { apiKey: 'test-key', fetchFn, now });
    expect(result.source).toBe('local');
    expect(result.summary).toContain('3 tasks');
  });

  it('falls back to the local summary on a non-200 response', async () => {
    const result = await summariseProject('Alpha', tasks, {
      apiKey: 'bad-key',
      fetchFn: mockFetch({ error: { message: 'API key not valid' } }, false, 400),
      now,
    });
    expect(result.source).toBe('local');
  });

  it('falls back to the local summary when the model text is not usable JSON', async () => {
    const result = await summariseProject('Alpha', tasks, {
      apiKey: 'test-key',
      fetchFn: mockFetch(geminiBody('just some prose, no JSON here')),
      now,
    });
    expect(result.source).toBe('local');
  });

  it('parses model JSON wrapped in a code fence', async () => {
    const result = await summariseProject('Alpha', tasks, {
      apiKey: 'test-key',
      fetchFn: mockFetch(geminiBody('```json\n{"summary": "Fenced summary.", "nextSteps": []}\n```')),
      now,
    });
    expect(result.source).toBe('gemini');
    expect(result.summary).toBe('Fenced summary.');
  });
});

// ---------------------------------------------------------------------------
// GraphQL surface for the automations (in-memory MongoDB)
// ---------------------------------------------------------------------------

let mongod: MongoMemoryServer;
let server: ApolloServer;
let savedGeminiKey: string | undefined;

async function exec(query: string, variables?: Record<string, unknown>) {
  const res = await server.executeOperation({ query, variables });
  if (res.body.kind !== 'single') throw new Error('Expected a single-result response');
  const single = res.body.singleResult;
  return { ...single, data: single.data as Record<string, any> | undefined };
}

beforeAll(async () => {
  // The GraphQL summary test must exercise the local fallback, never the
  // network — remove any key the environment happens to provide.
  savedGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 120000);

afterAll(async () => {
  await server?.stop();
  await disconnectDb();
  await mongod?.stop();
  await mongoose.disconnect();
  if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey;
});

beforeEach(async () => {
  await Project.deleteMany({});
  await Task.deleteMany({});
});

describe('automation GraphQL API', () => {
  it('triageTask returns a suggestion with reasons and a label', async () => {
    const res = await exec(
      `query($title: String!) { triageTask(title: $title) { suggestedPriority reasons label } }`,
      { title: 'URGENT: fix login crash' },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.triageTask.suggestedPriority).toBe('HIGH');
    expect(res.data?.triageTask.label).toBe('BUG');
    expect(res.data?.triageTask.reasons.length).toBeGreaterThan(0);
  });

  it('triageTask rejects an empty title', async () => {
    const res = await exec(
      `query($title: String!) { triageTask(title: $title) { suggestedPriority } }`,
      { title: '   ' },
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('projectSummary returns a local summary with counts when no key is set', async () => {
    const project = await Project.create({ name: 'Alpha' });
    await Task.create({ projectId: project.id, title: 'One', status: 'DONE' });
    await Task.create({ projectId: project.id, title: 'Two', status: 'TODO', priority: 'HIGH' });
    const res = await exec(
      `query($projectId: ID!) { projectSummary(projectId: $projectId) { summary nextSteps source totalTasks doneTasks openTasks overdueTasks } }`,
      { projectId: project.id },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.projectSummary.source).toBe('local');
    expect(res.data?.projectSummary.totalTasks).toBe(2);
    expect(res.data?.projectSummary.doneTasks).toBe(1);
    expect(res.data?.projectSummary.openTasks).toBe(1);
    expect(res.data?.projectSummary.nextSteps[0]).toContain('Two');
  });

  it('projectSummary reports NOT_FOUND for a missing project', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await exec(
      `query($projectId: ID!) { projectSummary(projectId: $projectId) { summary } }`,
      { projectId: fakeId },
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
  });

  it('dueReminders lists overdue and due-soon tasks, excluding done ones', async () => {
    const project = await Project.create({ name: 'Beta' });
    const yesterday = new Date(Date.now() - 86_400_000);
    const tomorrow = new Date(Date.now() + 86_400_000);
    const farAway = new Date(Date.now() + 10 * 86_400_000);
    await Task.create({ projectId: project.id, title: 'Late', status: 'TODO', dueDate: yesterday });
    await Task.create({ projectId: project.id, title: 'Soon', status: 'TODO', dueDate: tomorrow });
    await Task.create({ projectId: project.id, title: 'Far', status: 'TODO', dueDate: farAway });
    await Task.create({ projectId: project.id, title: 'Done late', status: 'DONE', dueDate: yesterday });
    const res = await exec(
      `query($projectId: ID) { dueReminders(projectId: $projectId) { taskId title level message } }`,
      { projectId: project.id },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.dueReminders.map((r: { title: string }) => r.title)).toEqual(['Late', 'Soon']);
    expect(res.data?.dueReminders[0].level).toBe('OVERDUE');
    expect(res.data?.dueReminders[1].level).toBe('DUE_SOON');
  });

  it('autoTriageTask raises the priority of an urgent task', async () => {
    const project = await Project.create({ name: 'Gamma' });
    const task = await Task.create({
      projectId: project.id,
      title: 'URGENT: fix production crash',
      priority: 'LOW',
    });
    const res = await exec(
      `mutation($id: ID!) { autoTriageTask(id: $id) { id priority } }`,
      { id: task.id },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.autoTriageTask.priority).toBe('HIGH');
    expect((await Task.findById(task.id))?.priority).toBe('HIGH');
  });

  it('autoTriageTask reports NOT_FOUND for a missing task', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await exec(`mutation($id: ID!) { autoTriageTask(id: $id) { id } }`, { id: fakeId });
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
  });
});
