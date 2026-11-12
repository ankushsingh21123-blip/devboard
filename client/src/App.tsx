import { useMutation, useQuery } from '@apollo/client';
import { useState } from 'react';
import { DELETE_PROJECT, GET_PROJECTS, type Project } from './graphql';
import { ProjectForm } from './components/ProjectForm';
import { TaskBoard } from './components/TaskBoard';

export function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, loading, error, refetch } = useQuery<{ projects: Project[] }>(GET_PROJECTS, {
    fetchPolicy: 'cache-and-network',
  });
  const [deleteProject] = useMutation(DELETE_PROJECT, {
    refetchQueries: [{ query: GET_PROJECTS }],
    onCompleted: () => setSelectedId(null),
  });

  const selected = data?.projects.find((p) => p.id === selectedId) ?? null;

  return (
    <main className="layout">
      <header>
        <h1>DevBoard</h1>
        <p className="muted">
          A full-stack project &amp; task tracker — React + TypeScript frontend, Node.js + GraphQL API,
          MongoDB storage.
        </p>
      </header>

      {loading && <p className="muted">Loading projects…</p>}
      {error && (
        <p className="error" role="alert">
          Could not load projects: {error.message}{' '}
          <button onClick={() => void refetch()}>Retry</button>
        </p>
      )}

      <div className="grid">
        <section className="card">
          <h2>Projects</h2>
          {!loading && !error && data?.projects.length === 0 && (
            <p className="muted">No projects yet — create the first one below.</p>
          )}
          <ul className="project-list">
            {data?.projects.map((project) => (
              <li key={project.id} className={selectedId === project.id ? 'selected' : ''}>
                <button className="project-button" onClick={() => setSelectedId(project.id)}>
                  <strong>{project.name}</strong>
                  <span className="muted">
                    {project.doneCount}/{project.taskCount} done · {project.status}
                  </span>
                  {project.description && <span className="muted">{project.description}</span>}
                </button>
                <button
                  className="danger small"
                  onClick={() => {
                    if (window.confirm(`Delete project "${project.name}" and all its tasks?`)) {
                      void deleteProject({ variables: { id: project.id } });
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <ProjectForm onCreated={() => void refetch()} />
        </section>

        {selected ? (
          <TaskBoard projectId={selected.id} projectName={selected.name} />
        ) : (
          <section className="card">
            <h2>Tasks</h2>
            <p className="muted">Select a project to see and manage its tasks.</p>
          </section>
        )}
      </div>
    </main>
  );
}
