/**
 * Due-date reminders.
 *
 * Pure date logic: given tasks and "now", return the reminders worth
 * showing. Completed tasks and tasks without a due date never produce a
 * reminder. Reminders are ordered overdue-first, then by due date.
 */

export type ReminderLevel = 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON';

export interface ReminderInput {
  id: string;
  title: string;
  status: string;
  dueDate: string | Date | null;
}

export interface DueReminder {
  taskId: string;
  title: string;
  /** ISO string of the task's due date. */
  dueDate: string;
  level: ReminderLevel;
  message: string;
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function buildReminders(tasks: ReminderInput[], now: Date = new Date()): DueReminder[] {
  const reminders: DueReminder[] = [];
  const todayStart = startOfDay(now);

  for (const task of tasks) {
    if (task.status === 'DONE') continue;
    if (!task.dueDate) continue;
    const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) continue;

    const diffDays = Math.round((startOfDay(due) - todayStart) / DAY_MS);
    if (diffDays < 0) {
      const days = -diffDays;
      reminders.push({
        taskId: task.id,
        title: task.title,
        dueDate: due.toISOString(),
        level: 'OVERDUE',
        message: `Overdue by ${days} day${days === 1 ? '' : 's'}`,
      });
    } else if (diffDays === 0) {
      reminders.push({
        taskId: task.id,
        title: task.title,
        dueDate: due.toISOString(),
        level: 'DUE_TODAY',
        message: 'Due today',
      });
    } else if (diffDays <= 3) {
      reminders.push({
        taskId: task.id,
        title: task.title,
        dueDate: due.toISOString(),
        level: 'DUE_SOON',
        message: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
      });
    }
  }

  const rank: Record<ReminderLevel, number> = { OVERDUE: 0, DUE_TODAY: 1, DUE_SOON: 2 };
  reminders.sort(
    (a, b) => rank[a.level] - rank[b.level] || a.dueDate.localeCompare(b.dueDate),
  );
  return reminders;
}
