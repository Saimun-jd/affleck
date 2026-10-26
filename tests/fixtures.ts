import type { AppSnapshot, NewPlaylistInput } from "../src/types";

export const imported: NewPlaylistInput = {
  title: "Newly imported course", channel: "Test channel", description: "Test only",
  youtubeUrl: "https://www.youtube.com/playlist?list=PLnew",
  videos: [{ title: "New chapter", youtubeUrl: "https://www.youtube.com/watch?v=test", duration: "10m" }],
};
export function fixture(): AppSnapshot {
  return {
    playlists: [
      { id: "p1", title: "First course", channel: "Test", description: "", youtubeUrl: "https://www.youtube.com/playlist?list=PLone", createdAt: "2026-01-01T00:00:00Z" },
      { id: "p2", title: "Second course", channel: "Test", description: "", youtubeUrl: "https://www.youtube.com/playlist?list=PLtwo", createdAt: "2026-01-02T00:00:00Z" },
    ],
    videos: [
      { id: "v1", playlistId: "p1", title: "First video", position: 1, youtubeUrl: "https://www.youtube.com/watch?v=one", duration: "10m", status: "pending" },
      { id: "v2", playlistId: "p1", title: "Second video", position: 2, youtubeUrl: "https://www.youtube.com/watch?v=two", duration: "20m", status: "review" },
    ],
    notes: [{ id: "n2", videoId: "v2", body: "Other video's note", updatedAt: "2026-01-01T00:00:00Z" }],
    reminders: [{ id: "reminder-default", playlistId: "p1", cadence: "weekly", weekday: 5, hour: 8, minute: 15, enabled: true, notificationId: 42 }],
  };
}
