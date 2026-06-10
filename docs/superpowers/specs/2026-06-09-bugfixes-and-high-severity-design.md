# StaffPass OCR Hub — Bugfixes & High-Severity Fixes Spec

**Date**: 2026-06-09
**Status**: Implemented
**Approach**: Subagent-driven — Orchestrator dispatches Implementer agents

---

## Verification Status

Rechecked on 2026-06-10:

| Command | Result |
|---|---|
| `rtk npm test` | Passed |
| `rtk npm --prefix mobile test` | Passed |
| `rtk npm --prefix mobile run typecheck` | Passed |

This file is historical implementation evidence. New planning should use `implementation_plan.md` as the current status source.

---

## Fix 1 — `compareVersions` undefined (🔴 Critical)
- **File**: `renderer.js`
- **Action**: Add `compareVersions(a, b)` function. Splits on `.`, compares numeric segments L→R. Returns `1` (a>b), `-1` (a<b), `0` (equal).
- **Grouped with**: Fix 3 (renderer split) and Fix 5 (dead code removal).

## Fix 2 — Adapter response shape mismatch (🔴 Critical)
- **File**: `sidecar/mock_adapter.py`
- **Action**: Update `MockAdapter.extract_metadata()` to return envelope format: `{ok: True, degraded: False, engine: "mock", warnings: [], data: {...}}`.

## Fix 3 — Split `renderer.js` into ES modules (🟠 High)
- **Files**: `renderer.js` → `renderer/*.js` + `index.html`
- **Action**: Convert `<script src>` to `<script type="module">`. Extract 7 modules: `state.js`, `utils.js`, `dom.js`, `queue.js`, `ocr.js`, `review.js`, `overlays.js`. Main `renderer.js` becomes thin orchestrator. Update `module.exports` to ES `export` for test compatibility.

## Fix 4 — Integrate `pdf_preview.py` into sidecar loop (🟠 High)
- **Files**: `sidecar/ocr_sidecar.py`, `sidecar_bridge.js`
- **Action**: Add `"preview"` action to sidecar main loop dispatching to `pdf_preview.render_first_page()`. Update bridge to use persistent sidecar for previews instead of inline Python spawn.

## Fix 5 — Remove dead code (🟠 High)
- **File**: `renderer.js`
- **Action**: Delete unused `downloadModel()` function, duplicate `escapeCsvValue`/`recordsToCsv`. Kept in `main.js` where export runs.
- **Grouped with**: Fix 3 (renderer split).

## Fix 6 — Validate `file_path` in sidecar entry (🟠 High)
- **File**: `sidecar/ocr_sidecar.py`
- **Action**: Add null/empty/existence check before calling adapter methods. Return structured error if invalid.

## Fix 7 — Fix `_clean_and_parse_json` colon splitting (🟠 High)
- **File**: `sidecar/glmocr_adapter.py`
- **Action**: Replace `split(":")` with `split(":", 1)` to handle values containing colons.

## Fix 8 — Async file read in main process (🟠 High)
- **File**: `main.js`
- **Action**: Replace `fs.readFileSync` with `await fs.promises.readFile` in `documents:readAsBase64` handler.

---

## Implementation Grouping (Parallel Subagents)

| Agent | Fixes | Files touched |
|-------|-------|---------------|
| **Sidecar Fixer** | 2, 4, 6, 7 | mock_adapter.py, ocr_sidecar.py, glmocr_adapter.py, sidecar_bridge.js |
| **Main Process Fixer** | 8 | main.js |
| **Renderer Refactorer** | 1, 3, 5 | renderer.js → renderer/*.js, index.html |

No file conflicts between agents — safe for parallel execution.
