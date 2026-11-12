import { ApolloServer } from '@apollo/server';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb } from '../src/db.js';
import { Project, Task } from '../src/models.js';
import { resolvers } from '../src/resolvers.js';
import { typeDefs } from '../src/schema.js';

let mongod: MongoMemoryServer;
let server: ApolloServer;

async function exec(query: string, variables?: Record<string, unknown>) {
  const res = await server.executeOperation({ query, variables });
  if (res.body.kind !== 'single') throw new Error('Expected a single-result response');
  const single = res.body.singleResult;
  return { ...single, data: single.data as Record<string, any> | undefined };
}

beforeAll(async () => {
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
});

beforeEach(async () => {
  await Project.deleteMany({});
  await Task.deleteMany({});
});

describe('projects', () => {
  it('creates a project and lists it', async () => {
    const created = await exec(
      `mutation($input: CreateProjectInput!) {
        createProject(input: $input) { id name description status taskCount doneCount }
      }`,
      { input: { name: 'Alpha', description: 'First project' } },
    );
    expect(created.errors).toBeUndefined();
    expect(created.data?.createProject.name).toBe('Alpha');
    expect(created.data?.createProject.status).toBe('ACTIVE');
    expect(created.data?.createProject.taskCount).toBe(0);

    const listed = await exec(`query { projects { id name } }`);
    expect(listed.errors).toBeUndefined();
    expect(listed.data?.projects).toHaveLength(1);
  });

  it('rejects an empty project name', async () => {
    const res = await exec(
      `mutation($input: CreateProjectInput!) { createProject(input: $input) { id } }`,
      { input: { name: '   ' } },
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('updates a project status', async () => {
    const project = await Project.create({ name: 'Beta' });
    const res = await exec(
      `mutation($id: ID!, $input: UpdateProjectInput!) {
        updateProject(id: $id, input: $input) { id status }
      }`,
      { id: project.id, input: { status: 'COMPLETED' } },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.updateProject.status).toBe('COMPLETED');
  });

  it('deletes a project and cascades its tasks', async () => {
    const project = await Project.create({ name: 'Gamma' });
    await Task.create({ projectId: project.id, title: 'Orphan me' });
    const res = await exec(`mutation($id: ID!) { deleteProject(id: $id) }`, { id: project.id });
    expect(res.errors).toBeUndefined();
    expect(res.data?.deleteProject).toBe(true);
    expect(await Task.countDocuments({})).toBe(0);
  });

  it('returns an error for a malformed project id', async () => {
    const res = await exec(`query { project(id: "not-an-id") { id } }`);
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });
});

describe('tasks', () => {
  it('creates a task under an existing project', async () => {
    const project = await Project.create({ name: 'Delta' });
    const res = await exec(
      `mutation($input: CreateTaskInput!) {
        createTask(input: $input) { id title status priority projectId }
      }`,
      { input: { projectId: project.id, title: 'Write tests', priority: 'HIGH' } },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.createTask.title).toBe('Write tests');
    expect(res.data?.createTask.status).toBe('TODO');
    expect(res.data?.createTask.priority).toBe('HIGH');
  });

  it('rejects a task for a missing project', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await exec(
      `mutation($input: CreateTaskInput!) { createTask(input: $input) { id } }`,
      { input: { projectId: fakeId, title: 'Nope' } },
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
  });

  it('moves a task to DONE and filters by status', async () => {
    const project = await Project.create({ name: 'Epsilon' });
    const task = await Task.create({ projectId: project.id, title: 'Ship it' });
    const updated = await exec(
      `mutation($id: ID!, $input: UpdateTaskInput!) {
        updateTask(id: $id, input: $input) { id status }
      }`,
      { id: task.id, input: { status: 'DONE' } },
    );
    expect(updated.errors).toBeUndefined();
    expect(updated.data?.updateTask.status).toBe('DONE');

    const done = await exec(
      `query($projectId: ID, $status: TaskStatus) { tasks(projectId: $projectId, status: $status) { id } }`,
      { projectId: project.id, status: 'DONE' },
    );
    expect(done.data?.tasks).toHaveLength(1);
    const todo = await exec(
      `query($projectId: ID, $status: TaskStatus) { tasks(projectId: $projectId, status: $status) { id } }`,
      { projectId: project.id, status: 'TODO' },
    );
    expect(todo.data?.tasks).toHaveLength(0);
  });

  it('deletes a task', async () => {
    const project = await Project.create({ name: 'Zeta' });
    const task = await Task.create({ projectId: project.id, title: 'Temporary' });
    const res = await exec(`mutation($id: ID!) { deleteTask(id: $id) }`, { id: task.id });
    expect(res.errors).toBeUndefined();
    expect(res.data?.deleteTask).toBe(true);
    expect(await Task.findById(task.id)).toBeNull();
  });

  it('rejects an invalid dueDate', async () => {
    const project = await Project.create({ name: 'Eta' });
    const res = await exec(
      `mutation($input: CreateTaskInput!) { createTask(input: $input) { id } }`,
      { input: { projectId: project.id, title: 'Bad date', dueDate: 'not-a-date' } },
    );
    expect(res.errors).toBeDefined();
    expect(res.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });
});

describe('project task counts', () => {
  it('reports taskCount and doneCount correctly', async () => {
    const project = await Project.create({ name: 'Theta' });
    await Task.create({ projectId: project.id, title: 'One', status: 'DONE' });
    await Task.create({ projectId: project.id, title: 'Two', status: 'TODO' });
    const res = await exec(`query { projects { taskCount doneCount } }`);
    expect(res.errors).toBeUndefined();
    expect(res.data?.projects[0].taskCount).toBe(2);
    expect(res.data?.projects[0].doneCount).toBe(1);
  });
});
