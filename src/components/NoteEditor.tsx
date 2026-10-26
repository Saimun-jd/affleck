import { useState } from "react";
import type { Note, Video } from "../types";
import { EditorDialog } from "./EditorDialog";

export function NoteEditor({ video, note, onClose, onSave, onDelete }: {
  video: Video;
  note?: Note;
  onClose: () => void;
  onSave: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<"delete" | "discard" | null>(null);
  function close() {
    if (busy) return;
    if (body !== (note?.body ?? "")) setConfirmation("discard");
    else onClose();
  }
  async function commit(remove = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (remove) await onDelete();
      else await onSave(body.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <EditorDialog title={`Note for ${video.title}`} onClose={close}>
      <form className="editor-form" onSubmit={(event) => { event.preventDefault(); void commit(); }}>
        <header className="modal-header">
          <div><p className="eyebrow">Your video note</p><h2>{note ? "Edit note" : "Add a note"}</h2></div>
          <button type="button" className="outline-button" onClick={close} disabled={busy}>Close</button>
        </header>
        <p className="note-video-title">{video.position}. {video.title}</p>
        <label className="form-label">What do you want to remember?
          <textarea autoFocus className="note-editor-input" value={body} disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Explain the idea in your own words. Add a question to test yourself later…" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {confirmation ? (
          <div className="confirmation" role="alert">
            <p>{confirmation === "delete" ? "Delete this video's saved note? This cannot be undone." : "Discard your unsaved changes?"}</p>
            <div className="editor-actions">
              <button type="button" className="outline-button" disabled={busy} onClick={() => setConfirmation(null)}>Keep editing</button>
              <button type="button" className="outline-button danger" disabled={busy}
                onClick={() => confirmation === "delete" ? void commit(true) : onClose()}>
                {confirmation === "delete" ? "Confirm delete" : "Discard changes"}
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-actions">
            {note && <button type="button" className="outline-button danger" disabled={busy} onClick={() => setConfirmation("delete")}>Delete note</button>}
            <button type="submit" className="primary-button" disabled={busy || !body.trim()}>{busy ? "Saving…" : "Save note"}</button>
          </div>
        )}
      </form>
    </EditorDialog>
  );
}
