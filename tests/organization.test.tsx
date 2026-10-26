import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../src/App";
import { ResourceCard } from "../src/components/ResourceCard";
import { createGroup, createResource, loadSnapshot, saveResourceNote } from "../src/lib/db";
import { fixture } from "./fixtures";
import type { LearningResource } from "../src/types";

const pdf = vi.hoisted(() => ({ pick: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("../src/lib/documents", () => ({ isAndroidApp: () => true, pickPdf: pdf.pick, openPdf: pdf.open, browserPdf: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("affleck.local.v1", JSON.stringify(fixture()));
  vi.clearAllMocks();
  pdf.pick.mockResolvedValue({ name: "Reading.pdf", uri: "content://documents/reading" });
  pdf.open.mockResolvedValue(undefined);
});

async function library() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Library/ }));
}

describe("group containers", () => {
  it("removes a group without deleting its members", async () => {
    const groupId = await createGroup("Temporary group");
    const resourceId = await createResource({ kind: "blog", title: "Keep this item", sourceUrl: "https://example.com" , groupId });
    await library();
    fireEvent.click(screen.getByRole("button", { name: "Open group Temporary group" }));
    vi.stubGlobal("confirm", () => true);
    fireEvent.click(screen.getByRole("button", { name: "Remove group" }));
    await screen.findByText("Group removed; its items are now ungrouped.");
    const saved = await loadSnapshot();
    expect(saved.groups).toEqual([]);
    expect(saved.resources?.find((item) => item.id === resourceId)?.groupId).toBeNull();
    vi.unstubAllGlobals();
  });

  it("removes a resource and its resource-specific note", async () => {
    const resourceId = await createResource({ kind: "blog", title: "Delete me", sourceUrl: "https://example.com" });
    await saveResourceNote(resourceId, "temporary note");
    await library();
    vi.stubGlobal("confirm", () => true);
    fireEvent.click(within(screen.getByRole("article", { name: "Delete me" })).getByRole("button", { name: "Remove resource" }));
    await screen.findByText("Resource removed.");
    const saved = await loadSnapshot();
    expect(saved.resources?.some((item) => item.id === resourceId)).toBe(false);
    expect(saved.resourceNotes?.some((note) => note.resourceId === resourceId)).toBe(false);
    vi.unstubAllGlobals();
  });

  it("shows grouped items only inside their group, including search and the return from detail", async () => {
    const groupId = await createGroup("Research desk");
    await createResource({ kind: "paper", title: "Grouped paper", groupId });
    await createResource({ kind: "blog", title: "Loose blog", sourceUrl: "https://example.com/blog" });
    await library();
    expect(screen.queryByRole("article", { name: "Grouped paper" })).toBeNull();
    expect(screen.getByRole("article", { name: "Loose blog" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search your learning shelf"), { target: { value: "Grouped paper" } });
    expect(screen.queryByRole("article", { name: "Grouped paper" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open group Research desk" }));
    expect(screen.getByRole("article", { name: "Grouped paper" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Loose blog" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Grouped paper" }));
    fireEvent.click(screen.getByRole("button", { name: "← Back to library" }));
    expect(screen.getByRole("heading", { name: "Research desk" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← All library" }));
    expect(screen.queryByRole("article", { name: "Grouped paper" })).toBeNull();
  });

  it("creates a group from a resource, reuses matching names, suggests similar ones, and removes membership", async () => {
    const id = await createResource({ kind: "paper", title: "My paper" });
    await library();
    fireEvent.click(within(screen.getByRole("article", { name: "My paper" })).getByRole("button", { name: "Move to group" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Find or create a group"));
    fireEvent.change(screen.getByLabelText("Find or create a group"), { target: { value: "Thesis reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Create “Thesis reading” and move" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("article", { name: "My paper" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open group Thesis reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to group" }));
    fireEvent.change(screen.getByLabelText("Find or create a group"), { target: { value: "thesis" } });
    expect(screen.getByRole("button", { name: /Thesis reading Current group/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find or create a group"), { target: { value: "  THESIS   reading  " } });
    expect(screen.queryByRole("button", { name: /Create .* and move/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use “Thesis reading”" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await loadSnapshot()).groups).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Move to group" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from group" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("This group is empty")).toBeTruthy();
    expect((await loadSnapshot()).resources?.find((r) => r.id === id)?.groupId).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "← All library" }));
    expect(screen.getByRole("article", { name: "My paper" })).toBeTruthy();
  });

  it("supports playlist grouping and opens notes directly without navigating to detail", async () => {
    const resourceId = await createResource({ kind: "paper", title: "Annotated paper" });
    await saveResourceNote(resourceId, "Saved thought");
    await library();
    fireEvent.contextMenu(screen.getByRole("button", { name: /First course/ }));
    fireEvent.change(screen.getByLabelText("Find or create a group"), { target: { value: "Courses" } });
    fireEvent.click(screen.getByRole("button", { name: "Create “Courses” and move" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: /First course/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Open group Courses" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    expect(screen.getByRole("dialog", { name: "Note for Annotated paper" })).toBeTruthy();
    expect((screen.getByLabelText("What do you want to remember?") as HTMLTextAreaElement).value).toBe("Saved thought");
  });
});

describe("PDF attachment flow", () => {
  it("uses the Android picker, saves only its reference, and requests the PDF opener", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Add resources/ }));
    expect(screen.queryByRole("tab", { name: "Group" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose PDF" }));
    await waitFor(() => expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Reading"));
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    const open = await screen.findByRole("button", { name: "Open Reading" });
    const saved = (await loadSnapshot()).resources![0];
    expect(saved).toMatchObject({ fileName: "Reading.pdf", fileUrl: "content://documents/reading" });
    expect(JSON.stringify(saved)).not.toContain("blob:");
    fireEvent.click(open);
    fireEvent.click(screen.getByRole("button", { name: "Open PDF ↗" }));
    await waitFor(() => expect(pdf.open).toHaveBeenCalledWith("content://documents/reading"));
  });

  it("shows opener failures and reattaches old PDFs without losing study data", async () => {
    const id = await createResource({ kind: "pdf", title: "Old PDF", fileName: "Old.pdf", fileUrl: "blob:expired" });
    await saveResourceNote(id, "Keep this note");
    pdf.open.mockRejectedValueOnce(new Error("Reattach PDF to restore access."));
    await library();
    fireEvent.click(screen.getByRole("button", { name: "Open Old PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Open PDF ↗" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Reattach PDF to restore access.");
    fireEvent.click(screen.getByRole("button", { name: "Reattach PDF" }));
    await waitFor(async () => expect((await loadSnapshot()).resources![0].fileUrl).toBe("content://documents/reading"));
    expect((await loadSnapshot()).resourceNotes![0].body).toBe("Keep this note");
    fireEvent.click(screen.getByRole("button", { name: "Open PDF ↗" }));
    await waitFor(() => expect(pdf.open).toHaveBeenLastCalledWith("content://documents/reading"));
  });

  it("leaves the form unchanged when the native picker is cancelled", async () => {
    pdf.pick.mockResolvedValue(null);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Add resources/ }));
    fireEvent.click(screen.getByRole("tab", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose PDF" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose PDF" })).toBeTruthy());
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((await loadSnapshot()).resources).toHaveLength(0);
  });
});

it("opens grouping on long press, suppresses its click, and cancels holds during scroll or movement", () => {
  vi.useFakeTimers();
  // jsdom does not implement PointerEvent; MouseEvent supplies the coordinates used here.
  vi.stubGlobal("PointerEvent", MouseEvent);
  try {
    const open = vi.fn(), group = vi.fn();
    const resource: LearningResource = { id: "hold", kind: "pdf", title: "Hold me", groupId: null, fileName: "a.pdf", fileUrl: "", sourceUrl: "", author: "", description: "", progress: 0, currentPage: 0, totalPages: 0, status: "pending", literatureReview: "", createdAt: "2026-01-01" };
    const view = render(<ResourceCard resource={resource} hasNote={false} onOpen={open} onGroup={group} onNote={vi.fn()} onStatus={async () => {}} />);
    const button = screen.getByRole("button", { name: "Open Hold me" });
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(550));
    fireEvent.pointerUp(button); fireEvent.click(button);
    expect(group).toHaveBeenCalledTimes(1); expect(open).not.toHaveBeenCalled();
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(button, { clientX: 10, clientY: 50 });
    act(() => vi.advanceTimersByTime(600));
    expect(group).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(button, { button: 0 }); fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600)); expect(group).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(button, { button: 0 }); fireEvent.pointerCancel(button);
    act(() => vi.advanceTimersByTime(600)); expect(group).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(button, { button: 0 }); fireEvent.pointerUp(button); fireEvent.click(button);
    expect(open).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(button, { button: 0 }); view.unmount();
    act(() => vi.advanceTimersByTime(600)); expect(group).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});
