---
name: figma-audit
description: Audit a Figma file before dev hand-off and publish a fix list to ClickUp with a working Figma link, layer path and annotated screenshot per item, then recheck it after the designers fix things. Use when asked to "audit the Figma file", "review the design file for hand-off", "check if the Figma is ready for dev", "make a Figma fix list", or "recheck the Figma fixes". Read-only on the Figma file.
---

# figma-audit: a hand-off fix list designers can act on

A technical review of the Figma file, not the visual design: placeholder copy, tiny text, missing
or off-brand fonts, wireframe leftovers, text without styles, hardcoded colors, detached
components, frames without auto layout, copy-pasted frames, unused styles and variables, hidden
layers, default names and half pixels. Every rule, and what it deliberately skips, is in
[references/rules.md](references/rules.md).

The output is a ClickUp doc page the creative team works through, with one row per problem:
a link to the section, the exact layer path, an annotated screenshot, and Resolved / Rechecked
columns. A recheck adds a new page that marks each earlier row fixed, still open or removed.

`S` below is `${CLAUDE_PLUGIN_ROOT}/scripts/figma-audit.mjs`. `node S --help` prints every command.
Work in a scratch folder, one per audit.

## Rules that are not negotiable

- **Read-only.** Never edit the client's Figma file during an audit, not even to annotate it.
- **One page, named.** Audit the page the designers actually edit. If the file has a hand-off copy
  and a working page (both "HiFi" and "Dev Hand-off", say), ask which one is the source of truth.
  Links into the wrong copy are why designers could not find things. The report states the page.
- **Never overwrite a doc page after it is shared.** The team writes in the Resolved column. Rechecks
  go on a new page.
- **Links are checked before publishing.** `report --exists` refuses to print a link to a missing node.

## 1. Set up

1. Load `cklph-figma:figma-read` for URL parsing, and the Figma plugin's `figma-use` skill. Every
   `use_figma` call passes `skillNames: "figma-use"`. Call `create_session` first with the file key.
2. List pages with `get_metadata` (no node id). Pick the page (see above).
3. Ask for the brand fonts if you do not know them (brand guide, DESIGN.md, stylescape). Without
   `--fonts` the scan infers them from usage and says so in the report.
4. Ask what the build target is (e.g. "Squarespace 7.1"); it goes in the report header.
5. Ask whether the team keeps a list of known exceptions for this project (things the audit should
   leave alone, such as the agency credit in the footer or a font the client approved). It is
   optional and can live anywhere: see [Exceptions](#exceptions-optional) below.

## Exceptions (optional)

A team member can list what the audit should ignore, in a ClickUp task or doc, a Google Doc, a
local file or a chat message. It can be formatted or plain prose. The format and examples are in
[references/exceptions.md](references/exceptions.md).

1. Get the text with whatever reaches it: the ClickUp connector (`clickup_get_task` for a task
   description, `clickup_get_document_pages` for a doc), the Google Drive or Docs connector, `Read`
   for a local file, or the user's message. Save it as `exceptions.source.md` in the scratch folder.
2. `node S exceptions --file exceptions.source.md` prints how each line parses. Lines it cannot
   parse come back under `unparsed`.
3. Write `exceptions.md` holding only `ignore` lines: keep the parsed ones, and turn each prose
   line into one or more `ignore` lines (or drop it if it is not an exception, like an intro
   sentence). Keep the person's reason as `because ...`.
4. **Show the user the final list before scanning** and say which prose lines you rewrote and how.
   An exception hides problems, so a wrong guess hides real ones.
5. Pass it to the scan with `--exceptions exceptions.md`. The script refuses a file that still has
   prose in it. For a one-off, `--allow TEXT` adds a single `ignore: TEXT`.

The report lists every exception under "Ignored on purpose" with how many problems it hid, and
flags any that matched nothing (usually a typo).

## 2. Scan

```bash
node S script --page 123:456 --fonts "Brand Serif,Brand Sans" --exclude-screens Tablet \
  --exceptions exceptions.md > scan.js
```

Pass the file's contents as `use_figma`'s `code`. It returns `{ part, parts, hash, scan }` when the
scan fits in one part, or `{ part, parts, hash, chunk }` when it does not. Save that result
**exactly as returned** to `part-0.json`. If `parts` > 1, rerun **the same command plus** `--part 1`,
`--part 2`, and so on, saving each. Then:

```bash
node S join part-*.json --out scan.json
```

`use_figma` refuses a return over 48,000 bytes, hence the parts. `join` checks the hash, so a part
that was copied wrong fails loudly. The scan comes back in a compact form that `join` expands;
the 27-screen A Safe Place page at `--max-groups 4 --max-examples 2` went from 42 KB to 24 KB.
Copying parts costs context, so **keep it to one part**: scope with `--frames ID,ID` or
`--exclude-screens REGEX`, and lower `--max-groups` (default 20) or `--max-examples` (default 3).

Other options: `--min-font 12`, `--repeat-min 3` (screens a frame must repeat on to count), and
`--unused-styles full`. Text styles are file-wide, so by default unused ones are one row with a
count; pass `full` to list each one when auditing the page that holds the design system.

The scan fails rather than report on nothing: zero screens, a `--frames` id on another page, or a
`--frames` id that is not a frame, component, instance, section or group. A frame inside another
passed frame is scanned once, as part of the outer one. Screens inside sections and groups are found; loose layers
that are not screens are listed in the report's scope line.

## 3. Check every link

```bash
node S exists-script --from scan.json > exists.js
```

Run it with `use_figma` and save the result verbatim as `exists-0.json`. It checks every node the
scan could link to, including places not shown in the report, and returns only the missing ids.
If stderr says there are more parts, rerun with `--part N` and save each as `exists-N.json`, then
pass them all, comma-separated: `--exists exists-0.json,exists-1.json`. A missing part is refused.

## 4. Screenshots

```bash
node S shots --scan scan.json > plan.json
```

For each distinct `screenId` in the plan, call `get_screenshot` with `maxDimension` set to the
screen's longest side, so it renders at 1x (the boxes depend on it). Download each to
`renders/<screenId with ":" as "-">.png`. Then:

```bash
node S annotate-all --plan plan.json --renders renders --out shots
```

Each image is a crop of the screen around the problem, red boxes on every example layer, and the
layer path as a caption. A hidden layer (turned off, or at 0% opacity) gets a dashed outline and a
caption saying so, since there is nothing to see inside it. Needs ImageMagick 7 (`magick`).
`annotate-all` lists any entry it could not draw under `failed` and still writes the rest.

**Check every screenshot, not a sample**, before anything is published:

```bash
node S contact-sheet --dir shots --out sheet.png
```

It tiles the shots nine to a sheet (`sheet-1.png`, `sheet-2.png`, ...) and deletes sheets left from
an earlier run, so the one you read is current. Read each sheet and ask of
every tile: does the box frame the problem the row describes, and can a designer see it? A solid
box around empty space means the scan thought something was visible that is not; drop that
screenshot and find out why before publishing. Boxes also assume the render starts at the frame's
top-left corner, so a frame with a drop shadow or content outside its clip renders larger and the
boxes shift. In the first real run, a five-of-eighteen spot check missed three empty boxes.

## 5. Publish to ClickUp

Use one **host task** per audit to hold the files: an existing task for the hand-off, or one new
task. Never one sub-task per finding.

1. Upload the PNGs and `scan.json` (renamed `scan-<date>.json`, so a recheck can find it) as
   attachments on the host task.
   - Prefer `clickup_cklph`'s `clickup_upload_attachment` with `file_path`. It reads only files inside
     the folder its `CLICKUP_UPLOAD_DIR` names (ours is `~/clickup-uploads`; ask if that folder is
     missing). Symlinks out of it are refused, so **copy** the files into a new subfolder such as
     `figma-audit-<date>/` and pass `file_path` relative to the upload folder. Write `shots.json`
     yourself from the responses: the key is the file name without `.png`, the value is
     `{ "url": <url>, "thumb": <thumbnail_small> }`. Copy the URLs exactly. Delete the subfolder
     afterwards, so client screenshots don't pile up there.
     If it says `file_path` uploads are disabled, use the tickets route below.
   - Otherwise call the ClickUp connector's `clickup_request_attachment_upload` once per file, write
     the tickets to `tickets.json` as `[{ "file", "upload_url", "upload_ticket" }]`, put the files in
     one folder and run `node S upload --tickets tickets.json --dir shots --out shots.json`.
     Tickets expire in minutes and work once; request them right before uploading.
2. Render the page:
   ```bash
   node S report --scan scan.json --exists exists-0.json --shots shots.json \
     --file-key KEY --file-name "File name" --target "Squarespace 7.1" > report.md
   ```
   `report` refuses to run without `--exists`, so a published list never links a missing layer.
   `--unchecked-links` skips the check for a draft only you will see.
3. Create the doc page with `report.md` as markdown content: `clickup_cklph`'s `clickup_create_doc`
   or `clickup_create_doc_page`, or the ClickUp connector's `clickup_create_document` or
   `clickup_create_document_page`. Use a new doc, or a new page in the client's existing doc.
   Thumbnails sit in the table; full-size images are under "Screenshots" at the end.
4. Give the user the doc link and say what the audit did not cover (other pages, tablet frames).

ClickUp attachment URLs need a ClickUp login, which is fine for the team. They do not work for
anyone outside the workspace.

## 6. Recheck

When the designers say they are done:

1. Get the earlier `scan-<date>.json` from the host task, as `old.json`: the ClickUp connector's
   `clickup_download_task_attachment`, or ask the user to download it.
2. Scan again with `node S script --like old.json` (plus `--part N` as in step 2), and join it to
   `new.json`. `--like` reuses the earlier page, frames, exclusions, brand fonts, thresholds,
   exceptions and unused-styles mode. `recheck` refuses two scans made with different settings,
   because a count that drops when `--min-font` changes, the inferred brand fonts shift or a new
   exception hides it is not a fix. To add exceptions, run a fresh audit instead of a recheck.
   A scan made by an older version of this skill cannot be rechecked: its rules differ (0.5.0
   treats a layer at 0% opacity as hidden, for one), so unchanged problems would read as fixed.
   `--like` and `recheck` both refuse it; run a fresh audit and start a new doc page.
3. Check whether the earlier nodes still exist: `node S exists-script --from old.json`, run it,
   save as `exists-old-0.json` (and `exists-old-1.json`… if stderr says there are more parts).
4. `node S recheck --prev old.json --curr new.json --exists exists-old-0.json[,exists-old-1.json…] --file-key KEY > recheck.md`.
   Without `--exists` only new rows are linked and nothing can read "removed".
5. Add `recheck.md` as a **new page** in the same doc, and upload `new.json` as the next
   `scan-<date>.json`.

Statuses: still open, fewer but not done, new, fixed, "layer removed" (the flagged section is
gone, which usually means it was rebuilt or deleted), "now covered by an exception" (still in the
file, but renamed or changed so an exception on the list hides it), and "not checkable now" (an
unused variable collection, when nothing on the page is bound to any variable any more). The
recheck page has no screenshots; for a fresh fix list of what is left, run a new audit instead.

## Known limits

- Style, text style and variable usage is counted on the audited page only. "Unused" means unused
  there; the fix text tells designers to check other pages first.
- `inferredAutoLayout` came back `null` for every frame in our trial file, so "no auto layout" flags
  every multi-layer frame without it and leaves the judgement to a person.
- `detachedInfo` is read for every frame, but our trial file had no detached frames, so that rule is
  tested only against a mock.
- Component problems are blamed on the nearest component. An override set on one instance (a font
  size changed by hand, say) is still reported against the component, so fixing the component will
  not clear it; the "open layer" link shows the instance to check.
- A library component's main is not in the file, so its row links the first instance and the fix
  belongs in the library. A deleted local component is treated the same way and labelled so.
- A scan only sees what is on the page. Prototype-only states and variants on other pages are out.
- A layer counts as hidden when it is turned off or at 0% opacity. A layer that is visible but
  fully covered by another (an old placeholder under a photo) still counts as visible.
