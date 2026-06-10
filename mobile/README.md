# StaffPass OCR Hub Mobile

Standalone Android implementation for StaffPass OCR Hub. It is a mobile-native Expo app, not an Electron wrapper.

## Status

- Local-first Android app shell is implemented under `mobile/`.
- Capture/import, review, local SQLite records, search, and CSV export are implemented.
- Native offline OCR is fully implemented using Google ML Kit Text Recognition with regex-based field parsing for Emirates IDs and Passports.
- Strict TypeScript is enabled in `tsconfig.json`.
- APK builds are for direct install/internal testing. Play Store release should use the AAB profile.

## Verification Baseline

Last checked on 2026-06-10:

```bash
npm run test
npm run typecheck
```

Both commands passed from the `mobile/` directory via root-prefixed commands.

## Commands

```bash
npm install
npm run start
npm run typecheck
npm run test
npm run doctor
npx eas-cli@latest init
npm run build:android:apk
npm run build:android:aab
```

## Release Profiles

- `development`: internal development APK with dev client.
- `preview-apk`: direct-install APK for testers.
- `production-aab`: Android App Bundle for Google Play tracks.

Expo/EAS can manage Android signing credentials. Do not commit keystores, service account files, or APK/AAB outputs.

## Session Learnings

- Run `npx eas-cli@latest init` once before non-interactive APK/AAB builds; otherwise EAS stops with "EAS project not configured."
- The build scripts intentionally call `npx eas-cli@latest` so they do not depend on an older globally installed `eas-cli`.
- Expo SDK 56 rejects direct `@react-navigation/*` dependencies alongside Expo Router; keep tab/stack navigation through `expo-router`.
- Expo SDK 56 uses the new `expo-file-system` `File`/`Paths` API for CSV writes.
- The `uuid` override keeps Expo build tooling clear of the current transitive audit advisory without forcing a breaking package downgrade.
- Sideloaded APKs distributed outside the Play Store must package Google ML Kit dependencies using the Bundled version (`com.google.mlkit:text-recognition`) to avoid dynamic download failures on offline/air-gapped devices or devices lacking Google Play Services.
- Decoupling native React Native dependencies from pure business logic helpers (like regex/heuristics parsing) enables 100% test coverage using standard Node.js test runners without requiring a native mobile environment compiler like Metro.
- Skip React Native Directory architecture compatibility checks in `expo-doctor` by excluding specific libraries in `package.json`'s `expo.doctor.reactNativeDirectoryCheck.exclude` property.
