export type VideoStatus = "pending" | "complete" | "review";
export type ResourceKind = "pdf" | "paper" | "blog";
export type ResourceStatus = VideoStatus;

export type ReminderCadence = "daily" | "weekly" | "monthly" | "custom";

export interface Playlist {
  id: string;
  groupId?: string | null;
  title: string;
  channel: string;
  description: string;
  youtubeUrl: string;
  createdAt: string;
}

export interface Video {
  id: string;
  playlistId: string;
  position: number;
  title: string;
  youtubeUrl: string;
  duration: string;
  status: VideoStatus;
}

export interface NewVideoInput {
  title?: string;
  youtubeUrl: string;
  duration?: string;
}

export interface LearningGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface LearningResource {
  id: string;
  kind: ResourceKind;
  title: string;
  sourceUrl: string;
  fileName: string;
  fileUrl: string;
  author: string;
  description: string;
  groupId: string | null;
  status: ResourceStatus;
  progress: number;
  currentPage: number;
  totalPages: number;
  literatureReview: string;
  createdAt: string;
}

export interface Note {
  id: string;
  videoId: string;
  body: string;
  updatedAt: string;
}

export interface ResourceNote {
  id: string;
  resourceId: string;
  body: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  playlistId: string | null;
  resourceId?: string | null;
  cadence: ReminderCadence;
  weekday: number;
  weekdays?: number[];
  dayOfMonth?: number;
  hour: number;
  minute: number;
  enabled: boolean;
  notificationId: number | null;
  notificationIds?: number[];
}

export interface DailyTask {
  id: string;
  date: string;
  title: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string | null;
}

export interface DailyTaskDay {
  date: string;
  optedIn: boolean;
  createdAt: string;
}

export interface AppSnapshot {
  playlists: Playlist[];
  videos: Video[];
  notes: Note[];
  reminders: Reminder[];
  groups?: LearningGroup[];
  resources?: LearningResource[];
  resourceNotes?: ResourceNote[];
  dailyTasks?: DailyTask[];
  dailyTaskDays?: DailyTaskDay[];
}

export interface NewPlaylistInput {
  title: string;
  channel: string;
  description: string;
  youtubeUrl: string;
  videos: Array<Pick<Video, "title" | "youtubeUrl" | "duration">>;
}

export interface PlaylistSummary extends Playlist {
  videoCount: number;
  completeCount: number;
  progress: number;
  nextVideo: Video | null;
}

export interface NewResourceInput {
  kind: ResourceKind;
  title: string;
  sourceUrl?: string;
  fileName?: string;
  fileUrl?: string;
  author?: string;
  description?: string;
  groupId?: string | null;
  totalPages?: number;
  literatureReview?: string;
}
