import { useMutation } from '@apollo/client';
import { useState } from 'react';
import { CREATE_PROJECT, GET_PROJECTS, type Project } from '../graphql';

export function ProjectForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createProject, { loading }] = useMutation<{ createProject: Project }>(CREATE_PROJECT, {
    refetchQueries: [{ query: GET_PROJECTS }],
    onCompleted: () => {
      setName('');
      setDescription('');
      setError(null);
      onCreated();
    },
    onError: (err) => setError(err.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    void createProject({ variables: { input: { name: name.trim(), description: description.trim() } } });
  };

  return (
    <form onSubmit={submit} className="card form">
      <h2>New project</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Portfolio website" maxLength={120} />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" maxLength={1000} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create project'}</button>
    </form>
  );
}
