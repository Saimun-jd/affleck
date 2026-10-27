# Affleck - Gotham needs its hero for that first I need to complete my due learning

<img src="./public/affleck-logo.svg" alt="Affleck bat mark" width="100" />
<h2>Built for <code>polymaths</code> with learning management issues.</h2>

Affleck is a mobile-first learning journal for keeping several learning threads in motion without turning them into a dashboard. It supports YouTube playlists plus local PDFs, research papers, and one-by-one blog links, and is built for Tauri 2 + React + SQLite.

<h3>Full android support without any hassle of authentication.</h3>

The product decisions for this first slice are recorded in [`docs/v1-decisions.md`](docs/v1-decisions.md).

Interested in contributing? Start with the project guidelines in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Run the web preview

```bash
npm install
npm run dev
```

Playlist imports do not require a YouTube account or API key. Paste a public YouTube playlist URL and Affleck fetches its metadata through a small list of public Invidious instances, with fallback between instances. The playlist URL is sent to the selected public instance during import; self-host an instance if you need a private/reliable service.

The browser preview uses `localStorage` as a development fallback. The Tauri runtime uses the SQLite database at `sqlite:affleck.db`.

## Run the desktop shell

```bash
npm run tauri dev
```

## Prepare Android

```bash
npm run tauri android dev
```

Android development also needs the Android SDK, platform tools, NDK, Rust Android targets, and an emulator or connected device.
The Android project is already initialized. Do not regenerate it during routine builds: `MainActivity.kt` contains system-bar/keyboard inset handling, and `DocumentsPlugin.kt` implements the native PDF picker/reader chooser.

For a repeatable debug APK build:

```bash
npm run android:debug
```

The universal debug build includes all four Android ABIs, but Rust debug symbols are stripped so it stays suitable for installation. For an even smaller arm64-only developer APK (the normal architecture for current phones):

```bash
npm run android:debug:arm64
```

For a release APK and Google Play App Bundle:

```bash
npm run android:release
```

The app explicitly keeps Tauri's minimum Android API at 24 (Android 7.0), builds all four Tauri Android targets by default, and packages the universal release APK/AAB. For a smaller production APK for an arm64 phone:

```bash
npm run android:release:arm64
```

The Play App Bundle is the preferred production distribution because Google Play serves the correct ABI instead of shipping every architecture to every device.

The Android system back gesture/button is handled as app navigation: from Notes, Habits, Library, or a detail screen it returns to Today; pressing it again on Today lets Android close/minimize the activity.

The local release outputs are unsigned by design until a production keystore is configured. The debug APK is signed for local installation; never use a debug key for a store release.

## Current MVP

- Today: next video, overall completion, review queue, reminder summary, and one first-unfinished daily goal when a checklist exists.
- Daily tasks: opt into a fresh checklist each day, add as many tasks or goals as needed, mark them complete at any time, and keep previous days out of Today while retaining their completion history.
- Tasks: manage today’s checklist from the bottom navigation and view completed-task totals, current/best streaks, and daily history. Android schedules the remaining six-hour check-in points for the current day, cancelling them when the checklist is complete.
- Library: groups are containers, not filters. Grouped resources appear only inside their group; the root shows groups and ungrouped resources. Searching a grouped resource reveals its group rather than a duplicate resource row.
- Organization: press and hold a resource (or use **Move to group**) to search existing groups or create one and move the resource in a single step. Names differing only in capitalization, Unicode compatibility forms, or extra spaces reuse the existing group. Similar names are suggestions, not automatic merges. Playlists can be grouped too.
- Add resources: import a playlist, attach a PDF without copying it into the app, or add research papers/blogs. Groups are created from the item you are organizing, not from a separate add tab.
- Playlist detail: separate Watch action, labelled pending / complete / review controls, Add/Edit note for every video, and add/remove chapter controls for individual YouTube URLs.
- Reading detail: open a PDF or source link externally, save page/percentage progress, move an item between groups, and keep a literature review for research papers.
- Habits: all playlists and reading items are listed, each with typed hour/minute/AM-PM time, daily/weekly/monthly/custom weekday repeats, pause, and removal; All learning is optional and independent.
- Notes: open a per-video or per-reading-item editor, edit, save, or delete with confirmation.
- Local SQLite storage: no account, cloud database, or sync service; playlist imports use a public metadata proxy.
- App identity: a quiet espresso/ivory bat mark is used for the Android launcher and the in-app brand.

PDFs are never copied into Affleck. Android selects them with `ACTION_OPEN_DOCUMENT` and retains read permission for the original `content://` reference across restarts. **Open PDF** uses an Android `ACTION_VIEW` chooser with PDF MIME type and a temporary read grant for the chosen reader. Missing files, expired permissions, and missing readers produce actionable errors.

PDFs attached by older builds used temporary browser URLs. Open the existing item and choose **Reattach PDF** once after updating; progress, notes, reminders, and group membership stay unchanged. Browser/desktop previews still use session-only file references and require reattachment after restart.

Playlist import retrieves the title, channel, ordered videos, links, and durations through public Invidious playlist endpoints before saving metadata locally. The importer automatically tries the next configured instance when one is unavailable. Private playlists are intentionally out of scope for this local-first MVP.

## Mobile fixes and regression checks

```bash
npm test
npm run build
npm run android:debug
npm run android:release
```

Debug package: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.
Production packages are written under `src-tauri/gen/android/app/build/outputs/apk/` and `src-tauri/gen/android/app/build/outputs/bundle/`.
The current verified universal sizes are approximately 57 MiB for debug, 36 MiB for the unsigned release APK, and 32 MiB for the unsigned App Bundle; the earlier 900 MB debug size came from unstripped Rust symbols.
Install it over the existing debug installation, without uninstalling or clearing storage. Earlier builds could silently fall back to WebView localStorage because SQLite write permission was absent; the update merges those missing records into SQLite once and keeps the old snapshot as a recovery copy. SQLite initialization failures now show an error instead of silently switching databases.

Install with USB debugging enabled, after accepting the computer authorization prompt:

```bash
adb devices
adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
```

Do not uninstall or clear storage to update. If signing keys differ, stop and preserve your data rather than uninstalling. See `docs/grouping-pdf-update.md` for the new checks and remaining phone-level checklist; `docs/mobile-fixes.md` covers the earlier fixes. Release artifacts and older split APKs are not refreshed by the universal debug build.
