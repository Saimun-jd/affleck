import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../src/App";
import { fixture, imported } from "./fixtures";
import { loadSnapshot } from "../src/lib/db";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("../src/lib/youtube", () => ({ importYoutubePlaylist: vi.fn(async () => imported) }));
const watch = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: watch }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("affleck.local.v1", JSON.stringify(fixture()));
  watch.mockClear();
});

async function openCourse() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /First course/ }));
  return screen.getByRole("article", { name: "First video" });
}

describe("video learning controls", () => {
  it("adds an individual YouTube chapter and removes it without changing other chapters", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /First course/ }));
    fireEvent.click(screen.getByRole("button", { name: "＋ Add chapter" }));
    fireEvent.change(screen.getByLabelText("YouTube video URL"), { target: { value: "https://www.youtube.com/watch?v=added" } });
    fireEvent.change(screen.getByLabelText("Chapter title (optional)"), { target: { value: "Added chapter" } });
    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    await screen.findByText("Chapter added to the playlist.");
    expect((await loadSnapshot()).videos).toHaveLength(3);
    const added = screen.getByRole("article", { name: "Added chapter" });
    vi.stubGlobal("confirm", () => true);
    fireEvent.click(within(added).getByRole("button", { name: "Remove chapter" }));
    await screen.findByText("Chapter removed.");
    expect((await loadSnapshot()).videos).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("shows labelled, selected statuses and changes progress without opening YouTube", async () => {
    const video = await openCourse();
    expect(within(video).getByRole("button", { name: /Pending/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(video).getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByText("50%")).toBeTruthy());
    expect((await loadSnapshot()).videos[0].status).toBe("complete");
    fireEvent.click(within(video).getByRole("button", { name: "Review" }));
    await waitFor(() => expect(within(video).getByRole("button", { name: /Review/ }).getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(within(video).getByRole("button", { name: "Pending" }));
    await waitFor(() => expect(within(video).getByRole("button", { name: /Pending/ }).getAttribute("aria-pressed")).toBe("true"));
    expect(watch).not.toHaveBeenCalled();
    fireEvent.click(within(video).getByRole("button", { name: /Watch First video/ }));
    expect(watch).toHaveBeenCalledTimes(1);
  });

  it("creates, reopens, edits and deletes only the chosen video's note", async () => {
    const video = await openCourse();
    fireEvent.click(within(video).getByRole("button", { name: "Add note" }));
    expect(screen.getByRole("dialog", { name: "Note for First video" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Recall question\nMy answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(video).getByRole("button", { name: "Edit note" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Recall question\nMy answer");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Revised answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(video).getByRole("button", { name: "Edit note" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Revised answer");
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect((await loadSnapshot()).notes).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await loadSnapshot()).notes).toEqual(fixture().notes);
    expect(within(video).getByRole("button", { name: "Add note" })).toBeTruthy();
    expect(watch).not.toHaveBeenCalled();
  });

  it("guards unsaved text and opens the same editor from Notes", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Notes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    expect(screen.getByRole("dialog", { name: "Note for Second video" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved text" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Unsaved text");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((await loadSnapshot()).notes).toEqual(fixture().notes);
  });
});

it("lists a newly imported playlist and keeps each reminder independent", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Add resources/ }));
  fireEvent.change(screen.getByLabelText("YouTube playlist URL"), { target: { value: imported.youtubeUrl } });
  fireEvent.click(screen.getByRole("button", { name: "Import playlist" }));
  await screen.findByText("Playlist added to your library.");
  fireEvent.click(screen.getByRole("button", { name: /Habits/ }));
  const entry = await screen.findByRole("article", { name: "Reminder for Newly imported course" });
  fireEvent.click(within(entry).getByRole("button", { name: "Set reminder" }));
   fireEvent.change(screen.getByLabelText("Reminder hour"), { target: { value: "9" } });
   fireEvent.change(screen.getByLabelText("Reminder minute"), { target: { value: "45" } });
   fireEvent.change(screen.getByLabelText("AM or PM"), { target: { value: "PM" } });
  fireEvent.click(screen.getByRole("button", { name: "Save reminder" }));
  await screen.findByText(/Preference saved. Scheduled notifications/);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
   expect(within(entry).getByText("On · Every day at 9:45 PM")).toBeTruthy();
   const first = screen.getByRole("article", { name: "Reminder for First course" });
   expect(within(first).getByText("On · Every Thursday at 8:15 AM")).toBeTruthy();
  fireEvent.click(within(first).getByRole("button", { name: "Edit reminder" }));
  expect((screen.getByLabelText("Day") as HTMLSelectElement).value).toBe("5");
  fireEvent.click(screen.getByRole("checkbox", { name: "Reminder enabled" }));
  fireEvent.click(screen.getByRole("button", { name: "Save reminder" }));
  await screen.findByText(/Preference saved. Scheduled notifications/);
  const saved = (await loadSnapshot()).reminders;
  expect(saved.find((r) => r.playlistId === "p1")?.enabled).toBe(false);
  expect(saved.find((r) => r.playlistId !== "p1")?.hour).toBe(21);
  expect(new Set(saved.map((r) => r.notificationId)).size).toBe(2);
});

it("returns to Today on Android back from another section and allows exit from Today", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Notes/ }));
  expect(screen.getByRole("heading", { name: "Notes" })).toBeTruthy();
  const back = (window as Window & { onAndroidBackPressed?: () => boolean }).onAndroidBackPressed;
  expect(back).toBeTypeOf("function");
  expect(back?.()).toBe(false);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Keep the thread alive." })).toBeTruthy());
  expect((window as Window & { onAndroidBackPressed?: () => boolean }).onAndroidBackPressed?.()).toBe(true);
});
