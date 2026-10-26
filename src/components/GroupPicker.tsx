import { useState } from "react";
import type { LearningGroup } from "../types";
import { matchingGroups, normalizeGroupName, type GroupTarget } from "../lib/groups";
import { EditorDialog } from "./EditorDialog";

export function GroupPicker({ target, groups, onAssign, onClose }: {
  target: GroupTarget;
  groups: LearningGroup[];
  onAssign: (selection: { groupId: string | null } | { name: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = matchingGroups(groups, query);
  const exact = groups.find((group) => normalizeGroupName(group.name) === normalizeGroupName(query));
  async function assign(selection: { groupId: string | null } | { name: string }) {
    if (busy) return;
    setBusy(true); setError("");
    try { await onAssign(selection); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <EditorDialog title={`Move ${target.title} to a group`} onClose={() => { if (!busy) onClose(); }}>
    <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (query.trim()) void assign(exact ? { groupId: exact.id } : { name: query }); }}>
      <header className="modal-header"><div><p className="eyebrow">Organize your shelf</p><h2>Move to group</h2></div><button type="button" className="outline-button" disabled={busy} onClick={onClose}>Close</button></header>
      <p className="note-video-title">{target.title}</p>
      <label className="form-label">Find or create a group<input autoFocus value={query} maxLength={120} disabled={busy} placeholder="e.g. Thesis reading" onChange={(event) => setQuery(event.target.value)} /></label>
      <p className="form-hint">Choose an existing group below, or type a new name to create one.</p>
      <div className="group-options">
        {matches.map((group) => <button type="button" className="group-option" disabled={busy} key={group.id} onClick={() => void assign({ groupId: group.id })}>
          <span>{group.name}</span>{" "}<span>{group.id === target.groupId ? "Current group" : "Use group →"}</span>
        </button>)}
        {!matches.length && <p className="muted">No matching groups yet.</p>}
      </div>
      {query.trim() && <button type="submit" className="primary-button" disabled={busy}>{exact ? `Use “${exact.name}”` : `Create “${query.trim()}” and move`}</button>}
      {target.groupId && <button type="button" className="outline-button" disabled={busy} onClick={() => void assign({ groupId: null })}>Remove from group</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </EditorDialog>;
}
