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

## 2. Scan

```bash
node S script --page 123:456 --fonts "Brand Serif,Brand Sans" --exclude-screens Tablet > scan.js
```

Pass the file's contents as `use_figma`'s `code`. It returns `{ part, parts, hash, chunk }`.
Save that result **exactly as returned** to `part-0.json`. If `parts` > 1, rerun **the same command
plus** `--part 1`, `--part 2`, and so on, saving each. Then:

```bash
node S join part-*.json --out scan.json
```

`use_figma` refuses a return over 48,000 bytes, hence the parts. `join` checks the hash, so a part
that was copied wrong fails loudly. Copying parts costs context, so **keep it to one part**: scope
with `--frames ID,ID` or `--exclude-screens REGEX`, and lower `--max-groups` (default 20) or
`--max-examples` (default 3). A full 40-screen page at `--max-groups 6` was two parts.

Other options: `--min-font 12`, `--repeat-min 3` (screens a frame must repeat on to count).

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
layer path as a caption. Needs ImageMagick 7 (`magick`). Look at two or three before uploading.

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
3. Create the doc page with `clickup_cklph` (`clickup_create_doc` for a new doc, or
   `clickup_create_doc_page` in the client's existing doc) with `report.md` as markdown content.
   Thumbnails sit in the table; full-size images are under "Screenshots" at the end.
4. Give the user the doc link and say what the audit did not cover (other pages, tablet frames).

ClickUp attachment URLs need a ClickUp login, which is fine for the team. They do not work for
anyone outside the workspace.

## 6. Recheck

When the designers say they are done:

1. Get the earlier `scan-<date>.json` from the host task, as `old.json`.
2. Scan again with **the same options and scope**, and join it to `new.json`.
3. Check whether the earlier nodes still exist: `node S exists-script --from old.json`, run it,
   save as `exists-old-0.json` (and `exists-old-1.json`… if stderr says there are more parts).
4. `node S recheck --prev old.json --curr new.json --exists exists-old-0.json[,exists-old-1.json…] --file-key KEY > recheck.md`.
   Without `--exists` only new rows are linked and nothing can read "removed".
5. Add `recheck.md` as a **new page** in the same doc, and upload `new.json` as the next
   `scan-<date>.json`.

Statuses: still open, fewer but not done, new, fixed, and "layer removed" (the flagged section is
gone, which usually means it was rebuilt or deleted). The recheck page has no screenshots; for a
fresh fix list of what is left, run a new audit instead.

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
