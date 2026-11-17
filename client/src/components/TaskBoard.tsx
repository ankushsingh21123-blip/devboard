import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { useRef, useState } from 'react';
import {
  AUTO_TRIAGE_TASK,
  CREATE_TASK,
  DELETE_TASK,
  GET_PROJECTS,
  GET_TASKS,
  TRIAGE_TASK,
  UPDATE_TASK,
  type Task,
  type TriageSuggestion,
} from '../graphql';
import { AutomationPanel } from './AutomationPanel';

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

export function TaskBoard({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const titleInput = useRef<HTMLInputElement>(null);
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);

  const { data, loading, error, refetch } = useQuery<{ tasks: Task[] }>(GET_TASKS, {
    variables: { projectId, status: statusFilter || undefined },
    fetchPolicy: 'cache-and-network',
  });

  const [createTask, { loading: creating }] = useMutation(CREATE_TASK, {
    onCompleted: () => {
      setTitle('');
      setSuggestion(null);
      setFormError(null);
      void refetch();
    },
    onError: (err) => setFormError(err.message),
  });
  const [updateTask] = useMutation(UPDATE_TASK, { onCompleted: () => void refetch() });
  const [autoTriageTask] = useMutation(AUTO_TRIAGE_TASK, { onCompleted: () => void refetch() });
  const [runTriage, { loading: triaging }] = useLazyQuery<{ triageTask: TriageSuggestion }>(
    TRIAGE_TASK,
    {
      onCompleted: (result) => setSuggestion(result.triageTask),
      onError: (err) => setFormError(err.message),
    },
  );
  const [deleteTask] = useMutation(DELETE_TASK, {
    onCompleted: () => void refetch(),
    refetchQueries: [{ query: GET_PROJECTS }],
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleInvalid(true);
      setFormError('Task title is required.');
      titleInput.current?.focus();
      return;
    }
    void createTask({
      variables: { input: { projectId, title: title.trim(), priority } },
    });
  };

  return (
    <section className="card">
      <h2>Tasks — {projectName}</h2>

      <form onSubmit={submit} className="task-form" aria-label="Add task">
        <label className="task-title-field">
          Task title (required)
        <input
          ref={titleInput}
          name="title"
          required
          aria-invalid={titleInvalid || undefined}
          aria-describedby={titleInvalid ? 'task-error' : undefined}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSuggestion(null);
            if (titleInvalid && e.target.value.trim()) { setTitleInvalid(false); setFormError(null); }
          }}
          placeholder="New task title…"
          maxLength={200}
        />
        </label>
        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} aria-label="Priority">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <button
          type="button"
          disabled={triaging || !title.trim()}
          onClick={() => void runTriage({ variables: { title: title.trim() } })}
        >
          {triaging ? 'Checking…' : 'Suggest priority'}
        </button>
        <button type="submit" disabled={creating}>{creating ? 'Adding…' : 'Add task'}</button>
      </form>
      {formError && <p id="task-error" className="error" role="alert">{formError}</p>}
      {suggestion && (
        <div className="suggestion" role="status">
          <p>
            Suggested priority: <strong>{suggestion.suggestedPriority}</strong> · looks like a{' '}
            {suggestion.label.toLowerCase()} task.
          </p>
          <ul>
            {suggestion.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <button type="button" onClick={() => { setPriority(suggestion.suggestedPriority); setSuggestion(null); }}>
            Use {suggestion.suggestedPriority.toLowerCase()} priority
          </button>{' '}
          <button type="button" onClick={() => setSuggestion(null)}>
            Dismiss
          </button>
        </div>
      )}

      <AutomationPanel projectId={projectId} />

      <div className="filters" role="group" aria-label="Filter tasks by status">
        <button className={statusFilter === '' ? 'active' : ''} onClick={() => setStatusFilter('')}>All</button>
        {STATUSES.map((s) => (
          <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading tasks…</p>}
      {error && (
        <p className="error" role="alert">
          Could not load tasks: {error.message}{' '}
          <button onClick={() => void refetch()}>Retry</button>
        </p>
      )}
      {!loading && !error && data?.tasks.length === 0 && (
        <p className="muted">No tasks yet — add the first one above.</p>
      )}

      <ul className="task-list">
        {data?.tasks.map((task) => (
          <li key={task.id} className="task">
            <div>
              <strong>{task.title}</strong>
              <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
              {task.description && <p className="muted">{task.description}</p>}
            </div>
            <div className="task-actions">
              <select
                value={task.status}
                onChange={(e) =>
                  void updateTask({
                    variables: { id: task.id, input: { status: e.target.value } },
                  })
                }
                aria-label={`Status of ${task.title}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void autoTriageTask({ variables: { id: task.id } })}
                title="Set priority automatically from the task title, description, and due date"
              >
                Auto-triage
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (window.confirm(`Delete task "${task.title}"?`)) {
                    void deleteTask({ variables: { id: task.id } });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
