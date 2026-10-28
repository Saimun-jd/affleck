import { FormEvent, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  assignGroup,
  createVideo,
  createPlaylist,
  createResource,
  createDailyTask,
  deleteDailyTask,
  deleteGroup,
  deleteNote,
  deletePlaylist,
  deleteReminder,
  deleteResource,
  deleteVideo,
  deleteResourceNote,
  loadSnapshot,
  getLocalDateKey,
  openExternalUrl,
  saveNote,
  saveReminder,
  saveResourceNote,
  setDailyTaskOptIn,
  syncDailyTaskNotifications,
  toggleDailyTask,
  updateResourceDetails,
  updateResourceProgress,
  updateResourceFile,
  updateVideoStatus,
} from "./lib/db";
import { importYoutubePlaylist, type ImportProgress } from "./lib/youtube";
import { NoteEditor } from "./components/NoteEditor";
import { VideoCard } from "./components/VideoCard";
import { ResourceCard } from "./components/ResourceCard";
import { ResourceNoteEditor } from "./components/ResourceNoteEditor";
import { HabitsView } from "./components/HabitsView";
import { DailyTasksView } from "./components/DailyTasksView";
import { GroupPicker } from "./components/GroupPicker";
import { useLongPress } from "./components/useLongPress";
import type { GroupTarget } from "./lib/groups";
import { openPdf, type PdfReference } from "./lib/documents";
import { PdfAttachment } from "./components/PdfAttachment";
import { EditorDialog } from "./components/EditorDialog";
import type {
  AppSnapshot,
  LearningResource,
  LearningGroup,
  NewResourceInput,
  Playlist,
  PlaylistSummary,
  Reminder,
  Video,
  VideoStatus,
  ResourceStatus,
  NewVideoInput,
  DailyTask,
} from "./types";

type Screen = "today" | "tasks" | "library" | "habits" | "notes";

const navItems: Array<{ id: Screen; label: string; icon: string }> = [
  { id: "today", label: "Today", icon: "◒" },
  { id: "tasks", label: "Tasks", icon: "✓" },
  { id: "library", label: "Library", icon: "▤" },
  { id: "habits", label: "Habits", icon: "◷" },
  { id: "notes", label: "Notes", icon: "✎" },
];

function getSummaries(snapshot: AppSnapshot): PlaylistSummary[] {
  const videosByPlaylist = new Map<string, Video[]>();
  for (const video of snapshot.videos) {
    const videos = videosByPlaylist.get(video.playlistId) ?? [];
    videos.push(video);
    videosByPlaylist.set(video.playlistId, videos);
  }
  return snapshot.playlists.map((playlist) => {
    const videos = videosByPlaylist.get(playlist.id) ?? [];
    const completeCount = videos.filter(
      (video) => video.status === "complete",
    ).length;
    return {
      ...playlist,
      videoCount: videos.length,
      completeCount,
      progress: videos.length
        ? Math.round((completeCount / videos.length) * 100)
        : 0,
      nextVideo: videos.find((video) => video.status !== "complete") ?? null,
    };
  });
}

function formatDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTime(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function openResource(resource: LearningResource): Promise<void> {
  if (resource.kind === "pdf" || resource.fileUrl) return openPdf(resource.fileUrl);
  if (!resource.sourceUrl) throw new Error("This item has no source link. Attach its PDF below.");
  await openExternalUrl(resource.sourceUrl);
}

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [activeScreen, setActiveScreen] = useState<Screen>("today");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [selectedResourceNoteId, setSelectedResourceNoteId] = useState<
    string | null
  >(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [libraryGroupId, setLibraryGroupId] = useState<string | null>(null);
  const [groupTarget, setGroupTarget] = useState<GroupTarget | null>(null);
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    async function reload() {
      try {
        const next = await loadSnapshot();
        if (active) {
          setSnapshot(next);
          setLoadError("");
          void syncDailyTaskNotifications(next.dailyTasks ?? []);
        }
      } catch (error) {
        if (active)
          setLoadError(`Unable to load your saved library: ${String(error)}`);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    void reload();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const appWindow = window as Window & {
      onAndroidBackPressed?: () => boolean;
    };
    appWindow.onAndroidBackPressed = () => {
      // First consume transient UI/detail state, then return to Today from any
      // section. Returning true from the callback lets Android minimize/close
      // the app only when Today is already the active screen.
      if (isAddOpen) {
        setIsAddOpen(false);
        return false;
      }
      if (groupTarget) {
        setGroupTarget(null);
        return false;
      }
      if (selectedResourceNoteId) {
        setSelectedResourceNoteId(null);
        return false;
      }
      if (selectedVideoId) {
        setSelectedVideoId(null);
        return false;
      }
      if (selectedPlaylistId || selectedResourceId || libraryGroupId || search) {
        setSelectedPlaylistId(null);
        setSelectedResourceId(null);
        setLibraryGroupId(null);
        setSearch("");
        return false;
      }
      if (activeScreen !== "today") {
        setActiveScreen("today");
        return false;
      }
      return true;
    };
    return () => {
      delete appWindow.onAndroidBackPressed;
    };
  }, [activeScreen, groupTarget, isAddOpen, libraryGroupId, search, selectedPlaylistId, selectedResourceId, selectedResourceNoteId, selectedVideoId]);

  const summaries = useMemo(
    () => (snapshot ? getSummaries(snapshot) : []),
    [snapshot],
  );
  const selectedPlaylist =
    snapshot?.playlists.find(
      (playlist) => playlist.id === selectedPlaylistId,
    ) ?? null;
  const selectedResource =
    (snapshot?.resources ?? []).find(
      (resource) => resource.id === selectedResourceId,
    ) ?? null;
  const noteVideo = snapshot?.videos.find(
    (video) => video.id === selectedVideoId,
  );
  const noteResource = (snapshot?.resources ?? []).find(
    (resource) => resource.id === selectedResourceNoteId,
  );

  async function refresh(message?: string): Promise<void> {
    setSnapshot(await loadSnapshot());
    if (message) {
      setNotice(message);
      window.setTimeout(() => setNotice(""), 2800);
    }
  }

  async function handleStatus(
    video: Video,
    status: VideoStatus,
  ): Promise<void> {
    await updateVideoStatus(video.id, status);
    const message =
      status === "complete"
        ? "Marked complete."
        : status === "review"
          ? "Marked for review."
          : "Moved back to pending.";
    await refresh(message);
  }

  async function handleSaveNote(videoId: string, body: string): Promise<void> {
    await saveNote(videoId, body.trim());
    await refresh("Note saved to this video.");
  }

  async function handleDeleteNote(videoId: string): Promise<void> {
    await deleteNote(videoId);
    await refresh("Note deleted.");
  }

  async function handleAddPlaylist(
    url: string,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<void> {
    const importedPlaylist = await importYoutubePlaylist(url, onProgress);
    await createPlaylist(importedPlaylist);
    await refresh("Playlist added to your library.");
    setSelectedPlaylistId(null);
    setSelectedResourceId(null);
    setLibraryGroupId(null);
    setIsAddOpen(false);
    setActiveScreen("library");
  }

  async function handleAddResource(input: NewResourceInput): Promise<void> {
    await createResource(input);
    await refresh(
      `${input.kind === "pdf" ? "PDF" : input.kind === "paper" ? "Research paper" : "Blog"} added to your library.`,
    );
    setIsAddOpen(false);
    setSelectedPlaylistId(null);
    setSelectedResourceId(null);
    setLibraryGroupId(null);
    setActiveScreen("library");
  }

  async function handleAddVideo(playlistId: string, input: NewVideoInput): Promise<void> {
    await createVideo(playlistId, input);
    await refresh("Chapter added to the playlist.");
  }

  async function handleDeleteVideo(video: Video): Promise<void> {
    if (!window.confirm(`Remove “${video.title}” from this playlist?`)) return;
    await deleteVideo(video.id);
    await refresh("Chapter removed.");
  }

  async function handleDeletePlaylist(playlist: Playlist): Promise<void> {
    if (!window.confirm(`Remove playlist “${playlist.title}” and its chapters?`)) return;
    await deletePlaylist(playlist.id);
    setSelectedPlaylistId(null);
    await refresh("Playlist removed.");
  }

  async function handleDeleteResource(resource: LearningResource): Promise<void> {
    if (!window.confirm(`Remove “${resource.title}” from your library?`)) return;
    await deleteResource(resource.id);
    setSelectedResourceId(null);
    await refresh("Resource removed.");
  }

  async function handleDeleteGroup(group: LearningGroup): Promise<void> {
    if (!window.confirm(`Remove group “${group.name}”? Its items will become ungrouped.`)) return;
    await deleteGroup(group.id);
    setLibraryGroupId(null);
    await refresh("Group removed; its items are now ungrouped.");
  }

  async function handleAssignGroup(
    selection: { groupId: string | null } | { name: string },
  ): Promise<void> {
    if (!groupTarget) return;
    await assignGroup(groupTarget, selection);
    await refresh("Library organization updated.");
  }

  async function handleResourceStatus(
    resource: LearningResource,
    status: ResourceStatus,
  ): Promise<void> {
    await updateResourceProgress(
      resource.id,
      status,
      status === "complete" ? 100 : resource.progress,
      resource.currentPage,
    );
    await refresh(
      status === "complete"
        ? "Marked complete."
        : status === "review"
          ? "Marked for review."
          : "Moved back to pending.",
    );
  }

  async function handleResourceProgress(
    resource: LearningResource,
    status: ResourceStatus,
    progress: number,
    currentPage: number,
  ): Promise<void> {
    await updateResourceProgress(resource.id, status, progress, currentPage);
    await refresh("Progress saved.");
  }

  async function handleResourceDetails(
    resource: LearningResource,
    groupId: string | null,
    literatureReview: string,
  ): Promise<void> {
    await updateResourceDetails(resource.id, groupId, literatureReview);
    await refresh("Details saved.");
  }

  async function handleReminder(reminder: Reminder): Promise<string | null> {
    const warning = await saveReminder(reminder);
    await refresh(
      warning
        ? undefined
        : reminder.enabled
          ? "Reminder scheduled."
          : "Reminder paused.",
    );
    return warning;
  }

  async function handleDeleteReminder(target: { playlistId: string | null; resourceId?: string | null }): Promise<void> {
    await deleteReminder(target);
    await refresh("Reminder removed.");
  }

  async function refreshDailyTasks(message?: string): Promise<void> {
    const next = await loadSnapshot();
    setSnapshot(next);
    const warning = await syncDailyTaskNotifications(next.dailyTasks ?? []);
    if (message || warning) {
      setNotice(warning ?? message ?? "");
      window.setTimeout(() => setNotice(""), 4200);
    }
  }

  async function handleDailyTaskOptIn(): Promise<void> {
    await setDailyTaskOptIn(getLocalDateKey(), true);
    await refreshDailyTasks("Today’s checklist is ready.");
    setActiveScreen("tasks");
  }

  async function handleDailyTaskSkip(): Promise<void> {
    await setDailyTaskOptIn(getLocalDateKey(), false);
    await refreshDailyTasks("No checklist for today. You can change your mind from Tasks.");
  }

  async function handleAddDailyTask(title: string): Promise<void> {
    await createDailyTask(title);
    await refreshDailyTasks("Task added to today’s checklist.");
  }

  async function handleToggleDailyTask(task: DailyTask, completed: boolean): Promise<void> {
    await toggleDailyTask(task.id, completed);
    await refreshDailyTasks(completed ? "Task complete." : "Task moved back to today’s list.");
  }

  async function handleDeleteDailyTask(task: DailyTask): Promise<void> {
    if (!window.confirm(`Remove “${task.title}” from today’s checklist?`)) return;
    await deleteDailyTask(task.id);
    await refreshDailyTasks("Task removed.");
  }

  if (loadError && !snapshot)
    return (
      <main className="main-content">
        <h1>Library unavailable</h1>
        <p role="alert">{loadError}</p>
        <p>Your existing data has not been cleared.</p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </main>
    );
  if (isLoading || !snapshot) {
    return <div className="app-loading">Opening your learning journal…</div>;
  }

  const groups = snapshot.groups ?? [];
  const resources = snapshot.resources ?? [];
  const resourceNotes = snapshot.resourceNotes ?? [];
  const dailyTasks = snapshot.dailyTasks ?? [];
  const dailyTaskDays = snapshot.dailyTaskDays ?? [];
  const today = getLocalDateKey();

  const currentView = selectedPlaylist ? (
    <PlaylistDetail
      playlist={selectedPlaylist}
      videos={snapshot.videos.filter(
        (video) => video.playlistId === selectedPlaylist.id,
      )}
      notes={snapshot.notes}
      onBack={() => {
        setSelectedPlaylistId(null);
        setSelectedVideoId(null);
      }}
      onOpenVideo={(video) => void openExternalUrl(video.youtubeUrl)}
      onStatus={handleStatus}
      onSelectVideo={setSelectedVideoId}
      onAddVideo={(input) => handleAddVideo(selectedPlaylist.id, input)}
      onDeleteVideo={handleDeleteVideo}
      onDeletePlaylist={() => handleDeletePlaylist(selectedPlaylist)}
    />
  ) : selectedResource ? (
    <ResourceDetail
      key={`${selectedResource.id}:${selectedResource.progress}:${selectedResource.currentPage}:${selectedResource.groupId ?? ""}:${selectedResource.literatureReview}`}
      resource={selectedResource}
      groups={groups}
      note={resourceNotes.find(
        (note) => note.resourceId === selectedResource.id,
      )}
      onBack={() => setSelectedResourceId(null)}
      onOpen={() => openResource(selectedResource)}
      onReattach={async (reference) => { await updateResourceFile(selectedResource.id, reference.name, reference.uri); await refresh("PDF linked. Your progress and notes are unchanged."); }}
      onGroup={() => setGroupTarget({ ...selectedResource, kind: "resource" })}
      onStatus={(status, progress, currentPage) =>
        handleResourceProgress(
          selectedResource,
          status,
          progress,
          currentPage,
        )
      }
      onSaveDetails={(groupId, literatureReview) =>
        handleResourceDetails(selectedResource, groupId, literatureReview)
      }
       onNote={() => setSelectedResourceNoteId(selectedResource.id)}
       onDelete={() => handleDeleteResource(selectedResource)}
    />
  ) : activeScreen === "today" ? (
    <TodayView
      summaries={summaries}
      snapshot={snapshot}
      onOpenPlaylist={setSelectedPlaylistId}
      resources={resources}
      dailyTasks={dailyTasks}
      dailyTaskDays={dailyTaskDays}
      today={today}
      onOpenVideo={(video) => void openExternalUrl(video.youtubeUrl)}
      onOpenResource={setSelectedResourceId}
      onStatus={(video, status) =>
        void handleStatus(video, status).catch((error) =>
          setNotice(String(error)),
        )
      }
      onOpenHabits={() => setActiveScreen("habits")}
      onOpenTasks={() => setActiveScreen("tasks")}
      onStartTasks={handleDailyTaskOptIn}
      onSkipTasks={handleDailyTaskSkip}
      onToggleTask={handleToggleDailyTask}
    />
  ) : activeScreen === "tasks" ? (
    <DailyTasksView
      tasks={dailyTasks}
      days={dailyTaskDays}
      today={today}
      onOptIn={handleDailyTaskOptIn}
      onAdd={handleAddDailyTask}
      onToggle={handleToggleDailyTask}
      onDelete={handleDeleteDailyTask}
    />
  ) : activeScreen === "library" ? (
    <LibraryView
      summaries={summaries}
      search={search}
      onSearch={setSearch}
      onOpenPlaylist={setSelectedPlaylistId}
      resources={resources}
      groups={groups}
      onOpenResource={setSelectedResourceId}
      onResourceStatus={handleResourceStatus}
      resourceNotes={resourceNotes}
       onResourceNote={setSelectedResourceNoteId}
       onDeleteResource={(resource) => void handleDeleteResource(resource)}
      groupId={libraryGroupId}
      onGroupOpen={(id) => {
        setLibraryGroupId(id);
        setSearch("");
      }}
       onAssignGroup={setGroupTarget}
       onDeleteGroup={(group) => void handleDeleteGroup(group)}
       onDeletePlaylist={(playlist) => void handleDeletePlaylist(playlist)}
      onAdd={() => setIsAddOpen(true)}
    />
  ) : activeScreen === "habits" ? (
    <HabitsView
      summaries={summaries}
      resources={resources}
      reminders={snapshot.reminders}
      onSaveReminder={handleReminder}
      onDeleteReminder={handleDeleteReminder}
    />
  ) : (
    <NotesView
      snapshot={snapshot}
      onOpenVideo={(video) => {
        setSelectedVideoId(video.id);
      }}
      onOpenResource={(resource) => {
        setSelectedResourceNoteId(resource.id);
      }}
    />
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setSelectedPlaylistId(null);
            setSelectedResourceId(null);
            setActiveScreen("today");
          }}
        >
          <img className="brand-logo" src="/affleck-logo.svg" alt="" />
          <span className="brand-copy">
            <span className="brand-title">Affleck</span>
            <small className="brand-motto">Gotham demands commitment</small>
          </span>
        </button>
        <div className="topbar-date">{formatDate()}</div>
        <button className="add-button" onClick={() => setIsAddOpen(true)}>
          <span>＋</span> Add resources
        </button>
      </header>

      <main className="main-content">
        {loadError && (
          <p role="alert" className="form-error">
            {loadError}
          </p>
        )}
        {currentView}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={
              activeScreen === item.id && !selectedPlaylist && !selectedResource
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() => {
              setSelectedPlaylistId(null);
              setSelectedResourceId(null);
              setSelectedResourceNoteId(null);
              setLibraryGroupId(null);
              setSearch("");
              setSelectedVideoId(null);
              setActiveScreen(item.id);
              if (item.id === "habits")
                void refresh().catch((error) => setLoadError(String(error)));
            }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {notice && <div className="toast">{notice}</div>}
      {isAddOpen && (
        <AddLearningModal
          onClose={() => setIsAddOpen(false)}
          onPlaylist={handleAddPlaylist}
          onResource={handleAddResource}
        />
      )}
      {groupTarget && (
        <GroupPicker
          target={groupTarget}
          groups={groups}
          onAssign={handleAssignGroup}
          onClose={() => setGroupTarget(null)}
        />
      )}
      {noteVideo && (
        <NoteEditor
          key={noteVideo.id}
          video={noteVideo}
          note={snapshot.notes.find((note) => note.videoId === noteVideo.id)}
          onClose={() => setSelectedVideoId(null)}
          onSave={(body) => handleSaveNote(noteVideo.id, body)}
          onDelete={() => handleDeleteNote(noteVideo.id)}
        />
      )}
      {noteResource && (
        <ResourceNoteEditor
          key={noteResource.id}
          resource={noteResource}
          note={resourceNotes.find(
            (note) => note.resourceId === noteResource.id,
          )}
          onClose={() => setSelectedResourceNoteId(null)}
          onSave={(body) =>
            saveResourceNote(noteResource.id, body).then(() =>
              refresh("Note saved to this item."),
            )
          }
          onDelete={() =>
            deleteResourceNote(noteResource.id).then(() =>
              refresh("Note deleted."),
            )
          }
        />
      )}
    </div>
  );
}

function TodayView({
  summaries,
  snapshot,
  resources,
  dailyTasks,
  dailyTaskDays,
  today,
  onOpenPlaylist,
  onOpenVideo,
  onOpenResource,
  onStatus,
  onOpenHabits,
  onOpenTasks,
  onStartTasks,
  onSkipTasks,
  onToggleTask,
}: {
  summaries: PlaylistSummary[];
  snapshot: AppSnapshot;
  resources: LearningResource[];
  dailyTasks: DailyTask[];
  dailyTaskDays: NonNullable<AppSnapshot["dailyTaskDays"]>;
  today: string;
  onOpenPlaylist: (id: string) => void;
  onOpenVideo: (video: Video) => void;
  onOpenResource: (id: string) => void;
  onStatus: (video: Video, status: VideoStatus) => void;
  onOpenHabits: () => void;
  onOpenTasks: () => void;
  onStartTasks: () => Promise<void>;
  onSkipTasks: () => Promise<void>;
  onToggleTask: (task: DailyTask, completed: boolean) => Promise<void>;
}) {
  const nextVideo =
    summaries.find((summary) => summary.nextVideo)?.nextVideo ?? null;
  const nextPlaylist = summaries.find((summary) => summary.nextVideo) ?? null;
  const nextResource = resources.find((resource) => resource.status !== "complete") ?? null;
  const completeCount = snapshot.videos.filter(
    (video) => video.status === "complete",
  ).length;
  const reviewCount = snapshot.videos.filter(
    (video) => video.status === "review",
  ).length;
  const resourceCompleteCount = resources.filter(
    (resource) => resource.status === "complete",
  ).length;
  const reminder = snapshot.reminders.find((item) => item.enabled);
  const todayDay = dailyTaskDays.find((day) => day.date === today);
  const todayTasks = dailyTasks.filter((task) => task.date === today);
  const firstUnfinishedTask = todayTasks.find((task) => !task.completed);

  return (
    <section className="page-stack">
      <div className="intro-block">
        <p className="eyebrow">Your learning desk</p>
        <h1>Keep the thread alive.</h1>
        <p className="lede">
          A quiet place to return to the things you said you wanted to learn.
        </p>
      </div>

      {!todayDay ? (
        <section className="daily-prompt-card">
          <div><p className="eyebrow">A small intention</p><h2>What do you like to achieve today?</h2><p className="muted">Add a few tasks or goals to a checklist, or leave today open.</p></div>
          <div className="daily-prompt-actions"><button className="primary-button" onClick={() => void onStartTasks()}>Plan my day</button><button className="outline-button" onClick={() => void onSkipTasks()}>Not today</button></div>
        </section>
      ) : todayDay.optedIn && firstUnfinishedTask ? (
        <section className="daily-reminder-card">
          <div><p className="eyebrow">Today’s next goal</p><h2>{firstUnfinishedTask.title}</h2><p className="muted">Your first unfinished task is here when you are ready.</p></div>
          <div className="daily-reminder-actions"><label className="task-check"><input type="checkbox" aria-label={`Complete ${firstUnfinishedTask.title}`} checked={false} onChange={() => void onToggleTask(firstUnfinishedTask, true)} /><span>Mark complete</span></label><button className="outline-button" onClick={onOpenTasks}>Open checklist</button></div>
        </section>
      ) : todayDay.optedIn ? (
        <section className="daily-reminder-card complete">
          <div><p className="eyebrow">Today’s checklist</p><h2>Everything is complete.</h2><p className="muted">A good day can be quiet from here.</p></div><button className="outline-button" onClick={onOpenTasks}>Review tasks</button>
        </section>
      ) : (
        <section className="daily-reminder-card">
          <div><p className="eyebrow">Today</p><h2>No checklist planned.</h2><p className="muted">You can still add a goal whenever you want.</p></div><button className="outline-button" onClick={onOpenTasks}>Open Tasks</button>
        </section>
      )}

      <div className="today-grid">
        <div className="feature-card paper-texture">
          <div className="feature-card-topline">
            <span>Next up</span>
            <span className="status-dot" />
          </div>
          {nextVideo && nextPlaylist ? (
            <>
              <p className="feature-kicker">{nextPlaylist.title}</p>
              <h2>{nextVideo.title}</h2>
              <div className="feature-meta">
                <span>{nextVideo.duration}</span>
                <span>Chapter {nextVideo.position}</span>
              </div>
              <button
                className="primary-button"
                onClick={() => onOpenVideo(nextVideo)}
              >
                Open in YouTube <span>↗</span>
              </button>
            </>
          ) : nextResource ? (
            <>
              <p className="feature-kicker">{nextResource.kind === "pdf" ? "PDF" : nextResource.kind === "paper" ? "Research paper" : "Blog"}</p>
              <h2>{nextResource.title}</h2>
              <div className="feature-meta">
                <span>{nextResource.progress}% complete</span>
                <span>{nextResource.status === "review" ? "Review" : "Ready to continue"}</span>
              </div>
              <button className="primary-button" onClick={() => onOpenResource(nextResource.id)}>
                Open resource <span>→</span>
              </button>
            </>
          ) : (
            <>
              <h2>Your shelf is clear.</h2>
              <p className="muted">
                Add a resource to begin a new learning thread.
              </p>
            </>
          )}
        </div>

        <div className="stat-card">
          <span className="stat-label">Across your shelf</span>
          <strong>{completeCount}</strong>
          <span className="stat-caption">videos completed</span>
          <div className="stat-rule" />
          <div className="mini-stats">
            <span>
              <b>{summaries.length + resources.length}</b> saved items
            </span>
            <span>
              <b>
                {reviewCount +
                  resources.filter((resource) => resource.status === "review")
                    .length}
              </b>{" "}
              to review
            </span>
          </div>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Continue gently</p>
          <h2>Learning threads</h2>
        </div>
        <span className="section-count">{summaries.length} saved</span>
      </div>
      <div className="thread-list">
        {summaries.slice(0, 3).map((summary) => (
          <PlaylistRow
            key={summary.id}
            summary={summary}
            onClick={() => onOpenPlaylist(summary.id)}
          />
        ))}
        {summaries.length === 0 && (
          <EmptyState
            title="No playlists yet"
            body="Your first playlist will live here."
          />
        )}
      </div>

      <div className="lower-grid">
        <div className="review-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Memory desk</p>
              <h2>Worth another look</h2>
            </div>
            <span className="review-count">{reviewCount}</span>
          </div>
          {snapshot.videos
            .filter((video) => video.status === "review")
            .slice(0, 2)
            .map((video) => (
              <div className="review-row" key={video.id}>
                <button
                  className="review-title"
                  onClick={() => onOpenVideo(video)}
                >
                  <span>↺</span>
                  {video.title}
                </button>
                <button
                  className="quiet-action"
                  onClick={() => onStatus(video, "complete")}
                >
                  Done
                </button>
              </div>
            ))}
          {reviewCount === 0 && (
            <p className="muted">
              Mark a video for review when an idea needs more time.
            </p>
          )}
        </div>
        <button className="reminder-card" onClick={onOpenHabits}>
          <span className="eyebrow">Your ritual</span>
          <strong>
            {reminder
              ? `${formatTime(reminder.hour, reminder.minute)} ${reminder.cadence}`
              : "Set a reminder"}
          </strong>
          <span>
            {reminder
              ? "A small window, kept on purpose."
              : "Choose a gentle study nudge."}
          </span>
          <span className="arrow">→</span>
        </button>
      </div>
      {resources.length > 0 && (
        <div className="resource-summary">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Reading desk</p>
              <h2>Other learning</h2>
            </div>
            <span className="section-count">
              {resourceCompleteCount}/{resources.length} complete
            </span>
          </div>
          <p className="muted">
            PDFs, papers, and blogs stay alongside your playlists, with their
            own progress and notes.
          </p>
        </div>
      )}
    </section>
  );
}

function LibraryView({
  summaries,
  resources,
  groups,
  search,
  onSearch,
  onOpenPlaylist,
  onOpenResource,
  onResourceStatus,
  resourceNotes,
  onResourceNote,
  groupId,
  onGroupOpen,
  onAssignGroup,
  onDeleteResource,
  onDeleteGroup,
  onDeletePlaylist,
  onAdd,
}: {
  summaries: PlaylistSummary[];
  resources: LearningResource[];
  groups: LearningGroup[];
  search: string;
  onSearch: (value: string) => void;
  onOpenPlaylist: (id: string) => void;
  onOpenResource: (id: string) => void;
  onResourceStatus: (
    resource: LearningResource,
    status: ResourceStatus,
  ) => Promise<void>;
  resourceNotes: NonNullable<AppSnapshot["resourceNotes"]>;
  onResourceNote: (id: string) => void;
  groupId: string | null;
  onGroupOpen: (id: string | null) => void;
  onAssignGroup: (target: GroupTarget) => void;
  onDeleteResource: (resource: LearningResource) => void;
  onDeleteGroup: (group: LearningGroup) => void;
  onDeletePlaylist: (playlist: Playlist) => void;
  onAdd: () => void;
}) {
  const query = search.trim().toLowerCase();
  const group = groups.find((item) => item.id === groupId);
  const inFolder = (id?: string | null) => (id ?? null) === groupId;
  const matchesResource = (resource: LearningResource) =>
    `${resource.title} ${resource.author} ${resource.fileName} ${resource.sourceUrl}`
      .toLowerCase()
      .includes(query);
  const matchesPlaylist = (summary: PlaylistSummary) =>
    `${summary.title} ${summary.channel}`.toLowerCase().includes(query);
  const visible = summaries.filter(
    (summary) => inFolder(summary.groupId) && matchesPlaylist(summary),
  );
  const visibleResources = resources.filter(
    (resource) => inFolder(resource.groupId) && matchesResource(resource),
  );
  // Searching a grouped item's title reveals its container, never a duplicate loose item.
  const visibleGroups = groupId
    ? []
    : groups.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          resources.some(
            (resource) =>
              resource.groupId === item.id && matchesResource(resource),
          ) ||
          summaries.some(
            (summary) =>
              summary.groupId === item.id && matchesPlaylist(summary),
          ),
      );
  return (
    <section className="page-stack">
      {groupId && (
        <button className="back-link" onClick={() => onGroupOpen(null)}>
          ← All library
        </button>
      )}
      <div className="page-heading-row">
        <div className="intro-block">
          <p className="eyebrow">{groupId ? "Your group" : "The shelf"}</p>
          <h1>{group?.name ?? "Library"}</h1>
          <p className="lede">
            {groupId
              ? "Related learning, kept together."
              : "Groups and ungrouped resources, each in their own place."}
          </p>
        </div>
        {group && <button className="outline-button danger" onClick={() => onDeleteGroup(group)}>Remove group</button>}
        <button className="outline-button" onClick={onAdd}>
          ＋ Add resources
        </button>
      </div>
      <label className="search-field">
        <span>⌕</span>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search your learning shelf"
        />
      </label>
      <p className="form-hint">
        Press and hold a resource to move it to a group, or use Move to group.
      </p>
      {visibleGroups.length > 0 && (
        <div className="group-grid">
          {visibleGroups.map((item) => {
            const members = [...resources, ...summaries].filter(
              (resource) => resource.groupId === item.id,
            );
            const progress = members.length
              ? Math.round(
                  members.reduce((sum, member) => sum + member.progress, 0) /
                    members.length,
                )
              : 0;
            return (
             <button
                className="group-folder"
                key={item.id}
                onClick={() => onGroupOpen(item.id)}
                aria-label={`Open group ${item.name}`}
              >
                <span className="eyebrow">▤ Group</span>
                <strong>{item.name}</strong>
                <span>
                  {members.length} resources · {progress}% complete
                </span>
                <span className="progress-track">
                  <span style={{ width: `${progress}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="library-list">
        {visible.map((summary) => (
          <div key={summary.id} className="playlist-library-entry">
            <PlaylistRow
              summary={summary}
              onClick={() => onOpenPlaylist(summary.id)}
              onGroup={() => onAssignGroup({ ...summary, kind: "playlist" })}
              expanded
            />
            <button
              className="outline-button"
              onClick={() => onAssignGroup({ ...summary, kind: "playlist" })}
             >
               Move to group
             </button>
            <button className="outline-button danger" onClick={() => onDeletePlaylist(summary)}>Remove playlist</button>
          </div>
        ))}
        {visibleResources.map((resource) => (
          <ResourceCard
            key={resource.id}
            resource={resource}
            hasNote={resourceNotes.some(
              (note) => note.resourceId === resource.id,
            )}
            onOpen={() => onOpenResource(resource.id)}
            onNote={() => onResourceNote(resource.id)}
            onStatus={(status) => onResourceStatus(resource, status)}
            onGroup={() => onAssignGroup({ ...resource, kind: "resource" })}
            onDelete={() => onDeleteResource(resource)}
          />
        ))}
        {visibleGroups.length === 0 &&
          visible.length === 0 &&
          visibleResources.length === 0 && (
            <EmptyState
              title={
                groupId && !query ? "This group is empty" : "Nothing found"
              }
              body={
                groupId && !query
                  ? "Return to the library and hold a resource to move it here."
                  : "Try a different title or add a new resource."
              }
            />
          )}
      </div>
    </section>
  );
}

function PlaylistRow({
  summary,
  onClick,
  onGroup,
  expanded = false,
}: {
  summary: PlaylistSummary;
  onClick: () => void;
  onGroup?: () => void;
  expanded?: boolean;
}) {
  const press = useLongPress(onClick, onGroup);
  return (
    <button
      className={
        expanded ? "playlist-row expanded hold-target" : "playlist-row"
      }
      {...press}
    >
      <div className="playlist-number">
        {String(summary.videoCount).padStart(2, "0")}
      </div>
      <div className="playlist-copy">
        <span className="playlist-channel">
          {summary.channel || "Personal playlist"}
        </span>
        <strong>{summary.title}</strong>
        <span className="playlist-description">
          {summary.description || "A learning thread in progress."}
        </span>
      </div>
      <div className="playlist-progress">
        <div className="progress-label">
          <span>
            {summary.completeCount}/{summary.videoCount}
          </span>
          <b>{summary.progress}%</b>
        </div>
        <div className="progress-track">
          <span style={{ width: `${summary.progress}%` }} />
        </div>
        <span className="row-arrow">→</span>
      </div>
    </button>
  );
}

function PlaylistDetail({
  playlist,
  videos,
  notes,
  onBack,
  onOpenVideo,
  onStatus,
  onSelectVideo,
  onAddVideo,
  onDeleteVideo,
  onDeletePlaylist,
}: {
  playlist: Playlist;
  videos: Video[];
  notes: AppSnapshot["notes"];
  onBack: () => void;
  onOpenVideo: (video: Video) => void;
  onStatus: (video: Video, status: VideoStatus) => Promise<void>;
  onSelectVideo: (id: string | null) => void;
  onAddVideo: (input: NewVideoInput) => Promise<void>;
  onDeleteVideo: (video: Video) => Promise<void>;
  onDeletePlaylist: () => Promise<void>;
}) {
  const [addingVideo, setAddingVideo] = useState(false);
  const completeCount = videos.filter(
    (video) => video.status === "complete",
  ).length;

  return (
    <section className="page-stack detail-page">
      <button className="back-link" onClick={onBack}>
        ← Back to library
      </button>
      <div className="detail-header">
        <div>
          <p className="eyebrow">{playlist.channel || "Playlist"}</p>
          <h1>{playlist.title}</h1>
          <p className="lede">{playlist.description}</p>
        </div>
        <div className="detail-progress">
          <strong>
            {videos.length
              ? Math.round((completeCount / videos.length) * 100)
              : 0}
            %
          </strong>
          <span>complete</span>
          <div className="progress-track">
            <span
              style={{
                width: `${videos.length ? (completeCount / videos.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>
      <div className="detail-actions">
        <button
          className="primary-button"
          onClick={() => void openExternalUrl(playlist.youtubeUrl)}
        >
          Open playlist in YouTube ↗
        </button>
        <span>
          {videos.length} videos · {completeCount} complete
        </span>
        <button className="outline-button danger" onClick={() => void onDeletePlaylist()}>Remove playlist</button>
      </div>
      <div>
        <div className="video-list">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">The sequence</p>
              <h2>Playlist chapters</h2>
            </div>
            <span className="section-count">{videos.length}</span>
            <button className="outline-button" onClick={() => setAddingVideo(true)}>＋ Add chapter</button>
          </div>
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              hasNote={notes.some((note) => note.videoId === video.id)}
              onWatch={() => onOpenVideo(video)}
              onNote={() => onSelectVideo(video.id)}
              onStatus={(status) => onStatus(video, status)}
              onDelete={() => onDeleteVideo(video)}
            />
          ))}
        </div>
      </div>
      {addingVideo && <AddVideoDialog onClose={() => setAddingVideo(false)} onSave={async (input) => { await onAddVideo(input); setAddingVideo(false); }} />}
    </section>
  );
}

function AddVideoDialog({ onClose, onSave }: { onClose: () => void; onSave: (input: NewVideoInput) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await onSave({ title, youtubeUrl, duration }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <EditorDialog title="Add playlist chapter" onClose={() => { if (!busy) onClose(); }}>
    <form className="editor-form" onSubmit={(event) => void submit(event)}>
      <header className="modal-header"><div><p className="eyebrow">Playlist chapter</p><h2>Add a video</h2></div><button type="button" className="outline-button" onClick={onClose} disabled={busy}>Close</button></header>
      <p className="modal-lede">Add one individual YouTube video without re-importing the whole playlist.</p>
      <label className="form-label">YouTube video URL<input autoFocus required value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
      <label className="form-label">Chapter title (optional)<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Video title" /></label>
      <label className="form-label">Duration (optional)<input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="e.g. 18 min" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="outline-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Adding…" : "Add chapter"}</button></div>
    </form>
  </EditorDialog>;
}

function ResourceDetail({
  resource,
  groups,
  note,
  onBack,
  onOpen,
  onStatus,
  onSaveDetails,
  onNote,
  onGroup,
  onReattach,
  onDelete,
}: {
  resource: LearningResource;
  groups: LearningGroup[];
  note?: NonNullable<AppSnapshot["resourceNotes"]>[number];
  onBack: () => void;
  onOpen: () => Promise<void>;
  onStatus: (
    status: ResourceStatus,
    progress: number,
    currentPage: number,
  ) => Promise<void>;
  onSaveDetails: (
    groupId: string | null,
    literatureReview: string,
  ) => Promise<void>;
  onNote: () => void;
  onGroup: () => void;
  onReattach: (reference: PdfReference) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [progress, setProgress] = useState(String(resource.progress));
  const [currentPage, setCurrentPage] = useState(String(resource.currentPage));
  const [literatureReview, setLiteratureReview] = useState(
    resource.literatureReview,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kindLabel =
    resource.kind === "pdf"
      ? "PDF"
      : resource.kind === "paper"
        ? "Research paper"
        : "Blog";
  async function saveDetails() {
    setBusy(true);
    setError("");
    try {
      await onSaveDetails(resource.groupId, literatureReview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveProgress(status: ResourceStatus = resource.status) {
    const nextProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    const nextPage = Math.max(0, Number(currentPage) || 0);
    setBusy(true); setError("");
    try { await onStatus(status, nextProgress, nextPage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function open() {
    setBusy(true); setError("");
    try { await onOpen(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return (
    <section className="page-stack detail-page">
      <button className="back-link" onClick={onBack}>
        ← Back to library
      </button>
      <div className="detail-header">
        <div>
          <p className="eyebrow">{kindLabel}</p>
          <h1>{resource.title}</h1>
          <p className="lede">
            {resource.author ||
              resource.fileName ||
              resource.sourceUrl ||
              "A learning item in progress."}
          </p>
        </div>
        <div className="detail-progress">
          <strong>{resource.progress}%</strong>
          <span>complete</span>
          <div className="progress-track">
            <span style={{ width: `${resource.progress}%` }} />
          </div>
        </div>
      </div>
      <div className="detail-actions">
        <button className="primary-button" disabled={busy} onClick={() => void open()}>
          {resource.kind === "pdf" || resource.fileUrl ? "Open PDF ↗" : "Open source ↗"}
        </button>
        <button className="outline-button" onClick={onNote}>
          {note ? "Edit note" : "Add note"}
        </button>
        <button className="outline-button danger" onClick={() => void onDelete()}>Remove resource</button>
        <span>
          {resource.groupId
            ? groups.find((group) => group.id === resource.groupId)?.name
            : "Ungrouped"}
        </span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {resource.kind !== "blog" && <PdfAttachment label={resource.fileName ? "Reattach PDF" : "Attach PDF"} fileName={resource.fileName} disabled={busy} onChoose={async (reference) => { await onReattach(reference); setError(""); }} />}
      <div className="resource-detail-grid">
        <div className="feature-card resource-progress-card">
          <p className="eyebrow">Keep your place</p>
          <h2>
            {resource.kind === "pdf" ? "Page progress" : "Reading progress"}
          </h2>
          <div className="form-row">
            <label className="form-label">
              Percent complete
              <input
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={(event) => setProgress(event.target.value)}
              />
            </label>
            {resource.kind === "pdf" && (
              <label className="form-label">
                Current page
                <input
                  type="number"
                  min="0"
                  max={resource.totalPages || undefined}
                  value={currentPage}
                  onChange={(event) => setCurrentPage(event.target.value)}
                />
              </label>
            )}
          </div>
          {resource.kind === "pdf" && (
            <p className="form-hint">
              {resource.totalPages
                ? `${resource.totalPages} pages total. The PDF itself stays on your device.`
                : "The PDF stays on your device; Affleck only remembers this page number."}
            </p>
          )}
          <button
            className="primary-button"
            onClick={() => void saveProgress()}
            disabled={busy}
          >
            Save progress
          </button>
        </div>
        <div className="reminder-form">
          <button className="outline-button" onClick={onGroup}>Move to group</button>
          {resource.kind === "paper" && (
            <label className="form-label">
              Literature review
              <textarea
                value={literatureReview}
                onChange={(event) => setLiteratureReview(event.target.value)}
                placeholder="Summarize the question, method, findings, and how this paper fits with other work…"
              />
            </label>
          )}
          {resource.kind === "paper" && <button
            className="outline-button"
            onClick={() => void saveDetails()}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save details"}
          </button>}
        </div>
      </div>
    </section>
  );
}

function NotesView({
  snapshot,
  onOpenVideo,
  onOpenResource,
}: {
  snapshot: AppSnapshot;
  onOpenVideo: (video: Video) => void;
  onOpenResource: (resource: LearningResource) => void;
}) {
  const notes = snapshot.notes.filter((note) => note.body.trim());
  const resourceNotes = (snapshot.resourceNotes ?? []).filter((note) =>
    note.body.trim(),
  );
  return (
    <section className="page-stack">
      <div className="intro-block">
        <p className="eyebrow">Memory desk</p>
        <h1>Notes</h1>
        <p className="lede">
          Small sentences that make the next return easier.
        </p>
      </div>
      <div className="notes-grid">
        {notes.map((note) => {
          const video = snapshot.videos.find(
            (item) => item.id === note.videoId,
          );
          const playlist = snapshot.playlists.find(
            (item) => item.id === video?.playlistId,
          );
          if (!video || !playlist) return null;
          return (
            <article className="note-card" key={note.id}>
              <div className="note-card-heading">
                <span className="eyebrow">{playlist.title}</span>
                <button onClick={() => onOpenVideo(video)}>Edit note</button>
              </div>
              <h2>{video.title}</h2>
              <p>{note.body}</p>
              <span className="note-date">
                Updated{" "}
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(note.updatedAt))}
              </span>
            </article>
          );
        })}
        {resourceNotes.map((note) => {
          const resource = (snapshot.resources ?? []).find(
            (item) => item.id === note.resourceId,
          );
          const group = (snapshot.groups ?? []).find(
            (item) => item.id === resource?.groupId,
          );
          if (!resource) return null;
          return (
            <article className="note-card" key={note.id}>
              <div className="note-card-heading">
                <span className="eyebrow">
                  {group?.name ||
                    (resource.kind === "paper"
                      ? "Research paper"
                      : resource.kind.toUpperCase())}
                </span>
                <button onClick={() => onOpenResource(resource)}>
                  Edit note
                </button>
              </div>
              <h2>{resource.title}</h2>
              <p>{note.body}</p>
              <span className="note-date">
                Updated{" "}
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(note.updatedAt))}
              </span>
            </article>
          );
        })}
        {notes.length === 0 && resourceNotes.length === 0 && (
          <EmptyState
            title="Your notes are waiting"
            body="Open any learning item and write what you want future-you to remember."
          />
        )}
      </div>
    </section>
  );
}

function AddLearningModal({
  onClose,
  onPlaylist,
  onResource,
}: {
  onClose: () => void;
  onPlaylist: (
    url: string,
    onProgress?: (progress: ImportProgress) => void,
  ) => Promise<void>;
  onResource: (input: NewResourceInput) => Promise<void>;
}) {
  type Mode = "playlist" | "pdf" | "paper" | "blog";
  const [mode, setMode] = useState<Mode>("playlist");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [literatureReview, setLiteratureReview] = useState("");
  const [file, setFile] = useState<PdfReference | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      if (mode === "playlist") {
        if (!youtubeUrl.trim())
          throw new Error("Paste a YouTube playlist URL.");
        await onPlaylist(youtubeUrl.trim(), setProgress);
      } else {
        await onResource({
          kind: mode,
          title,
          sourceUrl,
          author,
          fileName: mode !== "blog" ? file?.name : "",
          fileUrl: mode !== "blog" ? file?.uri : "",
          totalPages: totalPages ? Number(totalPages) : 0,
          literatureReview,
        });
      }
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "This item could not be saved.",
      );
      setIsSaving(false);
    }
  }

  const progressLabel =
    progress?.phase === "videos"
      ? `Found ${progress.completed}${progress.total ? ` of ${progress.total}` : ""} videos…`
      : "Finding playlist…";
  const heading =
    mode === "playlist"
      ? "Import a playlist"
      : mode === "pdf"
        ? "Attach a PDF"
        : mode === "paper"
          ? "Add a research paper"
          : "Add a blog";
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isSaving) onClose();
      }}
    >
      <form className="modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">New learning thread</p>
            <h2>{heading}</h2>
          </div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            disabled={isSaving}
          >
            ×
          </button>
        </div>
        <div className="add-tabs" role="tablist" aria-label="Add learning type">
          {(["playlist", "pdf", "paper", "blog"] as Mode[]).map(
            (value) => (
              <button
                type="button"
                key={value}
                role="tab"
                disabled={isSaving}
                aria-selected={mode === value}
                className={mode === value ? "add-tab active" : "add-tab"}
                onClick={() => {
                  setMode(value);
                  setError("");
                }}
              >
                {value === "playlist"
                  ? "YouTube"
                  : value === "pdf"
                    ? "PDF"
                    : value === "paper"
                      ? "Paper"
                      : "Blog"}
              </button>
            ),
          )}
        </div>
        {mode === "playlist" && (
          <>
            <p className="modal-lede">
              Paste one public YouTube playlist URL. Affleck fetches its title,
              channel, videos, order, and durations automatically.
            </p>
            <label className="form-label">
              YouTube playlist URL
              <input
                autoFocus
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://youtube.com/playlist?list=…"
              />
            </label>
          </>
        )}
        {mode === "pdf" && (
          <>
            <p className="modal-lede">
              Attach the PDF from your device. Affleck saves only its name and
              your progress, never a copy of the file.
            </p>
            <PdfAttachment disabled={isSaving} fileName={file?.name} onChoose={(reference) => { setFile(reference); if (!title) setTitle(reference.name.replace(/\.pdf$/i, "")); }} />
            <label className="form-label">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. The design of everyday things"
              />
            </label>
            <label className="form-label">
              Total pages (optional)
              <input
                type="number"
                min="0"
                value={totalPages}
                onChange={(event) => setTotalPages(event.target.value)}
              />
            </label>
          </>
        )}
        {(mode === "paper" || mode === "blog") && (
          <>
            {mode === "paper" && <PdfAttachment label="Attach paper PDF (optional)" disabled={isSaving} fileName={file?.name} onChoose={setFile} />}
            <label className="form-label">
              Title
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={mode === "paper" ? "Paper title" : "Blog title"}
              />
            </label>
            <label className="form-label">
              {mode === "paper" ? "Paper URL (optional)" : "Blog URL"}
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="form-label">
              Author or publication (optional)
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Who wrote it?"
              />
            </label>
            {mode === "paper" && (
              <label className="form-label">
                Literature review (optional)
                <textarea
                  value={literatureReview}
                  onChange={(event) => setLiteratureReview(event.target.value)}
                  placeholder="What does this paper say, and how does it connect to the others?"
                />
              </label>
            )}
          </>
        )}
        {isSaving && (
          <div className="import-progress">
            <span className="spinner" />
            <span>{mode === "playlist" ? progressLabel : "Saving…"}</span>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="outline-button"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving
              ? "Saving…"
              : mode === "playlist"
                ? "Import playlist"
                : "Save item"}
          </button>
        </div>
        <p className="form-hint">
          Your notes, reminders, and progress stay local to Affleck. Files
          themselves stay on your device. After saving, hold a resource in Library to find or create a group.
        </p>
      </form>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">—</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

export default App;
