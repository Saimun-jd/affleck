import { useState } from "react";
import { browserPdf, isAndroidApp, pickPdf, type PdfReference } from "../lib/documents";

export function PdfAttachment({ label = "Choose PDF", fileName, disabled = false, onChoose }: {
  label?: string;
  fileName?: string;
  disabled?: boolean;
  onChoose: (reference: PdfReference) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(file?: File) {
    setBusy(true); setError("");
    try {
      const reference = file ? browserPdf(file) : await pickPdf();
      if (reference) await onChoose(reference);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <div className="pdf-attachment">
    {isAndroidApp() ? <button type="button" className="outline-button" disabled={disabled || busy} onClick={() => void choose()}>{busy ? "Opening…" : label}</button>
      : <label className="form-label">{label}<input type="file" accept="application/pdf,.pdf" disabled={disabled || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void choose(file); event.target.value = ""; }} /></label>}
    {fileName && <p className="muted">{fileName}</p>}
    {!isAndroidApp() && <p className="form-hint">Browser preview: reselect the file after a restart. Android keeps a permission-based reference without copying the PDF.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
