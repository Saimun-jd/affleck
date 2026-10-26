# Affleck implementation decisions

## Product slice

The first build started with YouTube playlists only. The expanded slice keeps playlists as a separate legacy flow and adds a lightweight reading model: a PDF, research paper, or blog is a single learning item with progress, reminders, and one saved note. Research papers also expose an optional literature review field.

## Stack

- Tauri 2 for the Android-capable shell.
- React + TypeScript + Vite for the mobile-first interface.
- `tauri-plugin-sql` with SQLite for the native local database.
- `tauri-plugin-notification` for local daily or weekly reminders.
- `tauri-plugin-opener` to hand video URLs to YouTube or the system browser.

## Data model

The SQLite tables are `playlists`, `videos`, `notes`, `reminders`, `groups`, `resources`, and `resource_notes`. PDFs are not copied into SQLite; only metadata, a device document reference, and study progress are saved. Both resources and playlists can have a group ID. Existing playlist databases gain the nullable group column without recreating their records.

Library groups are containers: members are not duplicated at the root. Long-press and the accessible Move to group action open the same search/create picker. Case/whitespace-equivalent names reuse a group; similar names are shown for the user to choose. The existing serif/ivory/ochre design is retained.

Android PDFs use a local Tauri/Kotlin bridge (`src-tauri/src/documents.rs` and `DocumentsPlugin.kt`), the system document picker with persistable read permission, and an explicit PDF reader chooser. Older blob references require one-time reattachment; this updates only the file reference/name, never the learning data. No storage service or PDF reader is embedded.

## Import boundary

The add flow accepts a public YouTube playlist URL. `src/lib/youtube.ts` extracts the playlist ID, paginates public Invidious playlist responses, and writes only playlist/video metadata and links to SQLite. It tries several configured instances so users do not need a YouTube account or API key. Private playlists are out of scope; use a self-hosted instance when the import service must be controlled or reliable.

## Design system

Affleck uses warm ivory, espresso type, muted ochre, thin borders, editorial spacing, and restrained shadows. Serif display type (`Fraunces`) is paired with `DM Sans` for controls. Paper grain is limited to feature surfaces and the habit card so the UI remains practical.

## Android build choices

- `minSdkVersion` is explicitly 24, matching Tauri's Android floor and covering Android 7.0+.
- The generated project builds `aarch64`, `armv7`, `i686`, and `x86_64` targets. The first two cover physical ARM phones; the x86 targets cover common emulators and older Intel devices.
- Release builds use HTTPS-only network access; debug builds allow the generated development cleartext setting.
- Android project generation is complete under `src-tauri/gen/android`.

## Android verification snapshot

The current workspace has been verified with Android SDK Platform 36, compile/target SDK 37, Build Tools 36.1.0, NDK 28.2.13676358, Android Studio JBR Java 21, all four Rust Android targets, and Gradle 9.6.1. No emulator or physical device was connected during verification, so install/startup still needs one real-device or emulator smoke test.

Verified artifacts:

- `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` — debug-signed and verified with APK Signature Scheme v2.
- `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` — universal release APK, unsigned until production signing is configured.
- `src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab` — universal release App Bundle, unsigned until production signing is configured.
