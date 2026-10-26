import { useState } from "react";
import type { Video, VideoStatus } from "../types";

const statuses: Array<{ value: VideoStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "review", label: "Review" },
];

export function VideoCard({ video, hasNote, onWatch, onNote, onStatus, onDelete }: {
  video: Video;
  hasNote: boolean;
  onWatch: () => void;
  onNote: () => void;
  onStatus: (status: VideoStatus) => Promise<void>;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changeStatus(status: VideoStatus) {
    setBusy(true);
    setError("");
    try { await onStatus(status); }
    catch (cause) { setError(`Could not save status: ${String(cause)}`); }
    finally { setBusy(false); }
  }
  return (
    <article className="video-card" aria-label={video.title}>
      <button className="video-watch" onClick={onWatch} aria-label={`Watch ${video.title} on YouTube`}>
        <span className="video-position">{String(video.position).padStart(2, "0")}</span>
        <span className="video-copy"><strong>{video.title}</strong><span>{video.duration || "YouTube video"} · Watch on YouTube ↗</span></span>
      </button>
      <div className="video-controls">
        <div className="status-control" role="group" aria-label={`Learning status for ${video.title}`}>
          {statuses.map(({ value, label }) => <button key={value} type="button"
            className={`status-choice ${value}`} aria-pressed={video.status === value} disabled={busy}
            onClick={() => void changeStatus(value)}>{video.status === value && <span aria-hidden="true">✓ </span>}{label}</button>)}
        </div>
        <button className="outline-button" onClick={onNote}>{hasNote ? "Edit note" : "Add note"}</button>
        <button className="outline-button danger" onClick={onDelete}>Remove chapter</button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </article>
  );
}
