import { useState } from "react";
import type { LearningResource, ResourceStatus } from "../types";
import { useLongPress } from "./useLongPress";

const statuses: Array<{ value: ResourceStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "review", label: "Review" },
];

function kindLabel(kind: LearningResource["kind"]): string {
  return kind === "pdf" ? "PDF" : kind === "paper" ? "Research paper" : "Blog";
}

export function ResourceCard({ resource, groupName, hasNote, onOpen, onNote, onStatus, onGroup, onDelete }: {
  resource: LearningResource;
  groupName?: string;
  hasNote: boolean;
  onOpen: () => void;
  onNote: () => void;
  onStatus: (status: ResourceStatus) => Promise<void>;
  onGroup: () => void;
  onDelete?: () => void;
}) {
  const press = useLongPress(onOpen, onGroup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changeStatus(status: ResourceStatus) {
    setBusy(true); setError("");
    try { await onStatus(status); }
    catch (cause) { setError(`Could not save status: ${String(cause)}`); }
    finally { setBusy(false); }
  }
  return (
    <article className="resource-card" aria-label={resource.title}>
      <button className="resource-open hold-target" {...press} aria-label={`Open ${resource.title}`}>
        <span className={`resource-icon ${resource.kind}`}>{resource.kind === "pdf" ? "▧" : resource.kind === "paper" ? "⌁" : "↗"}</span>
        <span className="resource-copy"><span className="resource-kind">{kindLabel(resource.kind)}{groupName ? ` · ${groupName}` : ""}</span><strong>{resource.title}</strong><span>{resource.author || resource.fileName || resource.sourceUrl || "Learning item"}</span></span>
        <span className="resource-progress"><b>{resource.progress}%</b><span className="progress-track"><span style={{ width: `${resource.progress}%` }} /></span></span>
      </button>
      <div className="resource-controls">
        <div className="status-control" role="group" aria-label={`Learning status for ${resource.title}`}>
          {statuses.map(({ value, label }) => <button key={value} type="button" className={`status-choice ${value}`} disabled={busy} aria-pressed={resource.status === value} onClick={() => void changeStatus(value)}>{resource.status === value && <span aria-hidden="true">✓ </span>}{label}</button>)}
        </div>
        <button className="outline-button" onClick={onNote}>{hasNote ? "Edit note" : "Add note"}</button>
        <button className="outline-button" onClick={onGroup}>Move to group</button>
        <button className="outline-button danger" onClick={() => onDelete?.()}>Remove resource</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  );
}
