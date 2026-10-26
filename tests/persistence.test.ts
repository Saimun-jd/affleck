import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fixture, imported } from "./fixtures";

const native = vi.hoisted(() => ({
  load: vi.fn(), invoke: vi.fn(), cancel: vi.fn(), permission: vi.fn(), request: vi.fn(), channel: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: native.load } }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: native.invoke }));
vi.mock("@tauri-apps/plugin-notification", async (original) => ({
  ...await original<typeof import("@tauri-apps/plugin-notification")>(),
  cancel: native.cancel, isPermissionGranted: native.permission, requestPermission: native.request, createChannel: native.channel,
}));

// Load the host's SQLite rather than bundling a Node built-in into the DOM environment.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  sqlite = new DatabaseSync(":memory:");
  native.load.mockResolvedValue({
    // SQLx binds $1 by index; node:sqlite exposes the same placeholders as named bindings.
    execute: async (query: string, args: never[] = []) => sqlite.prepare(query).run(Object.fromEntries(args.map((arg, i) => [`$${i + 1}`, arg]))),
    select: async (query: string, args: never[] = []) => sqlite.prepare(query).all(Object.fromEntries(args.map((arg, i) => [`$${i + 1}`, arg]))),
  });
  native.invoke.mockResolvedValue(undefined);
  native.cancel.mockResolvedValue(undefined);
  native.permission.mockResolvedValue(true);
  native.request.mockResolvedValue("denied");
  native.channel.mockResolvedValue(undefined);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
});
afterEach(() => { sqlite.close(); vi.restoreAllMocks(); });

it("recovers legacy fallback records once, preserving notes, status and reminders", async () => {
  const old = fixture();
  localStorage.setItem("affleck.local.v1", JSON.stringify(old));
  const db = await import("../src/lib/db");
  const [first, second] = await Promise.all([db.loadSnapshot(), db.loadSnapshot()]);
  expect(first).toEqual(second);
  expect(native.load).toHaveBeenCalledTimes(1);
  expect(first.playlists).toHaveLength(2);
  expect(first.notes).toEqual(old.notes);
  expect(first.reminders).toEqual(old.reminders);
  await db.saveNote("v1", "New note");
  await db.saveNote("v1", "Edited note");
  await db.updateVideoStatus("v1", "complete");
  await db.deleteNote("v2");
  // A new app session must not resurrect the deleted legacy note.
  vi.resetModules();
  const reopened = await (await import("../src/lib/db")).loadSnapshot();
  expect(reopened.notes.map((n) => [n.videoId, n.body])).toEqual([["v1", "Edited note"]]);
  expect(reopened.videos.find((v) => v.id === "v1")?.status).toBe("complete");
  expect(localStorage.getItem("affleck.local.v1")).toBe(JSON.stringify(old));
});

it("imports to real SQLite and lists it after reopening", async () => {
  const db = await import("../src/lib/db");
  await db.createPlaylist(imported);
  vi.resetModules();
  const data = await (await import("../src/lib/db")).loadSnapshot();
  expect(data.playlists.map((p) => p.title)).toEqual([imported.title]);
  expect(data.videos).toHaveLength(1);
  expect(data.videos[0].playlistId).toBe(data.playlists[0].id);
});

it("stores grouped reading items, progress, literature review, and notes in SQLite", async () => {
  const db = await import("../src/lib/db");
  const groupId = await db.createGroup("Thesis reading");
  const resourceId = await db.createResource({
    kind: "paper",
    title: "A useful paper",
    sourceUrl: "https://example.com/paper",
    author: "Test Author",
    groupId,
    literatureReview: "This paper gives the baseline method.",
  });
  await db.updateResourceProgress(resourceId, "review", 42, 12);
  await db.saveResourceNote(resourceId, "Check the limitations section again.");
  const snapshot = await db.loadSnapshot();
  expect(snapshot.groups?.[0].name).toBe("Thesis reading");
  expect(snapshot.resources?.[0]).toMatchObject({ id: resourceId, groupId, progress: 42, currentPage: 12, status: "review", literatureReview: "This paper gives the baseline method." });
  expect(snapshot.resourceNotes?.[0]).toMatchObject({ resourceId, body: "Check the limitations section again." });
});

it("does not silently switch to localStorage on SQLite failure", async () => {
  native.load.mockRejectedValueOnce(new Error("write permission denied"));
  const db = await import("../src/lib/db");
  await expect(db.loadSnapshot()).rejects.toThrow("write permission denied");
  expect(localStorage.length).toBe(0);
  await expect(db.loadSnapshot()).resolves.toEqual({ playlists: [], videos: [], notes: [], reminders: [] });
});

it("reuses normalized group names and preserves membership and file references after reopening SQLite", async () => {
  const db = await import("../src/lib/db");
  const [first, second] = await Promise.all([db.createGroup("Thesis reading"), db.createGroup("  THESIS   READING ")]);
  expect(first).toBe(second);
  const id = await db.createResource({ kind: "pdf", title: "Study PDF", fileName: "old.pdf", fileUrl: "blob:old", totalPages: 100 });
  await db.updateResourceProgress(id, "review", 40, 40);
  await db.saveResourceNote(id, "Keep this note");
  await db.assignGroup({ kind: "resource", id, title: "Study PDF" }, { name: "thesis reading" });
  await db.updateResourceFile(id, "new.pdf", "content://documents/persisted");
  await db.createPlaylist(imported);
  const playlist = (await db.loadSnapshot()).playlists[0];
  await db.assignGroup({ kind: "playlist", id: playlist.id, title: playlist.title }, { groupId: first });
  vi.resetModules();
  const reopened = await import("../src/lib/db");
  const saved = await reopened.loadSnapshot();
  expect(saved.groups).toHaveLength(1);
  expect(saved.resources![0]).toMatchObject({ id, groupId: first, fileName: "new.pdf", fileUrl: "content://documents/persisted", progress: 40, currentPage: 40, status: "review" });
  expect(saved.resourceNotes![0].body).toBe("Keep this note");
  expect(saved.playlists[0].groupId).toBe(first);
  await reopened.assignGroup({ kind: "resource", id, title: "Study PDF" }, { groupId: null });
  expect((await reopened.loadSnapshot()).resources![0].groupId).toBeNull();
  await expect(reopened.assignGroup({ kind: "resource", id, title: "Study PDF" }, { groupId: "missing" })).rejects.toThrow("no longer exists");
});

it("adds playlist group membership to an older database without altering its records", async () => {
  sqlite.exec("CREATE TABLE playlists (id TEXT PRIMARY KEY, title TEXT NOT NULL, channel TEXT, description TEXT, youtube_url TEXT, created_at TEXT)");
  sqlite.exec("INSERT INTO playlists VALUES ('existing', 'Existing course', '', '', 'https://youtube.com/playlist?list=PLtest', '2026-01-01')");
  const db = await import("../src/lib/db");
  const data = await db.loadSnapshot();
  expect(data.playlists[0]).toMatchObject({ id: "existing", title: "Existing course", groupId: null });
  const groupId = await db.createGroup("Courses");
  await db.assignGroup({ kind: "playlist", id: "existing", title: "Existing course" }, { groupId });
  expect((await db.loadSnapshot()).playlists[0].groupId).toBe(groupId);
});

it("schedules distinct playlist IDs and edits/pauses only the selected alarm", async () => {
  const old = fixture();
  localStorage.setItem("affleck.local.v1", JSON.stringify(old));
  const db = await import("../src/lib/db");
  const first = old.reminders[0];
  await expect(db.saveReminder(first)).resolves.toBeNull();
  await expect(db.saveReminder({ ...first, playlistId: "p2", hour: 21 })).resolves.toBeNull();
  let saved = (await db.loadSnapshot()).reminders;
  expect(saved).toHaveLength(2);
  const second = saved.find((r) => r.playlistId === "p2")!;
  expect(second.id).not.toBe(first.id);
  expect(second.notificationId).not.toBe(first.notificationId);
  expect(native.invoke).toHaveBeenLastCalledWith("plugin:notification|notify", expect.objectContaining({
    options: expect.objectContaining({ id: second.notificationId, body: "Time to continue Second course." }),
  }));
  native.invoke.mockClear();
  native.cancel.mockClear();
  await db.saveReminder({ ...first, enabled: false });
  expect(native.cancel).toHaveBeenCalledExactlyOnceWith([42]);
  expect(native.invoke).not.toHaveBeenCalled();
  saved = (await db.loadSnapshot()).reminders;
  expect(saved.find((r) => r.playlistId === "p2")).toEqual(second);
  await db.saveReminder({ ...second, minute: 55 });
  expect(native.cancel).toHaveBeenLastCalledWith([second.notificationId]);
  expect((await db.loadSnapshot()).reminders).toHaveLength(2);
});

it("reports denied permissions and scheduling failures instead of claiming success", async () => {
  const old = fixture();
  localStorage.setItem("affleck.local.v1", JSON.stringify(old));
  const db = await import("../src/lib/db");
  native.permission.mockResolvedValue(false);
  await expect(db.saveReminder(old.reminders[0])).resolves.toContain("notifications are blocked");
  expect(native.invoke).not.toHaveBeenCalled();
  native.permission.mockResolvedValue(true);
  native.invoke.mockRejectedValueOnce(new Error("Alarm failed"));
  await expect(db.saveReminder(old.reminders[0])).resolves.toContain("could not update");
  await expect(db.saveReminder({ ...old.reminders[0], hour: NaN })).rejects.toThrow("valid time");
});

it("stores custom reminder days and removes every scheduled notification", async () => {
  const old = fixture();
  localStorage.setItem("affleck.local.v1", JSON.stringify(old));
  const db = await import("../src/lib/db");
  await db.saveReminder({ ...old.reminders[0], cadence: "custom", weekdays: [2, 4], hour: 20, minute: 5 });
  const saved = (await db.loadSnapshot()).reminders.find((item) => item.playlistId === "p1")!;
  expect(saved).toMatchObject({ cadence: "custom", weekdays: [2, 4], hour: 20, minute: 5 });
  expect(native.invoke).toHaveBeenCalledTimes(2);
  await db.deleteReminder({ playlistId: "p1", resourceId: null });
  expect((await db.loadSnapshot()).reminders.some((item) => item.playlistId === "p1")).toBe(false);
  expect(native.cancel).toHaveBeenCalledWith(expect.arrayContaining([42]));
});
