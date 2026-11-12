export const typeDefs = `#graphql
  enum ProjectStatus {
    ACTIVE
    COMPLETED
    ARCHIVED
  }

  enum TaskStatus {
    TODO
    IN_PROGRESS
    DONE
  }

  enum Priority {
    LOW
    MEDIUM
    HIGH
  }

  type Project {
    id: ID!
    name: String!
    description: String!
    status: ProjectStatus!
    taskCount: Int!
    doneCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  type Task {
    id: ID!
    projectId: ID!
    title: String!
    description: String!
    status: TaskStatus!
    priority: Priority!
    dueDate: String
    createdAt: String!
    updatedAt: String!
  }

  input CreateProjectInput {
    name: String!
    description: String
  }

  input UpdateProjectInput {
    name: String
    description: String
    status: ProjectStatus
  }

  input CreateTaskInput {
    projectId: ID!
    title: String!
    description: String
    priority: Priority
    dueDate: String
  }

  input UpdateTaskInput {
    title: String
    description: String
    status: TaskStatus
    priority: Priority
    dueDate: String
  }

  type Query {
    projects(status: ProjectStatus): [Project!]!
    project(id: ID!): Project
    tasks(projectId: ID, status: TaskStatus): [Task!]!
    task(id: ID!): Task
  }

  type Mutation {
    createProject(input: CreateProjectInput!): Project!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!
    createTask(input: CreateTaskInput!): Task!
    updateTask(id: ID!, input: UpdateTaskInput!): Task!
    deleteTask(id: ID!): Boolean!
  }
`;
