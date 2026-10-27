# Contributing to Affleck

Thanks for your interest in helping improve Affleck. Affleck is a local-first learning journal built with React, Vite, Tauri 2, SQLite, and Android support.

## Before you start

Please check the existing documentation and search open issues before beginning larger changes. For significant product or data-model changes, open an issue first so the approach can be discussed.

## Development setup

Requirements:

- Node.js and npm
- Rust and the Tauri prerequisites for desktop development
- Android Studio, Android SDK/platform tools, NDK, and Rust Android targets for Android work

Install dependencies and start the web preview:

```bash
npm install
npm run dev
```

The browser preview uses `localStorage` as a development fallback. The Tauri app uses the local SQLite database. No account, cloud database, or authentication is required for local development.

## Useful commands

```bash
npm test                 # Run the test suite
npm run build            # Type-check and build the web app
npm run tauri dev        # Run the desktop shell
npm run android:debug    # Build the universal Android debug APK
npm run android:release  # Build the release APK and App Bundle
```

Android build outputs are written below `src-tauri/gen/android/app/build/outputs/`. The universal debug APK is at:

```text
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Install a debug build on a connected device with:

```bash
adb install -r "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
```

## Making changes

1. Create a focused branch from `master`.
2. Keep changes small and consistent with the existing UI, TypeScript, and storage patterns.
3. Update related documentation when behavior or build instructions change.
4. Add or update meaningful tests for new behavior and bug fixes.
5. Run `npm test`, `npm run build`, and any relevant Android checks before opening a pull request.

Do not commit generated build artifacts, local databases, credentials, or private configuration. Do not change the SQLite schema without considering migrations and the localStorage fallback behavior.

## Pull requests

Pull requests should include:

- A short summary of the problem and solution
- The checks and tests that were run
- Screenshots or a short recording for visible UI changes
- Notes about Android-specific behavior when applicable

Use a clear, conventional commit style such as `feat:`, `fix:`, `docs:`, `test:`, or `chore:`. Keep unrelated refactors out of a focused change.

## Reporting issues

When reporting a bug, include the platform, app version or commit, steps to reproduce, expected behavior, actual behavior, and relevant logs or screenshots. For Android issues, include the device model and Android version when available.
