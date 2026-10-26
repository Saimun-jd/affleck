import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { browserPdf, openPdf, pickPdf } from "../src/lib/documents";

const native = vi.hoisted(() => ({ invoke: vi.fn(), tauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.tauri, invoke: native.invoke }));
beforeEach(() => {
  vi.clearAllMocks(); native.tauri = true;
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
});
afterEach(() => vi.restoreAllMocks());

it("requests the document picker and handles cancellation without fabricating a reference", async () => {
  native.invoke.mockResolvedValueOnce(null);
  expect(await pickPdf()).toBeNull();
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith("pick_pdf");
});

it("opens Android content references via the dedicated native command", async () => {
  native.invoke.mockResolvedValueOnce(undefined);
  await openPdf("content://documents/123");
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith("open_pdf", { uri: "content://documents/123" });
});

it("rejects legacy blob URLs on Android and propagates reader/access errors", async () => {
  await expect(openPdf("blob:old-session")).rejects.toThrow("Reattach PDF");
  expect(native.invoke).not.toHaveBeenCalled();
  native.invoke.mockRejectedValueOnce("No PDF reader is available.");
  await expect(openPdf("content://documents/123")).rejects.toBe("No PDF reader is available.");
});

it("allows session-only browser files, detects stale links, and rejects non-PDFs", async () => {
  native.tauri = false;
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:current"), configurable: true });
  const opened = { opener: {} };
  vi.spyOn(window, "open").mockReturnValue(opened as unknown as Window);
  const file = browserPdf(new File(["%PDF-1.4"], "Test.pdf", { type: "application/pdf" }));
  await openPdf(file.uri);
  expect(window.open).toHaveBeenCalledWith("blob:current", "_blank");
  expect(opened.opener).toBeNull();
  await expect(openPdf("blob:stale")).rejects.toThrow("Reattach");
  expect(() => browserPdf(new File(["text"], "Test.txt", { type: "text/plain" }))).toThrow("Choose a PDF");
  expect(native.invoke).not.toHaveBeenCalled();
});
