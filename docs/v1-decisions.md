# Affleck v1 decisions

## Product boundary

Affleck v1 manages YouTube playlists only. The data model keeps playlist metadata, ordered videos, one active-recall note per video, and reminders separate so other learning resources can be added later without rewriting the current screens.

## Storage

- Tauri 2 is the Android/Desktop shell.
- SQLite is the native source of truth at `sqlite:affleck.db`.
- The browser preview uses `localStorage` only as a development fallback; it is not the Android persistence layer.
- No account, sync service, or cloud database is included in v1.
- Native initialization is single-flight, errors are visible, and browser fallback is only used outside Tauri. Legacy fallback data is merged once into SQLite without clearing the original localStorage copy.

## YouTube import

Playlist import uses public Invidious playlist endpoints so a user can paste a public YouTube playlist URL without an account or API key. The client stores only playlist/video metadata and URLs locally, and falls back across several configured public instances when one is unavailable. Private playlists are out of scope.

## Video state

Every video has exactly one state: `pending`, `complete`, or `review`. Overall completion counts only `complete` videos. `review` is intentionally separate so active recall does not look like unfinished work.

## Navigation and visual language

The first screen is Today, followed by Library, Habits, and Notes. The UI uses a warm ivory/espresso palette, serif editorial headings, sans-serif controls, thin borders, restrained shadows, and paper texture only on feature surfaces.

## Notification behavior

Reminders are local notifications scheduled through the Tauri notification plugin. The browser fallback saves the preference but cannot provide a real native notification.

## Mobile UX corrections — October 24, 2026

- Android content consumes system bar, display cutout and IME insets natively. No hard-coded status-bar height or duplicate CSS top offset.
- Video playback is a separate button from labelled, 48px-high status controls. Status changes do not launch YouTube.
- One note per video remains the model. Add/Edit opens a modal editor with save, explicit confirmed deletion, and unsaved-change confirmation. Notes screen uses the same editor.
- Habits replaces the single-record dropdown with a current-library list. Each playlist has one independent reminder, reused on edit; existing reminder IDs are retained. All learning is a separate optional schedule.
- Notification IDs are allocated independently of playlist IDs. Only the edited reminder is cancelled/replaced. Permission denial and scheduling/cancellation errors are surfaced, while saved preferences remain available for retry.
