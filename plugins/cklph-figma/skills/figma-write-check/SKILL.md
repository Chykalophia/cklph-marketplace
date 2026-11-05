---
name: figma-write-check
description: Preflight and verify Figma writes from Claude. Use before the first edit to any Figma file in a conversation (creating, changing, or deleting anything on the canvas), whenever a Figma edit fails, when Figma seems read-only, or when the user asks "can you write to Figma", "why can't you edit Figma", or "check Figma access".
---

# Figma write check

Confirm Claude can actually edit a Figma file before promising or attempting changes, then verify every write landed. Run steps 1–4 once per file per conversation. Run step 6 after every write.

## Why this exists

Figma gives Claude two separate connections, and only one can edit:

| Connection | Where it runs | Can it edit? |
| --- | --- | --- |
| Desktop server | The user's Mac, through the Figma desktop app (Dev Mode → "Enable desktop MCP server") | No. Read only. |
| Hosted connector | Figma's cloud, connected in Claude's connector settings | Yes, through `use_figma` |

When only the desktop server is loaded, reads work and every edit silently has no path. That looks like "Figma broke". It is almost always the wrong connection.

## Step 1: Confirm the edit tool is present

Look for `use_figma` in the tool list. If Figma tools are deferred, load them in one call: `select:use_figma,whoami,get_metadata,get_screenshot`.

- `use_figma` present → continue.
- Only read tools present (`get_design_context`, `get_metadata`, `get_screenshot`, `get_variable_defs`) → stop. Tell the user: "I can read Figma but can't edit it here. The edit-capable Figma connector isn't on in this chat. Turn on the Figma connector in Settings → Connectors, then start a new message." In Claude Code there is no Connectors page: tell them to install Figma's official plugin (`figma@claude-plugins-official`), restart Claude Code, and finish the Figma sign-in it asks for.
- An error saying to enable the Dev Mode MCP server → that's the desktop server. It does not enable edits. Same message as above.

## Step 2: Check who Claude is signed in as

Call `whoami`. Report back in one line: the account email, and the seat type on the team that owns the file.

| Seat | Can edit design files? |
| --- | --- |
| Full | Yes |
| Dev | Only files in their own drafts. Dev Mode elsewhere. |
| Collab or View | No |

Flag it if the account is a shared login rather than the user's own. Edits show in Figma's version history under that name.

Also check `user_can_access_figma_ai` on the plan. Edits run through Figma's AI features, so if it's false, an admin has turned them off and writes will fail.

## Step 3: Read probe on the target file

Load `figma-use` first: Figma requires it before every `use_figma` call, reads included. Pass it in each call's `skillNames` (prefixed `resource:` when it came from the Figma server).

Parse the file key from the URL: `figma.com/design/<fileKey>/...`, `figma.com/board/<fileKey>/...` (FigJam) or `figma.com/slides/<fileKey>/...`; for a branch (`/design/<fileKey>/branch/<branchKey>/...`) use the branch key. Pass that `fileKey` to this call and to the write probe, so both run against the user's file and not whichever file the connector used last. Run a read-only `use_figma`:

```js
return { pages: figma.root.children.map(p => p.name), editorType: figma.editorType };
```

- Returns pages → the account can open the file.
- "Not found" or a permission error → the account can't open the file. Ask the user to share it with that account.
- Any other error (connection, timeout, server) → it says nothing about access. Retry once, then report the error as it is; don't tell the user to change sharing.
- `editorType` tells you the mode: `figma` (Design), `figjam`, or `slides`. Load `figma-use-figjam` or `figma-use-slides` for those.

## Step 4: Write probe

A read can succeed on a view-only file. Prove edit permission with a create-and-remove in one call, against the same `fileKey`. Nothing is left behind. The probe uses a frame, which Design files support; in FigJam or Slides, load `figma-use-figjam` or `figma-use-slides` and probe with a node that editor supports (in FigJam, `figma.createSticky()`).

```js
const page = figma.currentPage;
let maxX = 0;
for (const n of page.children) { if ('x' in n) maxX = Math.max(maxX, n.x + (n.width || 0)); }
const f = figma.createFrame();
f.name = '__claude-write-probe__';
f.resize(10, 10);
f.x = maxX + 5000; f.y = -5000;
const id = f.id;
let existed = false;
try {
  existed = !!(await figma.getNodeByIdAsync(id));
} finally {
  if (!f.removed) f.remove();   // clean up even if the lookup throws
}
const removed = !(await figma.getNodeByIdAsync(id));
return { probeId: id, created: existed, removed, writeOk: existed && removed };
```

- `writeOk: true` → edits work. Continue.
- Throws a permission or read-only error → the account has view access only. Ask for "can edit" on the file.
- `removed: false` → stop and tell the user a probe frame named `__claude-write-probe__` may remain, with its id.

Tell the user the probe ran. Never skip it on a client file just to save a call.

## Step 5: Load the right skills before real edits

Before the first edit that changes something visible:

- Keep `figma-use` (loaded in step 3) in every `use_figma` call's `skillNames`.
- Visible design changes, from one property to a full screen: also load `figma-generate-design`.
- Reusable components, variables, tokens, or styles: load `figma-generate-library` instead.

## Step 6: Verify every write

1. Every write script returns all created and changed node IDs, plus the IDs of any variables or styles it touched and of any nodes it deleted.
2. Read back structure with the returned node IDs (`get_metadata`, or a read-only `use_figma`). Writes that leave no canvas node need their own check in a read-only `use_figma`: variables with `figma.variables.getVariableByIdAsync`, styles with `figma.getStyleByIdAsync` (compare the values you set), and deletions by `figma.getNodeByIdAsync` returning `null`.
3. For visible changes, take one screenshot after composing and one after any fix. Look for clipped text and overlaps.
4. On an error, obey `safeToRetryWithoutCanvasRead`. If `false`, read the canvas before retrying. Never re-run a write that may have half-applied.

Only report "done" once step 6 passes. If it fails, say what landed and what didn't.

## Report format

After steps 1–4, give the user one short table:

| Check | Result |
| --- | --- |
| Edit tool loaded | ✅ / ❌ |
| Signed in as | email, seat, team |
| File opens | ✅ / ❌ |
| Write probe | ✅ / ❌ |

Then one line on what to fix, if anything. No other commentary.

## Fix map

| Symptom | Cause | Fix |
| --- | --- | --- |
| Reads work, no edit tool | Only the desktop server is loaded | Turn on the Figma connector in Settings → Connectors (Claude Code: install the `figma@claude-plugins-official` plugin) |
| "Enable Dev Mode MCP Server" error | Desktop server off | Optional for reads. Never fixes edits. |
| Read probe fails | Account can't see the file | Share the file with the signed-in account |
| Write probe fails | View-only access, or a Dev/View seat | "Can edit" on the file and a Full seat (a Dev seat edits only its own drafts) |
| Writes fail after working earlier | AI features turned off, or the connector signed out | Check plan settings, reconnect the connector |
| Edits show under the wrong name | Connector signed in as a shared account | Disconnect and reconnect as the user |
