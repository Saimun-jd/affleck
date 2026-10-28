import Database from "@tauri-apps/plugin-sql";
import { isTauri, invoke } from "@tauri-apps/api/core";
import {
  cancel,
  createChannel,
  isPermissionGranted,
  requestPermission,
  Schedule,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizeGroupName, type GroupTarget } from "./groups";
import { requireExternalUrl } from "./urls";
import type {
  AppSnapshot,
  DailyTask,
  DailyTaskDay,
  LearningGroup,
  LearningResource,
  NewResourceInput,
  NewPlaylistInput,
  NewVideoInput,
  Note,
  Playlist,
  Reminder,
  ResourceNote,
  ResourceStatus,
  Video,
  VideoStatus,
} from "../types";

const STORAGE_KEY = "affleck.local.v1";
const DB_PATH = "sqlite:affleck.db";
const DAILY_TASK_NOTIFICATION_IDS = [710001, 710002, 710003, 710004];

let databasePromise: Promise<Database> | null = null;

const seedSnapshot: AppSnapshot = {
  playlists: [
    {
      id: "playlist-machine-learning",
      title: "Machine Learning from Scratch",
      channel: "The Learning Room",
      description: "A gentle, practical route from intuition to working models.",
      youtubeUrl: "https://www.youtube.com/playlist?list=PLaffleck-demo",
      createdAt: "2026-10-18T09:00:00.000Z",
    },
  ],
  videos: [
    {
      id: "video-01",
      playlistId: "playlist-machine-learning",
      position: 1,
      title: "A map of the machine learning landscape",
      youtubeUrl: "https://www.youtube.com/watch?v=affleck01",
      duration: "18 min",
      status: "complete",
    },
    {
      id: "video-02",
      playlistId: "playlist-machine-learning",
      position: 2,
      title: "Vectors, features, and useful representations",
      youtubeUrl: "https://www.youtube.com/watch?v=affleck02",
      duration: "24 min",
      status: "review",
    },
    {
      id: "video-03",
      playlistId: "playlist-machine-learning",
      position: 3,
      title: "Linear regression without the mystery",
      youtubeUrl: "https://www.youtube.com/watch?v=affleck03",
      duration: "31 min",
      status: "pending",
    },
    {
      id: "video-04",
      playlistId: "playlist-machine-learning",
      position: 4,
      title: "How gradient descent learns",
      youtubeUrl: "https://www.youtube.com/watch?v=affleck04",
      duration: "27 min",
      status: "pending",
    },
    {
      id: "video-05",
      playlistId: "playlist-machine-learning",
      position: 5,
      title: "Validation, overfitting, and the holdout set",
      youtubeUrl: "https://www.youtube.com/watch?v=affleck05",
      duration: "22 min",
      status: "pending",
    },
    {
      id: "video-06",
      playlistId: "playlist-machine-learning",
      position: 6,
      title: "A small project to make it stick",
      youtubeUrl: "https://www.youtube.com/watch?v=affleck06",
      duration: "38 min",
      status: "pending",
    },
  ],
  notes: [
    {
      id: "note-02",
      videoId: "video-02",
      body: "A useful mental model: features are the vocabulary we give the model before it learns the grammar.",
      updatedAt: "2026-10-21T08:30:00.000Z",
    },
  ],
  reminders: [
    {
      id: "reminder-default",
      playlistId: "playlist-machine-learning",
      cadence: "daily",
      weekday: 2,
      hour: 19,
      minute: 30,
      enabled: true,
      notificationId: null,
      resourceId: null,
    },
  ],
  groups: [],
  resources: [],
  resourceNotes: [],
  dailyTasks: [],
  dailyTaskDays: [],
};

function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AppSnapshot;
}

function readLocalSnapshot(): Required<AppSnapshot> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = cloneSnapshot(seedSnapshot) as Required<AppSnapshot>;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSnapshot>;
    return {
      playlists: parsed.playlists ?? [],
      videos: parsed.videos ?? [],
      notes: parsed.notes ?? [],
      reminders: parsed.reminders ?? [],
      groups: parsed.groups ?? [],
      resources: parsed.resources ?? [],
      resourceNotes: parsed.resourceNotes ?? [],
      dailyTasks: parsed.dailyTasks ?? [],
      dailyTaskDays: parsed.dailyTaskDays ?? [],
    };
  } catch {
    const initial = cloneSnapshot(seedSnapshot) as Required<AppSnapshot>;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

function writeLocalSnapshot(snapshot: AppSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

async function getDatabase(): Promise<Database | null> {
  if (!isTauri()) return null;
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await Database.load(DB_PATH);
      await ensureSchema(db);
      await recoverLegacyStorage(db);
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function ensureSchema(db: Database): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      file_url TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      current_page INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER NOT NULL DEFAULT 0,
      literature_review TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      youtube_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      youtube_url TEXT NOT NULL,
      duration TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL,
      cadence TEXT NOT NULL DEFAULT 'daily',
      weekday INTEGER NOT NULL DEFAULT 2,
      hour INTEGER NOT NULL DEFAULT 19,
      minute INTEGER NOT NULL DEFAULT 30,
      enabled INTEGER NOT NULL DEFAULT 1,
      notification_id INTEGER
      ,resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
      weekdays TEXT NOT NULL DEFAULT '[]',
      day_of_month INTEGER,
      notification_ids TEXT NOT NULL DEFAULT '[]'
    )`,
  );
  const reminderColumns = await db.select<Array<{ name: string }>>("PRAGMA table_info(reminders)");
  if (!reminderColumns.some((column) => column.name === "resource_id")) {
    await db.execute("ALTER TABLE reminders ADD COLUMN resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL");
  }
  if (!reminderColumns.some((column) => column.name === "weekdays")) {
    await db.execute("ALTER TABLE reminders ADD COLUMN weekdays TEXT NOT NULL DEFAULT '[]'");
  }
  if (!reminderColumns.some((column) => column.name === "day_of_month")) {
    await db.execute("ALTER TABLE reminders ADD COLUMN day_of_month INTEGER");
  }
  if (!reminderColumns.some((column) => column.name === "notification_ids")) {
    await db.execute("ALTER TABLE reminders ADD COLUMN notification_ids TEXT NOT NULL DEFAULT '[]'");
  }
  const playlistColumns = await db.select<Array<{ name: string }>>("PRAGMA table_info(playlists)");
  if (!playlistColumns.some((column) => column.name === "group_id")) {
    await db.execute("ALTER TABLE playlists ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL");
  }
  await db.execute(
    `CREATE TABLE IF NOT EXISTS resource_notes (
      id TEXT PRIMARY KEY,
      resource_id TEXT NOT NULL UNIQUE REFERENCES resources(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS daily_task_days (
      date TEXT PRIMARY KEY,
      opted_in INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS daily_tasks (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`,
  );
  await db.execute("CREATE INDEX IF NOT EXISTS daily_tasks_date_idx ON daily_tasks(date)");
}

// Earlier Android builds silently wrote localStorage when SQLite permissions failed.
// Merge missing IDs once; retain the original snapshot as a recovery copy.
async function recoverLegacyStorage(db: Database): Promise<void> {
  await db.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const migrated = await db.select<Array<{ value: string }>>("SELECT value FROM app_meta WHERE key = 'legacy-storage-v3'");
  if (migrated.length) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const snapshot = JSON.parse(raw) as AppSnapshot;
  if (![snapshot.playlists, snapshot.videos, snapshot.notes, snapshot.reminders].every(Array.isArray)) {
    throw new Error("Existing local data could not be recovered. Do not clear app data.");
  }
  const groups = snapshot.groups ?? [];
  const resources = snapshot.resources ?? [];
  const resourceNotes = snapshot.resourceNotes ?? [];
  const dailyTasks = snapshot.dailyTasks ?? [];
  const dailyTaskDays = snapshot.dailyTaskDays ?? [];
  for (const group of groups) {
    await db.execute(
      "INSERT OR IGNORE INTO groups (id, name, created_at) VALUES ($1, $2, $3)",
      [group.id, group.name, group.createdAt],
    );
  }
  for (const resource of resources) {
    await db.execute(
      `INSERT OR IGNORE INTO resources
       (id, kind, title, source_url, file_name, file_url, author, description, group_id, status, progress, current_page, total_pages, literature_review, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [resource.id, resource.kind, resource.title, resource.sourceUrl, resource.fileName, resource.fileUrl, resource.author, resource.description, resource.groupId, resource.status, resource.progress, resource.currentPage, resource.totalPages, resource.literatureReview, resource.createdAt],
    );
  }
  for (const playlist of snapshot.playlists) {
    await db.execute(
      "INSERT OR IGNORE INTO playlists (id, title, channel, description, youtube_url, created_at, group_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [playlist.id, playlist.title, playlist.channel, playlist.description, playlist.youtubeUrl, playlist.createdAt, playlist.groupId ?? null],
    );
  }
  for (const video of snapshot.videos) {
    await db.execute(
      "INSERT OR IGNORE INTO videos (id, playlist_id, position, title, youtube_url, duration, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [video.id, video.playlistId, video.position, video.title, video.youtubeUrl, video.duration, video.status],
    );
  }
  for (const note of snapshot.notes) {
    await db.execute(
      "INSERT OR IGNORE INTO notes (id, video_id, body, updated_at) VALUES ($1, $2, $3, $4)",
      [note.id, note.videoId, note.body, note.updatedAt],
    );
  }
  for (const reminder of snapshot.reminders) {
    await db.execute(
      "INSERT OR IGNORE INTO reminders (id, playlist_id, resource_id, cadence, weekday, hour, minute, enabled, notification_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [reminder.id, reminder.playlistId, reminder.resourceId ?? null, reminder.cadence, reminder.weekday, reminder.hour, reminder.minute, reminder.enabled ? 1 : 0, reminder.notificationId],
    );
  }
  for (const note of resourceNotes) {
    await db.execute(
      "INSERT OR IGNORE INTO resource_notes (id, resource_id, body, updated_at) VALUES ($1, $2, $3, $4)",
      [note.id, note.resourceId, note.body, note.updatedAt],
    );
  }
  for (const day of dailyTaskDays) {
    await db.execute(
      "INSERT OR IGNORE INTO daily_task_days (date, opted_in, created_at) VALUES ($1, $2, $3)",
      [day.date, day.optedIn ? 1 : 0, day.createdAt],
    );
  }
  for (const task of dailyTasks) {
    await db.execute(
      "INSERT OR IGNORE INTO daily_tasks (id, date, title, completed, created_at, completed_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [task.id, task.date, task.title, task.completed ? 1 : 0, task.createdAt, task.completedAt ?? null],
    );
  }
  await db.execute("INSERT INTO app_meta (key, value) VALUES ('legacy-storage-v3', 'done')");
}

export async function loadSnapshot(): Promise<AppSnapshot> {
  const db = await getDatabase();
  if (!db) return readLocalSnapshot();

  const [playlists, videos, notes, reminders, groups, resources, resourceNotes, dailyTasks, dailyTaskDays] = await Promise.all([
    db.select<Playlist[]>("SELECT id, title, channel, description, youtube_url as youtubeUrl, created_at as createdAt, group_id as groupId FROM playlists ORDER BY created_at DESC"),
    db.select<Video[]>("SELECT id, playlist_id as playlistId, position, title, youtube_url as youtubeUrl, duration, status FROM videos ORDER BY playlist_id, position"),
    db.select<Note[]>("SELECT id, video_id as videoId, body, updated_at as updatedAt FROM notes ORDER BY updated_at DESC"),
    db.select<Array<Omit<Reminder, "enabled" | "weekdays" | "notificationIds"> & { enabled: number; weekdays: string; dayOfMonth: number | null; notificationIds: string }>>("SELECT id, playlist_id as playlistId, resource_id as resourceId, cadence, weekday, weekdays, day_of_month as dayOfMonth, hour, minute, enabled, notification_id as notificationId, notification_ids as notificationIds FROM reminders ORDER BY hour, minute"),
    db.select<LearningGroup[]>("SELECT id, name, created_at as createdAt FROM groups ORDER BY created_at DESC"),
    db.select<LearningResource[]>("SELECT id, kind, title, source_url as sourceUrl, file_name as fileName, file_url as fileUrl, author, description, group_id as groupId, status, progress, current_page as currentPage, total_pages as totalPages, literature_review as literatureReview, created_at as createdAt FROM resources ORDER BY created_at DESC"),
    db.select<ResourceNote[]>("SELECT id, resource_id as resourceId, body, updated_at as updatedAt FROM resource_notes ORDER BY updated_at DESC"),
    db.select<Array<Omit<DailyTask, "completed"> & { completed: number }>>("SELECT id, date, title, completed, created_at as createdAt, completed_at as completedAt FROM daily_tasks ORDER BY date DESC, created_at ASC"),
    db.select<Array<Omit<DailyTaskDay, "optedIn"> & { optedIn: number }>>("SELECT date, opted_in as optedIn, created_at as createdAt FROM daily_task_days ORDER BY date DESC"),
  ]);

  const reminderRows = reminders.map((reminder) => {
    let weekdays: number[] = [];
    let notificationIds: number[] = [];
    try { weekdays = JSON.parse(reminder.weekdays || "[]"); } catch { weekdays = []; }
    try { notificationIds = JSON.parse(reminder.notificationIds || "[]"); } catch { notificationIds = []; }
    const next: Reminder = {
      id: reminder.id,
      playlistId: reminder.playlistId,
      resourceId: reminder.resourceId,
      cadence: reminder.cadence,
      weekday: reminder.weekday,
      hour: reminder.hour,
      minute: reminder.minute,
      enabled: reminder.enabled === 1,
      notificationId: reminder.notificationId,
    };
    if (weekdays.length) next.weekdays = weekdays;
    if (reminder.dayOfMonth != null) next.dayOfMonth = reminder.dayOfMonth;
    if (notificationIds.length) next.notificationIds = notificationIds;
    return next.resourceId ? next : (({ resourceId: _resourceId, ...withoutResourceId }) => withoutResourceId)(next);
  });
  const result: AppSnapshot = {
    playlists,
    videos,
    notes,
    reminders: reminderRows,
  };
  if (dailyTasks.length) result.dailyTasks = dailyTasks.map((task) => ({ ...task, completed: task.completed === 1 }));
  if (dailyTaskDays.length) result.dailyTaskDays = dailyTaskDays.map((day) => ({ ...day, optedIn: day.optedIn === 1 }));
  if (groups.length || resources.length || resourceNotes.length) {
    result.groups = groups;
    result.resources = resources;
    result.resourceNotes = resourceNotes;
  }
  return result;
}

export async function createPlaylist(input: NewPlaylistInput): Promise<void> {
  const now = new Date().toISOString();
  const playlistId = crypto.randomUUID();
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.playlists.unshift({
      id: playlistId,
      title: input.title,
      channel: input.channel,
      description: input.description,
      youtubeUrl: input.youtubeUrl,
      createdAt: now,
    });
    input.videos.forEach((video, index) => {
      snapshot.videos.push({ id: crypto.randomUUID(), playlistId, position: index + 1, ...video, status: "pending" });
    });
    writeLocalSnapshot(snapshot);
    return;
  }

  await db.execute(
    "INSERT INTO playlists (id, title, channel, description, youtube_url, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [playlistId, input.title, input.channel, input.description, input.youtubeUrl, now],
  );
  for (const [index, video] of input.videos.entries()) {
    await db.execute(
      "INSERT INTO videos (id, playlist_id, position, title, youtube_url, duration, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [crypto.randomUUID(), playlistId, index + 1, video.title, video.youtubeUrl, video.duration, "pending"],
    );
  }
}

function isYoutubeVideoUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") &&
      (host === "youtu.be" ? url.pathname.length > 1 : url.searchParams.has("v"));
  } catch {
    return false;
  }
}

export async function createVideo(playlistId: string, input: NewVideoInput): Promise<string> {
  const youtubeUrl = input.youtubeUrl.trim();
  if (!isYoutubeVideoUrl(youtubeUrl)) throw new Error("Paste a valid individual YouTube video URL.");
  const title = input.title?.trim() || "YouTube video";
  const id = crypto.randomUUID();
  const snapshot = await loadSnapshot();
  if (!snapshot.playlists.some((playlist) => playlist.id === playlistId)) throw new Error("This playlist no longer exists.");
  const position = snapshot.videos.filter((video) => video.playlistId === playlistId).length + 1;
  const duration = input.duration?.trim() ?? "";
  const db = await getDatabase();
  if (!db) {
    const current = readLocalSnapshot();
    current.videos.push({ id, playlistId, position, title, youtubeUrl, duration, status: "pending" });
    writeLocalSnapshot(current);
    return id;
  }
  await db.execute(
    "INSERT INTO videos (id, playlist_id, position, title, youtube_url, duration, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, playlistId, position, title, youtubeUrl, duration, "pending"],
  );
  return id;
}

export async function deleteVideo(videoId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const video = snapshot.videos.find((item) => item.id === videoId);
    if (!video) return;
    snapshot.videos = snapshot.videos.filter((item) => item.id !== videoId);
    snapshot.notes = snapshot.notes.filter((note) => note.videoId !== videoId);
    snapshot.videos.filter((item) => item.playlistId === video.playlistId)
      .sort((left, right) => left.position - right.position)
      .forEach((item, index) => { item.position = index + 1; });
    writeLocalSnapshot(snapshot);
    return;
  }
  const video = await db.select<Array<{ playlistId: string }>>("SELECT playlist_id as playlistId FROM videos WHERE id = $1", [videoId]);
  if (!video.length) return;
  await db.execute("DELETE FROM notes WHERE video_id = $1", [videoId]);
  await db.execute("DELETE FROM videos WHERE id = $1", [videoId]);
  const remaining = await db.select<Array<{ id: string }>>("SELECT id FROM videos WHERE playlist_id = $1 ORDER BY position, id", [video[0].playlistId]);
  for (const [index, item] of remaining.entries()) await db.execute("UPDATE videos SET position = $1 WHERE id = $2", [index + 1, item.id]);
}

async function cancelReminderNotifications(reminder: Reminder | undefined): Promise<void> {
  if (!reminder || !isTauri() || !/android/i.test(navigator.userAgent)) return;
  const ids = reminder.notificationIds?.length ? reminder.notificationIds : reminder.notificationId ? [reminder.notificationId] : [];
  if (ids.length) await cancel(ids);
}

export async function deleteGroup(groupId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.groups = snapshot.groups.filter((group) => group.id !== groupId);
    snapshot.playlists.forEach((playlist) => { if (playlist.groupId === groupId) playlist.groupId = null; });
    snapshot.resources.forEach((resource) => { if (resource.groupId === groupId) resource.groupId = null; });
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute("UPDATE playlists SET group_id = NULL WHERE group_id = $1", [groupId]);
  await db.execute("UPDATE resources SET group_id = NULL WHERE group_id = $1", [groupId]);
  await db.execute("DELETE FROM groups WHERE id = $1", [groupId]);
}

export async function deleteResource(resourceId: string): Promise<void> {
  const snapshot = await loadSnapshot();
  const reminders = snapshot.reminders.filter((reminder) => reminder.resourceId === resourceId);
  for (const reminder of reminders) await cancelReminderNotifications(reminder);
  const db = await getDatabase();
  if (!db) {
    const current = readLocalSnapshot();
    current.resources = current.resources.filter((resource) => resource.id !== resourceId);
    current.resourceNotes = current.resourceNotes.filter((note) => note.resourceId !== resourceId);
    current.reminders = current.reminders.filter((reminder) => reminder.resourceId !== resourceId);
    writeLocalSnapshot(current);
    return;
  }
  await db.execute("DELETE FROM reminders WHERE resource_id = $1", [resourceId]);
  await db.execute("DELETE FROM resource_notes WHERE resource_id = $1", [resourceId]);
  await db.execute("DELETE FROM resources WHERE id = $1", [resourceId]);
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const snapshot = await loadSnapshot();
  const reminders = snapshot.reminders.filter((reminder) => reminder.playlistId === playlistId);
  for (const reminder of reminders) await cancelReminderNotifications(reminder);
  const db = await getDatabase();
  if (!db) {
    const current = readLocalSnapshot();
    const videoIds = new Set(current.videos.filter((video) => video.playlistId === playlistId).map((video) => video.id));
    current.playlists = current.playlists.filter((playlist) => playlist.id !== playlistId);
    current.videos = current.videos.filter((video) => video.playlistId !== playlistId);
    current.notes = current.notes.filter((note) => !videoIds.has(note.videoId));
    current.reminders = current.reminders.filter((reminder) => reminder.playlistId !== playlistId);
    writeLocalSnapshot(current);
    return;
  }
  await db.execute("DELETE FROM reminders WHERE playlist_id = $1", [playlistId]);
  await db.execute("DELETE FROM notes WHERE video_id IN (SELECT id FROM videos WHERE playlist_id = $1)", [playlistId]);
  await db.execute("DELETE FROM videos WHERE playlist_id = $1", [playlistId]);
  await db.execute("DELETE FROM playlists WHERE id = $1", [playlistId]);
}

let groupWrite: Promise<unknown> = Promise.resolve();

export function createGroup(name: string): Promise<string> {
  // Serialize search/create so double submissions cannot create duplicate names.
  const result = groupWrite.then(() => findOrCreateGroup(name));
  groupWrite = result.catch(() => undefined);
  return result;
}

async function findOrCreateGroup(name: string): Promise<string> {
  const trimmed = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Give the group a name before saving it.");
  const existing = (await loadSnapshot()).groups?.find((group) => normalizeGroupName(group.name) === normalizeGroupName(trimmed));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.groups.unshift({ id, name: trimmed, createdAt });
    writeLocalSnapshot(snapshot);
    return id;
  }
  await db.execute("INSERT INTO groups (id, name, created_at) VALUES ($1, $2, $3)", [id, trimmed, createdAt]);
  return id;
}

export async function assignGroup(target: GroupTarget, selection: { groupId: string | null } | { name: string }): Promise<void> {
  const snapshot = await loadSnapshot();
  const items = target.kind === "playlist" ? snapshot.playlists : snapshot.resources ?? [];
  if (!items.some((item) => item.id === target.id)) throw new Error("This item no longer exists. Refresh your library.");
  const groupId = "name" in selection ? await createGroup(selection.name) : selection.groupId;
  if (groupId && !(await loadSnapshot()).groups?.some((group) => group.id === groupId)) throw new Error("This group no longer exists.");
  const db = await getDatabase();
  if (!db) {
    const current = readLocalSnapshot();
    const item = (target.kind === "playlist" ? current.playlists : current.resources).find((item) => item.id === target.id)!;
    item.groupId = groupId;
    writeLocalSnapshot(current);
  } else {
    const table = target.kind === "playlist" ? "playlists" : "resources";
    await db.execute(`UPDATE ${table} SET group_id = $1 WHERE id = $2`, [groupId, target.id]);
  }
}

export async function updateResourceFile(resourceId: string, fileName: string, fileUrl: string): Promise<void> {
  if (!fileName || !fileUrl) throw new Error("Choose a PDF before attaching it.");
  if (!fileUrl.startsWith("content://") && !fileUrl.startsWith("blob:")) {
    throw new Error("The attached PDF reference is not supported.");
  }
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const resource = snapshot.resources.find((item) => item.id === resourceId);
    if (!resource) throw new Error("This item no longer exists.");
    resource.fileName = fileName;
    resource.fileUrl = fileUrl;
    writeLocalSnapshot(snapshot);
  } else {
    await db.execute("UPDATE resources SET file_name = $1, file_url = $2 WHERE id = $3", [fileName, fileUrl, resourceId]);
  }
}

export async function createResource(input: NewResourceInput): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error("Add a title before saving this item.");
  if (input.kind === "blog" && !input.sourceUrl?.trim()) throw new Error("Add the blog URL before saving it.");
  if (input.kind === "pdf" && !input.fileName?.trim()) throw new Error("Choose a PDF from your device before saving it.");
  if (input.sourceUrl?.trim()) requireExternalUrl(input.sourceUrl, "Use a valid HTTP or HTTPS source URL.");
  if (input.kind === "pdf" && !input.fileUrl?.trim()) throw new Error("Choose a PDF from your device before saving it.");
  if (input.fileUrl?.trim() && !input.fileUrl.startsWith("content://") && !input.fileUrl.startsWith("blob:")) {
    throw new Error("The attached PDF reference is not supported.");
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const resource: LearningResource = {
    id,
    kind: input.kind,
    title,
    sourceUrl: input.sourceUrl?.trim() ?? "",
    fileName: input.fileName?.trim() ?? "",
    fileUrl: input.fileUrl ?? "",
    author: input.author?.trim() ?? "",
    description: input.description?.trim() ?? "",
    groupId: input.groupId ?? null,
    status: "pending",
    progress: 0,
    currentPage: 0,
    totalPages: Number.isFinite(input.totalPages) ? Math.max(0, Math.floor(input.totalPages ?? 0)) : 0,
    literatureReview: input.literatureReview?.trim() ?? "",
    createdAt,
  };
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.resources.unshift(resource);
    writeLocalSnapshot(snapshot);
    return id;
  }
  await db.execute(
    `INSERT INTO resources
     (id, kind, title, source_url, file_name, file_url, author, description, group_id, status, progress, current_page, total_pages, literature_review, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [resource.id, resource.kind, resource.title, resource.sourceUrl, resource.fileName, resource.fileUrl, resource.author, resource.description, resource.groupId, resource.status, resource.progress, resource.currentPage, resource.totalPages, resource.literatureReview, resource.createdAt],
  );
  return id;
}

export async function updateResourceProgress(resourceId: string, status: ResourceStatus, progress: number, currentPage = 0): Promise<void> {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const resource = snapshot.resources.find((item) => item.id === resourceId);
    if (resource) {
      resource.status = status;
      resource.progress = safeProgress;
      resource.currentPage = Math.max(0, Math.floor(currentPage));
      writeLocalSnapshot(snapshot);
    }
    return;
  }
  await db.execute("UPDATE resources SET status = $1, progress = $2, current_page = $3 WHERE id = $4", [status, safeProgress, Math.max(0, Math.floor(currentPage)), resourceId]);
}

export async function updateResourceDetails(resourceId: string, groupId: string | null, literatureReview: string): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const resource = snapshot.resources.find((item) => item.id === resourceId);
    if (resource) {
      resource.groupId = groupId;
      resource.literatureReview = literatureReview.trim();
      writeLocalSnapshot(snapshot);
    }
    return;
  }
  await db.execute("UPDATE resources SET group_id = $1, literature_review = $2 WHERE id = $3", [groupId, literatureReview.trim(), resourceId]);
}

export async function saveResourceNote(resourceId: string, body: string): Promise<void> {
  if (!body.trim()) throw new Error("Write a note before saving, or use Delete note to remove it.");
  const now = new Date().toISOString();
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const existing = snapshot.resourceNotes.find((note) => note.resourceId === resourceId);
    if (existing) {
      existing.body = body;
      existing.updatedAt = now;
    } else {
      snapshot.resourceNotes.unshift({ id: crypto.randomUUID(), resourceId, body, updatedAt: now });
    }
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute(
    `INSERT INTO resource_notes (id, resource_id, body, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT(resource_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    [crypto.randomUUID(), resourceId, body, now],
  );
}

export async function deleteResourceNote(resourceId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.resourceNotes = snapshot.resourceNotes.filter((note) => note.resourceId !== resourceId);
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute("DELETE FROM resource_notes WHERE resource_id = $1", [resourceId]);
}

export async function updateVideoStatus(videoId: string, status: VideoStatus): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const video = snapshot.videos.find((item) => item.id === videoId);
    if (video) video.status = status;
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute("UPDATE videos SET status = $1 WHERE id = $2", [status, videoId]);
}

export async function saveNote(videoId: string, body: string): Promise<void> {
  if (!body.trim()) throw new Error("Write a note before saving, or use Delete note to remove it.");
  const now = new Date().toISOString();
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const existing = snapshot.notes.find((note) => note.videoId === videoId);
    if (existing) {
      existing.body = body;
      existing.updatedAt = now;
    } else {
      snapshot.notes.unshift({ id: crypto.randomUUID(), videoId, body, updatedAt: now });
    }
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute(
    `INSERT INTO notes (id, video_id, body, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT(video_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    [crypto.randomUUID(), videoId, body, now],
  );
}

export async function deleteNote(videoId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.notes = snapshot.notes.filter((note) => note.videoId !== videoId);
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute("DELETE FROM notes WHERE video_id = $1", [videoId]);
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ensureDailyTaskDay(snapshot: AppSnapshot, date: string, optedIn: boolean): DailyTaskDay {
  const days = snapshot.dailyTaskDays ?? (snapshot.dailyTaskDays = []);
  const existing = days.find((day) => day.date === date);
  if (existing) {
    existing.optedIn = optedIn;
    return existing;
  }
  const day = { date, optedIn, createdAt: new Date().toISOString() };
  days.push(day);
  return day;
}

export async function setDailyTaskOptIn(date: string, optedIn: boolean): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    ensureDailyTaskDay(snapshot, date, optedIn);
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute(
    `INSERT INTO daily_task_days (date, opted_in, created_at) VALUES ($1, $2, $3)
     ON CONFLICT(date) DO UPDATE SET opted_in = excluded.opted_in`,
    [date, optedIn ? 1 : 0, new Date().toISOString()],
  );
}

export async function createDailyTask(title: string, date = getLocalDateKey()): Promise<string> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Write a task before adding it to today's checklist.");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    ensureDailyTaskDay(snapshot, date, true);
    snapshot.dailyTasks.unshift({ id, date, title: cleanTitle, completed: false, createdAt, completedAt: null });
    writeLocalSnapshot(snapshot);
    return id;
  }
  await db.execute(
    `INSERT INTO daily_task_days (date, opted_in, created_at) VALUES ($1, 1, $2)
     ON CONFLICT(date) DO UPDATE SET opted_in = 1`,
    [date, createdAt],
  );
  await db.execute(
    "INSERT INTO daily_tasks (id, date, title, completed, created_at, completed_at) VALUES ($1, $2, $3, 0, $4, NULL)",
    [id, date, cleanTitle, createdAt],
  );
  return id;
}

export async function toggleDailyTask(taskId: string, completed: boolean): Promise<void> {
  const completedAt = completed ? new Date().toISOString() : null;
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    const task = snapshot.dailyTasks.find((item) => item.id === taskId);
    if (!task) return;
    task.completed = completed;
    task.completedAt = completedAt;
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute("UPDATE daily_tasks SET completed = $1, completed_at = $2 WHERE id = $3", [completed ? 1 : 0, completedAt, taskId]);
}

export async function deleteDailyTask(taskId: string): Promise<void> {
  const db = await getDatabase();
  if (!db) {
    const snapshot = readLocalSnapshot();
    snapshot.dailyTasks = snapshot.dailyTasks.filter((task) => task.id !== taskId);
    writeLocalSnapshot(snapshot);
    return;
  }
  await db.execute("DELETE FROM daily_tasks WHERE id = $1", [taskId]);
}

export async function syncDailyTaskNotifications(tasks: DailyTask[]): Promise<string | null> {
  if (!isTauri() || !/android/i.test(navigator.userAgent)) return null;
  try {
    await cancel(DAILY_TASK_NOTIFICATION_IDS);
    const today = getLocalDateKey();
    if (!tasks.some((task) => task.date === today && !task.completed)) return null;
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) permissionGranted = (await requestPermission()) === "granted";
    if (!permissionGranted) return "Checklist saved, but unfinished-task notifications are blocked. Enable notifications in Android Settings.";
    await createChannel({
      id: "affleck-daily-tasks",
      name: "Affleck daily tasks",
      description: "A gentle nudge for unfinished goals on your daily checklist.",
    });
    const now = new Date();
    const slots = [0, 6, 12, 18]
      .map((hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0))
      .filter((date) => date.getTime() > now.getTime());
    for (const [index, date] of slots.entries()) {
      await invoke("plugin:notification|notify", { options: {
        id: DAILY_TASK_NOTIFICATION_IDS[index],
        channelId: "affleck-daily-tasks",
        title: "A gentle check-in",
        body: "You have an unfinished goal for today. Open Affleck when you have a moment.",
        schedule: Schedule.at(date, false, true),
        extra: { type: "daily-task" },
      } });
    }
    return null;
  } catch (error) {
    return `Checklist saved, but Android could not schedule the six-hour reminders. ${String(error)}`;
  }
}

export async function saveReminder(reminder: Reminder): Promise<string | null> {
  const selectedWeekdays = [...new Set((reminder.weekdays ?? []).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((left, right) => left - right);
  if (!Number.isInteger(reminder.hour) || reminder.hour < 0 || reminder.hour > 23 ||
      !Number.isInteger(reminder.minute) || reminder.minute < 0 || reminder.minute > 59 ||
      !Number.isInteger(reminder.weekday) || reminder.weekday < 1 || reminder.weekday > 7 ||
      !["daily", "weekly", "monthly", "custom"].includes(reminder.cadence) ||
      (reminder.cadence === "monthly" && (!Number.isInteger(reminder.dayOfMonth) || (reminder.dayOfMonth ?? 0) < 1 || (reminder.dayOfMonth ?? 0) > 31)) ||
      (reminder.cadence === "custom" && selectedWeekdays.length === 0)) {
    throw new Error("Choose a valid time and day for your reminder.");
  }
  const snapshot = await loadSnapshot();
  const playlist = snapshot.playlists.find((item) => item.id === reminder.playlistId);
  const resource = (snapshot.resources ?? []).find((item) => item.id === reminder.resourceId);
  if (reminder.playlistId && !playlist) throw new Error("This playlist no longer exists. Refresh the library.");
  if (reminder.resourceId && !resource) throw new Error("This learning item no longer exists. Refresh the library.");
  const db = await getDatabase();
  const existing = snapshot.reminders.find((item) => item.playlistId === reminder.playlistId && (item.resourceId ?? null) === (reminder.resourceId ?? null));
  const count = reminder.cadence === "custom" ? selectedWeekdays.length : 1;
  const usedIds = new Set(snapshot.reminders.flatMap((item) => item.notificationIds?.length ? item.notificationIds : item.notificationId ? [item.notificationId] : []));
  const existingIds = existing?.notificationIds?.length ? existing.notificationIds : existing?.notificationId ? [existing.notificationId] : [];
  const notificationIds = existingIds.slice(0, count);
  let nextId = Math.max(0, ...usedIds, ...notificationIds) + 1;
  while (notificationIds.length < count) {
    while (usedIds.has(nextId) || notificationIds.includes(nextId)) nextId += 1;
    notificationIds.push(nextId);
    nextId += 1;
  }
  const nextReminder: Reminder = {
    ...reminder,
    resourceId: reminder.resourceId ?? null,
    id: existing?.id ?? `reminder:${reminder.resourceId ?? reminder.playlistId ?? "all"}`,
    weekday: reminder.cadence === "custom" ? selectedWeekdays[0] : reminder.weekday,
    weekdays: reminder.cadence === "custom" ? selectedWeekdays : undefined,
    dayOfMonth: reminder.cadence === "monthly" ? reminder.dayOfMonth : undefined,
    notificationId: notificationIds[0] ?? null,
    notificationIds,
  };

  if (!db) {
    const index = snapshot.reminders.findIndex((item) => item.id === nextReminder.id);
    if (index >= 0) snapshot.reminders[index] = nextReminder;
    else snapshot.reminders.push(nextReminder);
    writeLocalSnapshot(snapshot);
  } else {
    await db.execute(
      `INSERT INTO reminders (id, playlist_id, resource_id, cadence, weekday, weekdays, day_of_month, hour, minute, enabled, notification_id, notification_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT(id) DO UPDATE SET playlist_id = excluded.playlist_id, cadence = excluded.cadence,
       weekday = excluded.weekday, weekdays = excluded.weekdays, day_of_month = excluded.day_of_month,
       hour = excluded.hour, minute = excluded.minute, enabled = excluded.enabled,
       notification_id = excluded.notification_id, notification_ids = excluded.notification_ids, resource_id = excluded.resource_id`,
      [nextReminder.id, nextReminder.playlistId, nextReminder.resourceId, nextReminder.cadence, nextReminder.weekday, JSON.stringify(nextReminder.weekdays ?? []), nextReminder.dayOfMonth ?? null, nextReminder.hour, nextReminder.minute, nextReminder.enabled ? 1 : 0, nextReminder.notificationId, JSON.stringify(nextReminder.notificationIds ?? [])],
    );
  }

  if (!isTauri() || !/android/i.test(navigator.userAgent)) {
    return "Preference saved. Scheduled notifications are available in the Android app.";
  }
  try {
    // Cancel this reminder only; other playlists keep their own alarms.
    await cancel([...(existing?.notificationIds?.length ? existing.notificationIds : existing?.notificationId ? [existing.notificationId] : []), ...notificationIds.filter((id) => !existing?.notificationIds?.includes(id))]);
    if (!nextReminder.enabled) return null;
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) permissionGranted = (await requestPermission()) === "granted";
    if (!permissionGranted) return "Preference saved, but notifications are blocked. Enable them in Android Settings and save again.";

    await createChannel({
      id: "affleck-study",
      name: "Affleck study reminders",
      description: "A gentle nudge to keep your learning thread alive.",
    });

    const schedules = nextReminder.cadence === "weekly"
      ? [{ weekday: nextReminder.weekday, hour: nextReminder.hour, minute: nextReminder.minute }]
      : nextReminder.cadence === "monthly"
        ? [{ day: nextReminder.dayOfMonth, hour: nextReminder.hour, minute: nextReminder.minute }]
        : nextReminder.cadence === "custom"
          ? selectedWeekdays.map((weekday) => ({ weekday, hour: nextReminder.hour, minute: nextReminder.minute }))
          : [{ hour: nextReminder.hour, minute: nextReminder.minute }];
    // The JS sendNotification helper returns void; await the same plugin command
    // so scheduling failures are visible rather than falsely reported as success.
    for (const [index, scheduleFields] of schedules.entries()) {
      await invoke("plugin:notification|notify", { options: {
        id: notificationIds[index],
        channelId: "affleck-study",
        title: "A small study window",
        body: playlist ? `Time to continue ${playlist.title}.` : resource ? `Time to continue ${resource.title}.` : "Your next Affleck learning session is ready when you are.",
        extra: { playlistId: reminder.playlistId ?? "", resourceId: reminder.resourceId ?? "" },
        schedule: Schedule.interval(scheduleFields),
      } });
    }
    return null;
  } catch (error) {
    return `Preference saved, but Android could not update the notification. Save again to retry. ${String(error)}`;
  }
}

export async function deleteReminder(target: { playlistId: string | null; resourceId?: string | null }): Promise<void> {
  const snapshot = await loadSnapshot();
  const reminder = snapshot.reminders.find((item) => item.playlistId === target.playlistId && (item.resourceId ?? null) === (target.resourceId ?? null));
  if (!reminder) return;
  await cancelReminderNotifications(reminder);
  const db = await getDatabase();
  if (!db) {
    const current = readLocalSnapshot();
    current.reminders = current.reminders.filter((item) => item.id !== reminder.id);
    writeLocalSnapshot(current);
    return;
  }
  await db.execute("DELETE FROM reminders WHERE id = $1", [reminder.id]);
}

export async function openExternalUrl(url: string): Promise<void> {
  const safeUrl = requireExternalUrl(url);
  try {
    await openUrl(safeUrl);
  } catch {
    const opened = window.open(safeUrl, "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("Allow pop-ups for this app, then try again.");
  }
}
