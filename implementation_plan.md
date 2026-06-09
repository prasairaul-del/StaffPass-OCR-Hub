# Implementation Plan: App Improvements (Subagent Driven)

This implementation plan details the tasks required to add modular codebase, UI/UX, sidecar, and mobile app improvements. Each task is executed by an Implementer subagent and verified by Spec and Quality Reviewer subagents.

---

## 1. Task Checklist

| Priority | Task Description | Target File | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 🔴 **Critical** | Implement SQLite transactions for reviews | `database.js` | ⏳ Pending | Wrap updates inside transactions. |
| 🔴 **Critical** | Add UI error boundaries | `renderer.js` | ⏳ Pending | Catch unhandled promises. |
| 🔴 **Critical** | Enable strict TypeScript | `mobile/tsconfig.json` | ⏳ Pending | Set `strict: true`. |
| 🟠 **High** | Create drag-and-drop overlay | `index.html` / `renderer/events.js` | ⏳ Pending | Listen to drag states. |
| 🟠 **High** | Update confidence badges | `renderer/review.js` | ⏳ Pending | Add check/warn/cross styles. |
| 🟠 **High** | Refine Slate HSL styling | `index.css` | ⏳ Pending | Glows and active row borders. |
| 🟠 **High** | Implement sidecar auto-restart | `sidecar_bridge.js` | ⏳ Pending | Recover dead python process. |
| 🟠 **High** | Add IPC schema validation | `sidecar_bridge.js` & `sidecar/ocr_sidecar.py` | ⏳ Pending | Validate JSON action formats. |
| 🟢 **Low** | Mobile linter config | `mobile/package.json` | ⏳ Pending | Set ESLint environment. |

---

## 2. Technical Steps

### Step 1: Database helpers & Error boundaries
- Wrap database edits in transactions.
- Catch unhandled rejections in renderer.
- Configure TypeScript compiler strictness.

### Step 2: UI/UX redesign elements
- Insert overlay div in HTML and control display in events.js.
- Create helper mapping confidence scores to formatted HTML badges.
- Style row outlines, glows, and theme colors.

### Step 3: Sidecar and Mobile settings
- Re-spawn child in bridge stderr/exit handler.
- Verify schema in Node child process interface and Python main loop.
- Install ESLint configuration.

---

## 3. Verification Plan

1. **Unit Tests**: Propose and run mocha tests validating transactions and auto-restart behavior.
2. **Manual check**: Verify overlay display on drag-and-drop and confirm sidecar re-spawns successfully on mock crash.
