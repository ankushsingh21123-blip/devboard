import { GraphQLError } from 'graphql';
import mongoose from 'mongoose';
import { Project, Task } from './models.js';

const badInput = (message: string) => new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });

const notFound = (what: string) => new GraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw badInput(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireObjectId(value: string, field: string): void {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw badInput(`${field} must be a valid id`);
  }
}

function toProject(doc: unknown) {
  const d = (doc as { toObject: () => Record<string, unknown> }).toObject();
  return {
    id: String(d._id),
    name: d.name,
    description: d.description ?? '',
    status: d.status,
    createdAt: (d.createdAt as Date).toISOString(),
    updatedAt: (d.updatedAt as Date).toISOString(),
  };
}

function toTask(doc: unknown) {
  const d = (doc as { toObject: () => Record<string, unknown> }).toObject();
  return {
    id: String(d._id),
    projectId: String(d.projectId),
    title: d.title,
    description: d.description ?? '',
    status: d.status,
    priority: d.priority,
    dueDate: d.dueDate ? (d.dueDate as Date).toISOString() : null,
    createdAt: (d.createdAt as Date).toISOString(),
    updatedAt: (d.updatedAt as Date).toISOString(),
  };
}

export const resolvers = {
  Project: {
    taskCount: async (parent: { id: string }) => Task.countDocuments({ projectId: parent.id }),
    doneCount: async (parent: { id: string }) =>
      Task.countDocuments({ projectId: parent.id, status: 'DONE' }),
  },
  Query: {
    projects: async (_: unknown, args: { status?: string }) => {
      const filter = args.status ? { status: args.status } : {};
      const docs = await Project.find(filter).sort({ createdAt: -1 });
      return docs.map(toProject);
    },
    project: async (_: unknown, args: { id: string }) => {
      requireObjectId(args.id, 'id');
      const doc = await Project.findById(args.id);
      return doc ? toProject(doc) : null;
    },
    tasks: async (_: unknown, args: { projectId?: string; status?: string }) => {
      const filter: Record<string, unknown> = {};
      if (args.projectId) {
        requireObjectId(args.projectId, 'projectId');
        filter.projectId = args.projectId;
      }
      if (args.status) filter.status = args.status;
      const docs = await Task.find(filter).sort({ createdAt: -1 });
      return docs.map(toTask);
    },
    task: async (_: unknown, args: { id: string }) => {
      requireObjectId(args.id, 'id');
      const doc = await Task.findById(args.id);
      return doc ? toTask(doc) : null;
    },
  },
  Mutation: {
    createProject: async (_: unknown, args: { input: { name: string; description?: string } }) => {
      const name = requireNonEmpty(args.input.name, 'name');
      if (name.length > 120) throw badInput('name must be 120 characters or fewer');
      const doc = await Project.create({
        name,
        description: args.input.description?.trim() ?? '',
      });
      return toProject(doc);
    },
    updateProject: async (
      _: unknown,
      args: { id: string; input: { name?: string; description?: string; status?: string } },
    ) => {
      requireObjectId(args.id, 'id');
      const update: Record<string, unknown> = {};
      if (args.input.name !== undefined) update.name = requireNonEmpty(args.input.name, 'name');
      if (args.input.description !== undefined) update.description = args.input.description.trim();
      if (args.input.status !== undefined) update.status = args.input.status;
      const doc = await Project.findByIdAndUpdate(args.id, update, { new: true, runValidators: true });
      if (!doc) throw notFound('Project');
      return toProject(doc);
    },
    deleteProject: async (_: unknown, args: { id: string }) => {
      requireObjectId(args.id, 'id');
      const doc = await Project.findByIdAndDelete(args.id);
      if (!doc) throw notFound('Project');
      await Task.deleteMany({ projectId: args.id });
      return true;
    },
    createTask: async (
      _: unknown,
      args: {
        input: { projectId: string; title: string; description?: string; priority?: string; dueDate?: string };
      },
    ) => {
      requireObjectId(args.input.projectId, 'projectId');
      const title = requireNonEmpty(args.input.title, 'title');
      if (title.length > 200) throw badInput('title must be 200 characters or fewer');
      const project = await Project.findById(args.input.projectId);
      if (!project) throw notFound('Project');
      let dueDate: Date | null = null;
      if (args.input.dueDate) {
        dueDate = new Date(args.input.dueDate);
        if (Number.isNaN(dueDate.getTime())) throw badInput('dueDate must be a valid ISO date');
      }
      const doc = await Task.create({
        projectId: args.input.projectId,
        title,
        description: args.input.description?.trim() ?? '',
        priority: args.input.priority ?? 'MEDIUM',
        dueDate,
      });
      return toTask(doc);
    },
    updateTask: async (
      _: unknown,
      args: {
        id: string;
        input: { title?: string; description?: string; status?: string; priority?: string; dueDate?: string };
      },
    ) => {
      requireObjectId(args.id, 'id');
      const update: Record<string, unknown> = {};
      if (args.input.title !== undefined) update.title = requireNonEmpty(args.input.title, 'title');
      if (args.input.description !== undefined) update.description = args.input.description.trim();
      if (args.input.status !== undefined) update.status = args.input.status;
      if (args.input.priority !== undefined) update.priority = args.input.priority;
      if (args.input.dueDate !== undefined) {
        if (args.input.dueDate === null) {
          update.dueDate = null;
        } else {
          const parsed = new Date(args.input.dueDate);
          if (Number.isNaN(parsed.getTime())) throw badInput('dueDate must be a valid ISO date');
          update.dueDate = parsed;
        }
      }
      const doc = await Task.findByIdAndUpdate(args.id, update, { new: true, runValidators: true });
      if (!doc) throw notFound('Task');
      return toTask(doc);
    },
    deleteTask: async (_: unknown, args: { id: string }) => {
      requireObjectId(args.id, 'id');
      const doc = await Task.findByIdAndDelete(args.id);
      if (!doc) throw notFound('Task');
      return true;
    },
  },
};
