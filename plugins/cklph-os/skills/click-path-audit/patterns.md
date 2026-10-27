# click-path-audit — the six patterns, in our stack

Each pattern: the shape, then where it hides in React + Zustand + TanStack Query.

## 1. Sequential undo
A later call resets what an earlier call set.
```ts
onClick={() => {
  useNotes.getState().setEditorOpen(true);   // editorOpen = true
  useNotes.getState().selectNote(null);     // action body also does editorOpen: false
}}
```
- **Zustand:** an action that "cleans up" with a broad `set({...})` literal, resetting fields that
  another action owns. Grep each action for keys it does not mention in its name.
- **React state:** `setForm(initial)` called after `setForm(f => ({...f, x}))` in the same handler.
- **Fix:** the resetting action stops owning that field, or the handler calls the setter **last**.
  Better: one action that does the whole transition (`openEditor()`), so order can't be wrong.

## 2. Async race
Two async results write the same state; the last to resolve wins, not the last to start.
- **TanStack Query optimistic update without `cancelQueries`:** `onMutate` writes the cache, an
  in-flight refetch lands a moment later with pre-mutation server data and overwrites it. The item
  "flips back." Always `await queryClient.cancelQueries({ queryKey })` before `setQueryData`.
- **Invalidate before the data is visible:** `onSuccess` and `onSettled` both run once the
  mutation settles (`onSuccess` only on success, `onSettled` on error too), so swapping one for the
  other fixes nothing. The race is elsewhere, and the two causes need different fixes:
  - *Overlapping mutations:* a second related mutation is still in flight. Invalidate after the
    last one settles (check `useIsMutating` for the mutation key).
  - *Read-after-write lag:* the server resolves before the write is readable (a queue, a replica,
    an eventually consistent store), so even a late refetch returns stale rows. Write the server's
    authoritative response into the cache when its shape matches the query, or retry the read until
    the write shows up.
- **Rollback clobbers a newer write:** `onError` restores the snapshot from `onMutate`, wiping a
  second mutation that succeeded in between. Roll back only the item you changed, not the whole list.
- **Rapid double click:** two mutations, two optimistic writes, one rollback. Disable while
  `isPending`, or make the mutation idempotent.
- **Search-as-you-type:** responses arrive out of order. Key the query by the input so stale
  responses land in a different cache entry.

## 3. Stale closure
A callback reads a value captured at render time.
```ts
const onSave = useCallback(() => save({ ...draft, tags }), [draft]); // `tags` missing → stale
```
- `setCount(count + 1)` twice in one handler increments once. Use `setCount(c => c + 1)`.
- Zustand: reading `const x = useStore(s => s.x)` in a callback that runs after an `await`; read
  `useStore.getState().x` at the moment you need it.
- Event listeners and intervals registered once in an effect with an empty dependency list.

## 4. Missing transition
The label promises a state change the handler never makes.
- "Save" validates and closes the dialog, but the mutation call was lost in a refactor.
- "Delete" removes the row from the cache, but no request is sent (or it targets a removed route).
- "Mark all done" updates the list query but not the open-count query on another key.
- **Query key mismatch:** `setQueryData(['notes', id])` while the list renders from
  `['notes', { project }]`. The write succeeds into a cache entry nobody reads.

## 5. Conditional dead path
The real work sits behind a condition that is always false at that point.
```ts
if (selectedId) archive(selectedId); // but the click handler cleared selectedId one line earlier
```
- **A value captured inside a state updater, read right after `setState`:**
  ```ts
  let snapshot; setItems(prev => { snapshot = prev; return prev.filter(x => x.id !== id) });
  if (snapshot) rollbackLater(snapshot); // undefined if React deferred the updater
  ```
  Updater functions are queued and run during rendering (possibly more than once, under Strict
  Mode), so code after `setState` can never rely on a value the updater sets. It may appear to work
  when React happens to run it eagerly, then break as soon as another update is queued: the rollback
  or counter update silently never happens. Keep updaters pure; compute from current state *before*
  calling `setState`, or keep the snapshot in a ref.
- A guard on `isPending` / `isLoading` that is still true from the previous render.
- A feature flag or role check that defaults to false before data loads.

## 6. Effect interference
An effect watches the state the handler just changed and changes it back.
- `useEffect(() => setDraft(serverData), [serverData])` re-syncs over the user's edit on every
  background refetch (`refetchOnWindowFocus`).
- An effect that "closes the panel when the selection changes" fires after a handler that opens the
  panel and changes the selection.
- **Zustand `persist` rehydration** overwrites state set during the first render.
- **Fix:** derive instead of syncing (render from server data unless the user has edited), or key
  the component so it remounts on the right identity change.

## Severity
- **Critical** — data loss, wrong record changed, money or permissions affected.
- **High** — the control does nothing or the opposite, on a main flow.
- **Medium** — wrong state on a slow network, double click, or a secondary flow; self-heals on reload.
- **Low** — flicker or a transient wrong count that corrects itself.
