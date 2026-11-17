import { ApolloClient, gql, HttpLink, InMemoryCache } from '@apollo/client';

export const client = new ApolloClient({
  link: new HttpLink({ uri: '/graphql' }),
  cache: new InMemoryCache(),
});

export const GET_PROJECTS = gql`
  query GetProjects {
    projects {
      id
      name
      description
      status
      taskCount
      doneCount
      createdAt
    }
  }
`;

export const GET_TASKS = gql`
  query GetTasks($projectId: ID, $status: TaskStatus) {
    tasks(projectId: $projectId, status: $status) {
      id
      projectId
      title
      description
      status
      priority
      dueDate
      createdAt
    }
  }
`;

export const CREATE_PROJECT = gql`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      name
      description
      status
      taskCount
      doneCount
    }
  }
`;

export const DELETE_PROJECT = gql`
  mutation DeleteProject($id: ID!) {
    deleteProject(id: $id)
  }
`;

export const CREATE_TASK = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      id
      projectId
      title
      description
      status
      priority
      dueDate
    }
  }
`;

export const UPDATE_TASK = gql`
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      id
      title
      status
      priority
    }
  }
`;

export const DELETE_TASK = gql`
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`;

export const TRIAGE_TASK = gql`
  query TriageTask($title: String!, $description: String, $dueDate: String) {
    triageTask(title: $title, description: $description, dueDate: $dueDate) {
      suggestedPriority
      reasons
      label
    }
  }
`;

export const PROJECT_SUMMARY = gql`
  query ProjectSummary($projectId: ID!) {
    projectSummary(projectId: $projectId) {
      summary
      nextSteps
      source
      totalTasks
      doneTasks
      openTasks
      overdueTasks
    }
  }
`;

export const DUE_REMINDERS = gql`
  query DueReminders($projectId: ID) {
    dueReminders(projectId: $projectId) {
      taskId
      title
      dueDate
      level
      message
    }
  }
`;

export const AUTO_TRIAGE_TASK = gql`
  mutation AutoTriageTask($id: ID!) {
    autoTriageTask(id: $id) {
      id
      title
      status
      priority
    }
  }
`;

export type Project = {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  taskCount: number;
  doneCount: number;
  createdAt: string;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate: string | null;
  createdAt: string;
};

export type TriageSuggestion = {
  suggestedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  label: 'BUG' | 'FEATURE' | 'DOCS' | 'CHORE' | 'TASK';
};

export type ProjectSummary = {
  summary: string;
  nextSteps: string[];
  source: string;
  totalTasks: number;
  doneTasks: number;
  openTasks: number;
  overdueTasks: number;
};

export type DueReminder = {
  taskId: string;
  title: string;
  dueDate: string;
  level: 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON';
  message: string;
};
