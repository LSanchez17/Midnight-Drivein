# 0007 — Settings Wiring

## Status
Draft

## Summary
This spec wires the Settings page end-to-end: from the native folder picker through the
API layer, through persistent SQLite storage, and back to the UI on next launch.

**Acceptance criteria:** Launch app → open Settings → choose folder → path saves →
restart app → path is still there.

**Scope:**
- `moviesFolder`, `segmentsFolder`, and `scanOnStartup` are the three settings exposed this phase.
- `theme` is persisted by the DB layer (already done) but has no UI control yet.
- Library scan triggering is _not_ in scope — the Rescan Library button remains a stub pending spec 0008.

---

## New infrastructure: native folder picker

The folder picker is **not** a Rust command. It is provided by the official
`tauri-plugin-dialog` plugin and called directly from TypeScript via
`@tauri-apps/plugin-dialog`.

### Installation

**Rust** (`src-tauri/Cargo.toml`):
```toml
tauri-plugin-dialog = "2"
```

**TypeScript** (`package.json`):
```
@tauri-apps/plugin-dialog
```

**Plugin registration** (`src-tauri/src/lib.rs`):
```rust
.plugin(tauri_plugin_dialog::init())
```

**Capability** (`src-tauri/capabilities/default.json`):
```json
"dialog:default"
```
added to the `permissions` array.

---

## API layer additions

### `selectLibraryRoot`

TypeScript-only helper. Calls the dialog plugin, does **not** invoke a Rust command.

```ts
// src/api/_tauri.ts
async function selectLibraryRoot(): Promise<string | null>
```

| Return value | Meaning |
|---|---|
| `string` | Absolute path the user selected |
| `null` | User cancelled — caller should do nothing |

Throws `ApiError('UNKNOWN', ...)` if the dialog plugin itself rejects.

**Mock** (`src/api/_mock.ts`): returns `'/mock/movies'` unconditionally (simulates a
successful pick with no native UI).

### No changes to Rust commands

`get_settings` and `save_settings` (Phase 1 of spec 0006) already cover everything
needed. No new Rust commands are introduced in this spec.

---

## Settings context — startup hydration

A new React context loads settings once at startup and makes them available to any
consumer without prop-drilling.

**File:** `src/context/SettingsContext.tsx`

```ts
interface SettingsContextValue {
  settings: AppSettings | null
  isLoading: boolean
  error: ApiError | null
  reloadSettings: () => void
}
```

- `getSettings()` is called once on mount.
- `reloadSettings()` re-fetches and updates the context; called by `SettingsPage` after
  every successful save.
- `isLoading` is `true` only during the initial fetch (and subsequent reloads).
- The provider renders its children immediately — no blocking gate. Pages that depend on
  settings should handle `isLoading` and `error` states locally.

**Placement:** `<SettingsProvider>` wraps the full app tree in `src/main.tsx`, outside
`<BrowserRouter>`.

---

## Settings page behaviour

`src/pages/SettingsPage.tsx` is rewritten to consume `SettingsContext`.

### Loading state

While `isLoading` is true, the folder path fields show a skeleton / dimmed placeholder.
The Choose Folder buttons are disabled.

### Folder rows (Movies Folder, Segments Folder)

| State | TextInput value | Button label | Button state |
|---|---|---|---|
| `null` (never set) | empty, placeholder text | Choose Folder | enabled |
| path set | absolute path string | Change Folder | enabled |
| `isLoading` | dimmed current value | Choose Folder / Change Folder | disabled |

**Choose / Change Folder flow:**

1. Call `selectLibraryRoot()`.
2. If result is `null` (cancelled) → do nothing.
3. If result is a string → call `saveSettings({ moviesFolder: path })` (or `segmentsFolder`).
4. On success → call `reloadSettings()`. The field updates from context.
5. On error → display error message inline below the field. Cleared on next successful action.

**Clear path:** Not in scope for this phase. Use `Change Folder` to replace it.

### Scan on Startup toggle

A checkbox beneath the folder rows, labelled "Scan library on startup".

- Checked state mirrors `settings.scanOnStartup`.
- `onChange` → calls `saveSettings({ scanOnStartup: checked })` → `reloadSettings()`.
- Inline error shown below the toggle on failure.

### Rescan Library button

Remains visible. Disabled with a tooltip "Configure both folders first" when either
`moviesFolder` or `segmentsFolder` is `null`. When both folders are set it becomes
enabled but clicking it is a no-op stub until spec 0008 (scan events). No error is
thrown — the button simply does nothing yet.

### Error display

Each of the three controls (movies folder, segments folder, scan toggle) has its own
independent inline error state — a small `<p>` rendered below it in `#f87171` (danger
red). Errors are cleared on the next successful interaction for that control.

---

## Startup flow

```
main.tsx renders <SettingsProvider>
  └─ SettingsProvider mounts → calls getSettings() → stores result in context
       └─ AppShell / SettingsPage renders
            └─ SettingsPage reads context: isLoading? show skeleton : show values
```

No blocking splash screen. The rest of the app (Library page etc.) is not gated on
settings loading.

---

## File changes

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-dialog = "2"` dependency |
| `src-tauri/src/lib.rs` | `.plugin(tauri_plugin_dialog::init())` in builder chain |
| `src-tauri/capabilities/default.json` | Add `"dialog:default"` to `permissions` |
| `package.json` | Add `@tauri-apps/plugin-dialog` |
| `src/api/_tauri.ts` | Add `selectLibraryRoot()` |
| `src/api/_mock.ts` | Add `selectLibraryRoot()` stub returning `'/mock/movies'` |
| `src/context/SettingsContext.tsx` | **New** — provider + hook |
| `src/main.tsx` | Wrap tree with `<SettingsProvider>` |
| `src/pages/SettingsPage.tsx` | Full rewrite — consumes context, wires folder picker and toggle |

---

## Out of scope

| Topic | Deferred to |
|---|---|
| Library scan execution and progress events | Spec 0008 |
| Validating that selected paths are accessible / correct file types | Spec 0008 (scan validates at run time) |
| Theme selector UI | TBD |
| Import / Export metadata actions | TBD |
| Vitest tests for `SettingsPage` (React component tests) | TBD — no component test pattern established yet |

---

## Verification checklist

| # | Check | How |
|---|---|---|
| 1 | Rust compiles cleanly | `cargo check` in `src-tauri/` |
| 2 | TypeScript compiles cleanly | `yarn tsc --noEmit` |
| 3 | Existing tests still pass | `yarn test` (28 tests) and `cargo test` (15 tests) |
| 4 | Path persists across restart | `yarn tauri dev` → Settings → Choose Folder → pick real dir → restart → path still shown |
| 5 | Cancel does nothing | Open picker → press Cancel → field unchanged, no error |
| 6 | Toggle persists | Check Scan on Startup → navigate away → return to Settings → checkbox still checked |
| 7 | Null both folders → Rescan disabled | Leave folders unset → confirm Rescan Library button is disabled |

---

## Key decisions

| Question | Decision |
|---|---|
| Who calls the dialog plugin? | TypeScript — `@tauri-apps/plugin-dialog`, not a Rust command |
| Save trigger | Auto-save on pick / toggle change — no explicit Save button |
| Cancel behaviour | No-op — existing value preserved, no error shown |
| Error display | Inline, per-control — no toasts or banners |
| Context placement | Wraps full app tree; does not block render |
| `theme` UI | Stored but not exposed in UI this phase |
