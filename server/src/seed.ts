import { connectDb, disconnectDb } from './db.js';
import { Project, Task } from './models.js';

const seedProjects = [
  {
    name: 'DevBoard launch',
    description: 'Ship the first version of this full-stack project tracker.',
    status: 'ACTIVE',
  },
  {
    name: 'Weekday application prep',
    description: 'Proof project and application materials for the Software Engineer Intern role.',
    status: 'ACTIVE',
  },
];

const seedTasks: Array<{ project: number; title: string; description: string; status: string; priority: string }> = [
  {
    project: 0,
    title: 'Build GraphQL API with Apollo Server',
    description: 'Queries and mutations for projects and tasks, backed by MongoDB.',
    status: 'DONE',
    priority: 'HIGH',
  },
  {
    project: 0,
    title: 'Build React frontend with Apollo Client',
    description: 'Project list, task board, create/update/delete flows.',
    status: 'DONE',
    priority: 'HIGH',
  },
  {
    project: 0,
    title: 'Write automated tests',
    description: 'Backend GraphQL tests against an in-memory MongoDB.',
    status: 'DONE',
    priority: 'MEDIUM',
  },
  {
    project: 0,
    title: 'Deploy frontend, API and database',
    description: 'Vite client and Express/Apollo server on Vercel, MongoDB Atlas for storage.',
    status: 'DONE',
    priority: 'HIGH',
  },
  {
    project: 1,
    title: 'Write honest README with visible skill keywords',
    description: 'No hidden text, no tricks — skills listed in plain sight.',
    status: 'DONE',
    priority: 'MEDIUM',
  },
  {
    project: 1,
    title: 'Verify end-to-end: frontend to GraphQL to MongoDB',
    description: 'Created a task from the deployed UI and confirmed it persisted in Atlas.',
    status: 'DONE',
    priority: 'HIGH',
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/devboard';
  await connectDb(uri);
  await Project.deleteMany({});
  await Task.deleteMany({});
  const created = await Project.insertMany(seedProjects);
  await Task.insertMany(
    seedTasks.map((t) => ({
      projectId: created[t.project].id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
    })),
  );
  console.log(`Seeded ${created.length} projects and ${seedTasks.length} tasks.`);
  await disconnectDb();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
