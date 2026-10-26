---
name: click-path-audit
description: Trace every state write behind a button or control. Use when the UI does the wrong thing (or nothing) yet every function it calls works alone, or before merging changes to a Zustand store, a TanStack Query mutation or key, a shared context, or a useEffect that copies fetched data into local state.
---

# click-path-audit — does the final state match the label?

Unit tests and `debugging` check each function. They do not check that **function B silently undoes
function A**. A "New note" button that calls `setEditorOpen(true)` then `selectNote(null)` does
nothing if `selectNote` also resets `editorOpen: false`. Both functions pass their tests. The button
is dead. This skill finds that class of bug by tracing writes, in order, against shared state.

Run it in two places:
- **`debugging`**, when the bug is "the UI does the wrong thing but every function works."
- **`review`**, on any diff that touches shared client state: a store action, a mutation's
  `onMutate` / `onSuccess` / `onError` / `onSettled`, a query key, a context provider, a syncing effect.

## Step 1 — map the writers (shared context for everything else)
For each store / cache / context in scope, list every action and what it **sets** and what it
**resets that it does not own**:
```
STORE useNotesStore
  selectNote(id|null) → sets {selectedId, body}  RESETS {editorOpen:false, pendingTitle:null}  ← owns neither
QUERY ['notes', filter]
  useArchive.onMutate   → cancelQueries? NO   setQueryData(['notes', filter]) removes row
  useArchive.onSettled  → invalidateQueries({ queryKey: ['notes'] })  (stale if the server resolves before the write is readable)
```
Map **effects that re-assert state** too (auto-select the first row, reset on selection change,
mirror a query into `useState`): they are writers, and the highest-yield ones. The dangerous rows are
resets of fields owned by someone else, cache writes without a matching `cancelQueries`, and effects
that write back what a handler just changed. Without this map the bug is invisible.

## Step 2 — trace each touchpoint
For every button, toggle, form submit, keyboard shortcut and drag target in scope:
```
TOUCHPOINT  "Archive" in NoteRow
  call 1  archive.mutate(id)        reads {notes cache}  writes {notes cache: row removed}  side effect: POST
  call 2  selectNote(null)        writes {selectedId:null}  RESETS {editorOpen}             ← undoes? no
  async   onSettled → invalidate    refetch may return the row again before the POST commits    ← RACE
  EXPECTED  row gone, stays gone
  ACTUAL    row flickers back on slow networks
```
For each call: **what it reads, what it writes, its side effects, and does a later call undo an
earlier one?** Then: is the **final** state what the label promises? Can async work resolve in an
order that changes the answer? The six patterns, with our stack's versions, are in `@patterns.md`.

## Step 3 — report
```
CLICK-PATH-001  [Critical|High|Medium|Low]
  Touchpoint   "<label>" in <file:line>
  Pattern      <Sequential undo | Async race | Stale closure | Missing transition | Conditional dead path | Effect interference>
  Trace        1. <call> → sets {…}   2. <call> → RESETS {…}  ← conflict
  Expected     <what the label promises>
  Actual       <what happens>
  Fix          <specific change>   Test  <the assertion that would have caught it>
```
Every finding gets a test that asserts the **final state after the whole handler**, not each call.
End with `## CLICK-PATH CLEAN` or `## CLICK-PATH FINDINGS (n)`.

## Scope
- **One flow** after a "button does nothing" report: its touchpoints + the stores they reach.
- **One store or hook** after changing it: every consumer of the changed action or key.
- **Whole app** before a launch: Step 1 first (one agent), then one agent per page, each given the map.

Not for API bugs (wrong response shape: `debugging`), layout (`frontend-ui`), or speed (`performance`).
