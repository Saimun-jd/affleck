# Android usability corrections — October 24, 2026

## Findings and changes

1. `MainActivity.kt` enabled edge-to-edge drawing but did not apply window insets. It now pads the content root with system-bar/cutout/keyboard insets and consumes them. The activity uses `adjustResize`; overlays and notes share the resized WebView.
2. Video status controls were tiny icons inside a clickable playback row. `VideoCard.tsx` separates playback, labelled status buttons and Add/Edit note. Selected status is exposed with `aria-pressed`; writes are awaited and errors shown.
3. Notes were an inline side panel with no deletion. `NoteEditor.tsx` uses a native HTML modal dialog, tied to the chosen video. Save/edit/delete affect that video only. Delete and discard require explicit confirmation; failed writes retain text.
4. Habits always edited `reminders[0]`. `HabitsView.tsx` lists the full current library and loads the chosen playlist's schedule. Each target has a stable reminder record and distinct notification ID. General reminders do not replace individual ones. Returning to the app or entering Habits reloads saved data.
5. `sql:default` did not permit writes. Added `sql:allow-execute`, removed silent native fallback, and serialized initialization. Legacy fallback records are merged by ID into SQLite once; existing SQLite records win conflicts. The original localStorage snapshot is retained. No reinstall/data reset is required.

## Verified

- `npm test`: 9 passing regression tests across rendered UI and real in-memory SQLite (native bridge and notifications mocked).
- `npm run build`: TypeScript and production frontend build passed.
- `cargo check` from `src-tauri`: passed.
- `npm run tauri android build -- --debug --apk --split-per-abi --target aarch64`: passed, including the changed Kotlin activity.
- `apksigner verify --verbose`: updated ARM64 debug APK verifies with signature scheme v2.
- Browser preview rendered the labelled video controls. Further manual browser interaction was inconclusive due to browser-control failure/changing page state; automated UI checks above passed.

Updated APK: `src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk`.
Other previously generated APK/AAB outputs are older and should not be used to test this change.

## Device checks still required

No device was attached during this change. These are not claimed as passed:

- Update the existing app without uninstalling; confirm imported playlists, notes and statuses survive.
- Check header and bottom navigation with gesture navigation and three-button navigation, portrait/landscape, and a display cutout.
- Open a video note, show the keyboard, type multiple lines, save, reopen, edit, cancel deletion, then confirm deletion. Other videos' notes must remain unchanged.
- Mark a video Pending/Complete/Review; no playback should launch and completion percentage must update.
- Import a new playlist, open Habits, and find it in the list immediately.
- Set different daily/weekly times for two playlists. Relaunch and confirm both remain. Edit/pause one and confirm the other's alarm remains.
- Deny notification permission: the saved preference must display a warning instead of claiming successful scheduling. Grant permission and save again.
- Test actual notification delivery while backgrounded, after restart, and after timezone changes. Android/OEM battery policy and installed plugin scheduling behavior require device verification.

## Scope preserved

No SDK reinstallation, project regeneration, new importer provider, private credentials, release signing changes, or user-data clearing. No physical-device verification or new release/universal package was performed.
