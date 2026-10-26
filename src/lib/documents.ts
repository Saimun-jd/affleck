import { invoke, isTauri } from "@tauri-apps/api/core";

export interface PdfReference { name: string; uri: string }
const sessionFiles = new Set<string>();

export function isAndroidApp(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent);
}

export function browserPdf(file: File): PdfReference {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
  const uri = URL.createObjectURL(file);
  sessionFiles.add(uri);
  return { name: file.name, uri };
}

export async function pickPdf(): Promise<PdfReference | null> {
  return invoke<PdfReference | null>("pick_pdf");
}

export async function openPdf(uri: string): Promise<void> {
  if (isAndroidApp()) {
    if (!uri.startsWith("content://")) throw new Error("This older attachment needs to be linked again. Choose Reattach PDF below; your progress and notes will stay.");
    await invoke("open_pdf", { uri });
    return;
  }
  if (!sessionFiles.has(uri)) throw new Error("Reattach the PDF to open it in this browser session. Your progress and notes are safe.");
  const opened = window.open(uri, "_blank");
  if (!opened) throw new Error("Allow pop-ups for this app, then try opening the PDF again.");
  opened.opener = null;
}
