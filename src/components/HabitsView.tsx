import { useState } from "react";
import type { LearningResource, PlaylistSummary, Reminder } from "../types";
import { EditorDialog } from "./EditorDialog";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function repeatSummary(reminder?: Reminder): string {
  if (!reminder) return "No reminder yet";
  const repeat = reminder.cadence === "daily"
    ? "Every day"
    : reminder.cadence === "weekly"
      ? `Every ${days[reminder.weekday - 1]}`
      : reminder.cadence === "monthly"
        ? `Monthly on the ${reminder.dayOfMonth ?? 1}${ordinal(reminder.dayOfMonth ?? 1)}`
        : (reminder.weekdays ?? [reminder.weekday]).map((day) => days[day - 1].slice(0, 3)).join(", ");
  return `${reminder.enabled ? "On" : "Paused"} · ${repeat} at ${formatTime(reminder.hour, reminder.minute)}`;
}

function ordinal(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) return "th";
  return value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
}

export function HabitsView({ summaries, resources, reminders, onSaveReminder, onDeleteReminder }: {
  summaries: PlaylistSummary[];
  resources: LearningResource[];
  reminders: Reminder[];
  onSaveReminder: (reminder: Reminder) => Promise<string | null>;
  onDeleteReminder: (target: { playlistId: string | null; resourceId?: string | null }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<{ playlistId: string | null; resourceId: string | null; title: string } | null>(null);
  const targets = [
    { playlistId: null, resourceId: null, title: "All learning" },
    ...summaries.map(({ id, title }) => ({ playlistId: id, resourceId: null, title })),
    ...resources.map(({ id, title }) => ({ playlistId: null, resourceId: id, title })),
  ];
  return (
    <section className="page-stack">
      <div className="intro-block"><p className="eyebrow">A little consistency</p><h1>Reminders</h1>
        <p className="lede">Type the time you mean, choose how often it repeats, and remove a reminder whenever you no longer need it.</p></div>
      <div className="reminder-list">
        {targets.map((target) => {
          const reminder = reminders.find((item) => item.playlistId === target.playlistId && (item.resourceId ?? null) === target.resourceId);
          return <article className="reminder-entry" key={target.resourceId ?? target.playlistId ?? "all"} aria-label={`Reminder for ${target.title}`}>
            <div><h2>{target.title}</h2><p>{repeatSummary(reminder)}</p>
              {target.playlistId === null && target.resourceId === null && <p className="form-hint">Optional general reminder; independent of your learning items.</p>}</div>
            <button className="outline-button" onClick={() => setSelected(target)}>{reminder ? "Edit reminder" : "Set reminder"}</button>
          </article>;
        })}
      </div>
      {summaries.length === 0 && resources.length === 0 && <p className="muted">Add a learning item in Library to give it its own reminder.</p>}
      {selected && <ReminderEditor
        key={selected.resourceId ?? selected.playlistId ?? "all"}
        title={selected.title}
        reminder={reminders.find((item) => item.playlistId === selected.playlistId && (item.resourceId ?? null) === selected.resourceId) ?? {
          id: `reminder:${selected.resourceId ?? selected.playlistId ?? "all"}`,
          playlistId: selected.playlistId,
          resourceId: selected.resourceId,
          cadence: "daily",
          weekday: 2,
          hour: 19,
          minute: 30,
          enabled: true,
          notificationId: null,
        }}
        canDelete={Boolean(reminders.find((item) => item.playlistId === selected.playlistId && (item.resourceId ?? null) === selected.resourceId))}
        onSave={onSaveReminder}
        onDelete={async () => { await onDeleteReminder(selected); setSelected(null); }}
        onClose={() => setSelected(null)}
      />}
    </section>
  );
}

function ReminderEditor({ title, reminder, canDelete, onSave, onDelete, onClose }: {
  title: string;
  reminder: Reminder;
  canDelete: boolean;
  onSave: (reminder: Reminder) => Promise<string | null>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const initialHour = reminder.hour % 12 || 12;
  const [hourText, setHourText] = useState(String(initialHour));
  const [minuteText, setMinuteText] = useState(String(reminder.minute).padStart(2, "0"));
  const [meridiem, setMeridiem] = useState(reminder.hour >= 12 ? "PM" : "AM");
  const [draft, setDraft] = useState<Reminder>({ ...reminder, weekdays: reminder.weekdays ?? [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [discard, setDiscard] = useState(false);
  const [saved, setSaved] = useState(reminder);

  function close() {
    if (busy) return;
    if (JSON.stringify(draft) !== JSON.stringify(saved) || hourText !== String(initialHour) || minuteText !== String(reminder.minute).padStart(2, "0") || meridiem !== (reminder.hour >= 12 ? "PM" : "AM")) setDiscard(true);
    else onClose();
  }

  function toggleDay(day: number) {
    const current = draft.weekdays ?? [];
    setDraft({ ...draft, weekdays: current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((left, right) => left - right) });
  }

  async function save() {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setError("Enter an hour from 1 to 12 and minutes from 00 to 59.");
      return;
    }
    const hour24 = (hour % 12) + (meridiem === "PM" ? 12 : 0);
    const next = { ...draft, hour: hour24, minute, weekdays: draft.cadence === "custom" ? draft.weekdays : undefined };
    setBusy(true); setError(""); setWarning("");
    try {
      const message = await onSave(next);
      setSaved(next);
      if (message) setWarning(message);
      else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <EditorDialog title={`Reminder for ${title}`} onClose={close}>
    <form className="editor-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <header className="modal-header"><div><p className="eyebrow">Learning reminder</p><h2>{title}</h2></div>
        <button type="button" className="outline-button" disabled={busy} onClick={close}>Close</button></header>
      <fieldset disabled={busy} className="reminder-fields">
        <label className="switch-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Reminder enabled</label>
        <div className="form-row reminder-time-row">
          <label className="form-label">Hour (1–12)<input aria-label="Reminder hour" inputMode="numeric" pattern="[0-9]*" value={hourText} onChange={(event) => setHourText(event.target.value)} placeholder="8" /></label>
          <label className="form-label">Minute<input aria-label="Reminder minute" inputMode="numeric" pattern="[0-9]*" value={minuteText} onChange={(event) => setMinuteText(event.target.value)} placeholder="15" /></label>
          <label className="form-label">AM or PM<select aria-label="AM or PM" value={meridiem} onChange={(event) => setMeridiem(event.target.value)}><option>AM</option><option>PM</option></select></label>
        </div>
        <label className="form-label">Repeat<select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as Reminder["cadence"] })}>
          <option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="custom">Choose days</option>
        </select></label>
        {draft.cadence === "weekly" && <label className="form-label">Day<select value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}>{days.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>}
        {draft.cadence === "monthly" && <label className="form-label">Day of month<input type="number" min="1" max="31" value={draft.dayOfMonth ?? 1} onChange={(event) => setDraft({ ...draft, dayOfMonth: Number(event.target.value) })} /></label>}
        {draft.cadence === "custom" && <fieldset className="weekday-picker"><legend>Repeat on</legend>{days.map((day, index) => <label key={day} className="weekday-choice"><input type="checkbox" checked={(draft.weekdays ?? []).includes(index + 1)} onChange={() => toggleDay(index + 1)} />{day}</label>)}</fieldset>}
      </fieldset>
      <p className="form-hint">Uses your phone's local time. Choose days creates one notification for each selected weekday.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {warning && <p className="confirmation" role="status">{warning}</p>}
      {discard ? <div className="confirmation" role="alert"><p>Discard your unsaved changes?</p><div className="editor-actions"><button type="button" className="outline-button" onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className="outline-button danger" onClick={onClose}>Discard changes</button></div></div>
        : <div className="editor-actions">{canDelete && <button type="button" className="outline-button danger" disabled={busy} onClick={() => { if (window.confirm("Remove this reminder?")) void onDelete(); }}>Remove reminder</button>}<button className="primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save reminder"}</button></div>}
    </form>
  </EditorDialog>;
}
