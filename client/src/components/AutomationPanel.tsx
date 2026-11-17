import { useLazyQuery, useQuery } from '@apollo/client';
import {
  DUE_REMINDERS,
  PROJECT_SUMMARY,
  type DueReminder,
  type ProjectSummary,
} from '../graphql';

const LEVEL_LABEL: Record<DueReminder['level'], string> = {
  OVERDUE: 'Overdue',
  DUE_TODAY: 'Due today',
  DUE_SOON: 'Due soon',
};

export function AutomationPanel({ projectId }: { projectId: string }) {
  const { data: reminderData } = useQuery<{ dueReminders: DueReminder[] }>(DUE_REMINDERS, {
    variables: { projectId },
    fetchPolicy: 'cache-and-network',
  });
  const [loadSummary, { data: summaryData, loading, error }] = useLazyQuery<{
    projectSummary: ProjectSummary;
  }>(PROJECT_SUMMARY);

  const reminders = reminderData?.dueReminders ?? [];
  const summary = summaryData?.projectSummary;

  return (
    <div className="automation" aria-label="Automation">
      <h3>Automation</h3>

      {reminders.length === 0 ? (
        <p className="muted">No overdue or upcoming due dates in this project.</p>
      ) : (
        <ul className="reminder-list">
          {reminders.map((reminder) => (
            <li key={reminder.taskId} className="reminder">
              <span className={`badge level-${reminder.level.toLowerCase()}`}>
                {LEVEL_LABEL[reminder.level]}
              </span>
              <span>
                <strong>{reminder.title}</strong>{' '}
                <span className="muted">
                  — {reminder.message} ({reminder.dueDate.slice(0, 10)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void loadSummary({ variables: { projectId } })}
        disabled={loading}
      >
        {loading ? 'Summarising…' : summary ? 'Refresh project summary' : 'Summarise project'}
      </button>
      {error && (
        <p className="error" role="alert">
          Could not load the summary: {error.message}
        </p>
      )}
      {summary && (
        <div className="summary-result">
          <p>{summary.summary}</p>
          {summary.nextSteps.length > 0 && (
            <>
              <p>
                <strong>Next steps</strong>
              </p>
              <ul className="next-steps">
                {summary.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </>
          )}
          <p className="muted source-note">
            {summary.source === 'gemini'
              ? 'AI summary generated with the Gemini API.'
              : 'Local summary — set GEMINI_API_KEY on the server to enable Gemini-powered summaries.'}
          </p>
        </div>
      )}
    </div>
  );
}
