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
