# Implementation Plan: App Improvements (Subagent Driven)

Status: Reconciled with current code on 2026-06-10.

This plan tracks the app-improvement wave originally designed in `docs/superpowers/specs/2026-06-09-app-improvements-design.md`. The implementation has landed; this file now records verified status and remaining planning targets before any new engineering work.

---

## 1. Completed Task Checklist

| Priority | Task Description | Target File(s) | Status | Verification |
| :--- | :--- | :--- | :--- | :--- |
| Critical | Implement SQLite transactions for reviews | `database.js` | Complete | `tests/database.test.js` rollback coverage |
| Critical | Add renderer error handling | `renderer.js` | Complete | `tests/renderer.test.js` unhandled error/rejection coverage |
| Critical | Enable strict TypeScript | `mobile/tsconfig.json` | Complete | `npm --prefix mobile run typecheck` |
| High | Create drag-and-drop overlay | `index.html`, `renderer/events.js` | Complete | `tests/renderer.test.js` drag/drop coverage |
| High | Update confidence badges | `renderer/dom.js`, `renderer/review.js`, `renderer/queue.js` | Complete | `tests/renderer.test.js` badge coverage |
| High | Refine Slate HSL styling | `index.css` | Complete | Desktop UI styles present; automated visual check not run in this pass |
| High | Implement sidecar auto-restart | `sidecar_bridge.js` | Complete | `tests/sidecar_bridge.test.js` auto-restart coverage |
| High | Add sidecar payload validation | `sidecar_bridge.js`, `sidecar/ocr_sidecar.py` | Complete | JS-side validation test plus Python entry validation present |
| Low | Mobile linter config | `mobile/package.json` | Complete | `npm --prefix mobile run typecheck`; lint script configured |

---

## 2. Verification Baseline

Last verified on 2026-06-10:

| Command | Result |
| :--- | :--- |
| `rtk npm test` | Passed |
| `rtk npm --prefix mobile test` | Passed |
| `rtk npm --prefix mobile run typecheck` | Passed |
| `rtk npm run validate:release-config` | Passed |
| `rtk npm run validate:smoke` | Passed |
| `rtk npm run validate:release` | Expected signing-gate failure only; release config and artifacts passed |

---

## 3. Current Architecture Notes

- Desktop runtime is Electron with context isolation, sandboxing, named IPC, and local SQLite persistence.
- OCR runs through `sidecar_bridge.js` and `sidecar/ocr_sidecar.py` using stdin/stdout JSON.
- Mobile runtime is a standalone Expo Android app using `expo-sqlite` and offline ML Kit text recognition.
- Release flow is split into unsigned smoke builds, unsigned local installer builds, and cert-gated production release builds.
- Release artifact sync copies the generated NSIS installer and blockmap to the updater asset names referenced by `latest.yml`.
- Production release validation is clean for config/artifacts and remains intentionally gated on real Windows signing credentials.

---

## 4. Remaining Planning Targets

| Priority | Target | Reason |
| :--- | :--- | :--- |
| High | Manual UI smoke pass | Automated renderer tests cover behavior, but drag overlay and visual polish still need a live Electron smoke check. |
| Medium | Documentation encoding cleanup | Several historical Markdown files contain mojibake from earlier Unicode box/icon characters. |
| Medium | Staff deduplication plan | Blueprint still calls out duplicate matching as a future product capability. |
| Medium | Archive/quarantine workflow plan | Blueprint describes archival modes that are not yet fully implemented as production workflow. |

---

## 5. Next Planning Rule

Before adding new features, run:

```bash
rtk npm test
rtk npm --prefix mobile test
rtk npm --prefix mobile run typecheck
rtk npm run validate:release-config
rtk npm run validate:smoke
```

Then choose one explicit target: UI smoke, deduplication, archive workflow, or docs polish.
