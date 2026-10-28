import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { NewPlaylistInput } from "../types";

// shortcut: public instances can change or disappear; self-host an Invidious instance for production reliability.
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si",
];

const MAX_PLAYLIST_PAGES = 100;
const MAX_PLAYLIST_VIDEOS = 5000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 20_000;

interface InvidiousPlaylistResponse {
  title?: string;
  author?: string;
  description?: string;
  videoCount?: number;
  videos?: Array<{
    title?: string;
    videoId?: string;
    index?: number;
    lengthSeconds?: number;
  }>;
}

export interface ImportProgress {
  phase: "playlist" | "videos";
  completed: number;
  total: number;
}

function parsePlaylistId(input: string): string {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:") throw new Error();
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "youtube.com" && host !== "m.youtube.com") throw new Error();
    const playlistId = url.searchParams.get("list");
    if (playlistId) return playlistId;
  } catch {
    // Fall through to the clearer validation error below.
  }
  throw new Error("Paste a valid YouTube playlist URL containing a list parameter.");
}

async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error("Playlist service returned an unexpectedly large response.");
  }
  if (!response.body) {
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) throw new Error("Playlist service returned an unexpectedly large response.");
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Playlist service returned an unexpectedly large response.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function requestJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await tauriFetch(url, { connectTimeout: 10_000 });
  } catch {
    response = await window.fetch(url);
  }

  const body = await readBoundedBody(response);
  let payload: T & { error?: string; message?: string };
  try {
    payload = JSON.parse(body) as T & { error?: string; message?: string };
  } catch {
    throw new Error("Playlist service returned invalid JSON.");
  }
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? `Playlist service returned HTTP ${response.status}.`);
  }
  return payload;
}

async function requestPlaylistPage(playlistId: string, page: number): Promise<InvidiousPlaylistResponse> {
  let lastError: unknown;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      return await requestJson<InvidiousPlaylistResponse>(
        `${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}?page=${page}`,
      );
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "No playlist service responded.";
  throw new Error(`Could not reach a playlist service. ${message}`);
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds < 1) return "";
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", !hours && remainder ? `${remainder}s` : ""]
    .filter(Boolean)
    .join(" ") || "0m";
}

export async function importYoutubePlaylist(
  input: string,
  onProgress?: (progress: ImportProgress) => void,
): Promise<NewPlaylistInput> {
  const playlistId = parsePlaylistId(input);
  const importedVideos: Array<{ title: string; youtubeUrl: string; duration: string; index: number }> = [];
  const seenItems = new Set<string>();
  let playlist: InvidiousPlaylistResponse | null = null;
  let page = 1;

  onProgress?.({ phase: "playlist", completed: 0, total: 0 });

  while (page <= MAX_PLAYLIST_PAGES) {
    const response = await requestPlaylistPage(playlistId, page);
    playlist ??= response;
    const pageVideos = response.videos ?? [];
    if (!pageVideos.length) break;

    for (const [offset, video] of pageVideos.entries()) {
      if (!video.videoId) continue;
      const index = video.index ?? importedVideos.length + offset;
      const itemKey = `${index}:${video.videoId}`;
      if (seenItems.has(itemKey)) continue;
      seenItems.add(itemKey);
      importedVideos.push({
        index,
        title: video.title?.trim().slice(0, MAX_TITLE_LENGTH) || `Video ${importedVideos.length + 1}`,
        youtubeUrl: `https://www.youtube.com/watch?v=${video.videoId}&list=${playlistId}`,
        duration: formatDuration(video.lengthSeconds),
      });
      if (importedVideos.length >= MAX_PLAYLIST_VIDEOS) {
        throw new Error(`This playlist is larger than Affleck can safely import (${MAX_PLAYLIST_VIDEOS.toLocaleString()} videos).`);
      }
    }

    onProgress?.({
      phase: "videos",
      completed: importedVideos.length,
      total: response.videoCount ?? 0,
    });

    if (response.videoCount && importedVideos.length >= response.videoCount) break;
    page += 1;
  }

  if (!playlist || importedVideos.length === 0) {
    throw new Error("That playlist could not be found, is not public, or contains no videos.");
  }
  if (page > MAX_PLAYLIST_PAGES && playlist.videoCount && importedVideos.length < playlist.videoCount) {
    throw new Error(`This playlist exceeds Affleck's safe import limit of ${MAX_PLAYLIST_PAGES} pages.`);
  }

  importedVideos.sort((left, right) => left.index - right.index);
  return {
    title: playlist.title?.trim().slice(0, MAX_TITLE_LENGTH) || "YouTube playlist",
    channel: playlist.author?.trim().slice(0, MAX_TITLE_LENGTH) || "YouTube",
    description: playlist.description?.trim().slice(0, MAX_DESCRIPTION_LENGTH) || "",
    youtubeUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    videos: importedVideos.map(({ title, youtubeUrl, duration }) => ({ title, youtubeUrl, duration })),
  };
}
