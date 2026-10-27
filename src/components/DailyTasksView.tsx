import { FormEvent, useMemo, useState } from "react";
import type { DailyTask, DailyTaskDay } from "../types";

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function moveDate(dateKeyValue: string, amount: number): string {
  const date = dateFromKey(dateKeyValue);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function formatDay(dateKeyValue: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(dateFromKey(dateKeyValue));
}

function formatHistoryDay(dateKeyValue: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dateFromKey(dateKeyValue));
}

export function DailyTasksView({
  tasks,
  days,
  today,
  onOptIn,
  onAdd,
  onToggle,
  onDelete,
}: {
  tasks: DailyTask[];
  days: DailyTaskDay[];
  today: string;
  onOptIn: () => Promise<void>;
  onAdd: (title: string) => Promise<void>;
  onToggle: (task: DailyTask, completed: boolean) => Promise<void>;
  onDelete: (task: DailyTask) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const todayTasks = tasks.filter((task) => task.date === today).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const todayDay = days.find((day) => day.date === today);
  const history = useMemo(() => {
    const grouped = new Map<string, DailyTask[]>();
    for (const task of tasks) grouped.set(task.date, [...(grouped.get(task.date) ?? []), task]);
    return [...grouped.entries()]
      .map(([date, dateTasks]) => ({
        date,
        total: dateTasks.length,
        completed: dateTasks.filter((task) => task.completed).length,
        complete: dateTasks.length > 0 && dateTasks.every((task) => task.completed),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [tasks]);
  const completeDates = useMemo(() => new Set(history.filter((day) => day.complete).map((day) => day.date)), [history]);
  const completedToday = completeDates.has(today);
  const currentStreakStart = completedToday ? today : moveDate(today, -1);
  let currentStreak = 0;
  for (let cursor = currentStreakStart; completeDates.has(cursor); cursor = moveDate(cursor, -1)) currentStreak += 1;
  const bestStreak = history.reduce((best, day) => {
    if (!day.complete) return best;
    let count = 1;
    for (let cursor = moveDate(day.date, -1); completeDates.has(cursor); cursor = moveDate(cursor, -1)) count += 1;
    return Math.max(best, count);
  }, 0);
  const completedCount = tasks.filter((task) => task.completed).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Write a goal before adding it.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onAdd(title);
      setTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-stack">
      <div className="intro-block">
        <p className="eyebrow">A clear little list</p>
        <h1>Tasks</h1>
        <p className="lede">Choose a few things for today. Yesterday’s checklist stays in your history, while today starts fresh.</p>
      </div>

      <div className="task-stat-grid">
        <div className="task-stat-card"><span>Current streak</span><strong>{currentStreak}</strong><small>complete days</small></div>
        <div className="task-stat-card"><span>Best streak</span><strong>{bestStreak}</strong><small>complete days</small></div>
        <div className="task-stat-card"><span>Completed tasks</span><strong>{completedCount}</strong><small>across all days</small></div>
      </div>

      <div className="task-layout">
        <div className="task-panel">
          <div className="section-heading compact">
            <div><p className="eyebrow">Today</p><h2>{formatDay(today)}</h2></div>
            <span className="section-count">{todayTasks.filter((task) => task.completed).length}/{todayTasks.length}</span>
          </div>
          {!todayDay && <div className="task-start-card"><p className="muted">You have not made a checklist for today yet.</p><button className="primary-button" onClick={() => void onOptIn()}>Start today’s checklist</button></div>}
          {todayDay && !todayDay.optedIn && <div className="task-start-card"><p className="muted">You chose to keep today open. You can still add a task whenever you want.</p></div>}
          <div className="daily-task-list">
            {todayTasks.map((task) => <div className={task.completed ? "daily-task completed" : "daily-task"} key={task.id}>
              <label><input type="checkbox" checked={task.completed} onChange={(event) => void onToggle(task, event.target.checked)} /><span>{task.title}</span></label>
              <button className="quiet-action" onClick={() => void onDelete(task)} aria-label={`Remove ${task.title}`}>Remove</button>
            </div>)}
          </div>
          {todayDay?.optedIn && todayTasks.length === 0 && <p className="muted">Your checklist is ready. Add the first thing you want to carry today.</p>}
          <div className="task-add-area">
            <form className="task-add-form" onSubmit={(event) => void submit(event)}>
              <label className="form-label" htmlFor="daily-task-input">Add a task or goal<input id="daily-task-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Read ten pages" disabled={busy} /></label>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding…" : "Add task"}</button>
            </form>
            {error && <p className="form-error" role="alert">{error}</p>}
            <p className="form-hint">If you leave a task unfinished, Affleck can gently remind you every six hours on Android.</p>
          </div>
        </div>

        <div className="task-history-card">
          <div className="section-heading compact"><div><p className="eyebrow">Your rhythm</p><h2>Daily history</h2></div><span className="section-count">{history.length} days</span></div>
          {history.length === 0 ? <p className="muted">Complete a checklist to begin your streak history.</p> : <div className="task-history-list">{history.map((day) => <div className="task-history-row" key={day.date}><div><strong>{formatHistoryDay(day.date)}</strong><span>{day.completed}/{day.total} tasks complete</span></div><b className={day.complete ? "history-complete" : ""}>{day.complete ? "Complete" : "In progress"}</b></div>)}</div>}
        </div>
      </div>
    </section>
  );
}
