# Group organization and Android PDF update

## Behavior

- Library shows group containers and ungrouped items. Members appear only after opening a group. Searching a member from the root shows its containing group.
- Hold a resource title for 550 ms, right-click it, or use Move to group. Scrolling, moving the pointer more than 10 px, cancellation, and unmounting cancel pending holds. The hold's click does not open the item underneath the picker.
- Search/select an existing group or create and assign together. Case and whitespace differences reuse a group. Partial name matches are suggestions; distinct names are not silently merged. Remove from group returns the item to the library root.
- Resources and playlists share this organization flow. Notes and reminders retain their own independent views.
- Android PDF attachment returns a persistent `content://` URI and display name, not a copy or browser blob. The native reader chooser receives PDF MIME type, ClipData, and read permission.
- Reattach PDF repairs old attachments or unavailable references without losing progress, notes, reminders, or grouping. Browser preview file references last only for the current session.
- Groups, playlists, chapters, and reading resources can be removed with confirmation. Removing a group keeps its members and returns them to the root; removing a playlist removes its chapters and notes; removing a resource removes its notes and item-specific reminder.
- Playlist detail can add one individual YouTube video by URL and remove any chapter. Chapter positions are renumbered after deletion.
- Reminder time is entered as hour, minute, and AM/PM. Repeat supports daily, weekly, monthly, or selected weekdays, with a remove-reminder action.
- Long titles wrap inside their layout containers, horizontal overflow is clipped, and the viewport disables pinch zoom for the touch UI.

## Automated verification

- `npm test`: regression coverage includes folder visibility/search/back navigation, group creation/reuse/removal, playlist grouping, playlist chapter add/remove, resource removal, hold cancellation/click suppression, PDF picker cancellation, native opener dispatch/errors, reattachment preservation, custom reminder days/removal, SQLite reopen, and legacy playlist schema migration.
- `npm run build`: TypeScript and frontend production compilation.
- `npm run android:debug`: Kotlin bridge and all four Rust Android architectures, packaged as a universal debug APK.
- `apksigner verify --verbose`: debug APK signature verification.
- Browser smoke test: created a group through Move to group, verified the root contains only the group, then opened it and verified the resource is inside. Fixed the dialog's initial focus so typing starts in the search field rather than activating Close.

The PDF UI/bridge-dispatch tests mock native callbacks. They do not prove a third-party Android reader opened a document. No updated APK was installed on the user's connected phone during this task, and no local emulator is configured.

## Install and device checklist

From the workspace root, with USB debugging enabled and authorized:

```bash
adb devices
adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
```

1. Update without uninstalling or clearing data. Existing notes/progress/reminders must remain.
2. Add resources → PDF → Choose PDF. Select a local document and save.
3. Open its detail → Open PDF. Confirm Android offers the installed PDF readers and the chosen reader can read it.
4. Close/restart Affleck and repeat Open PDF. Access should persist without reselecting the document.
5. For a PDF saved in the older build, use Reattach PDF once, then confirm its old progress/note and new reader access.
6. Cancel the document picker: no empty item or error should be saved.
7. Hold an item, choose/create a group, and confirm the item disappears from the root and exists only inside the group. Repeat with capitalization/spacing differences; no duplicate group should appear.
8. Scroll over item titles: no accidental group picker. Move an item to another group or remove it, reopen the app, and confirm membership persists.
9. Try an unavailable file or a device without a PDF reader: an explanatory error should appear, not a silent failure.

The universal debug APK is for local testing, not store distribution. Older release/split artifacts may be stale.
