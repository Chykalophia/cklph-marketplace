# Exceptions list

An optional list of things the audit should leave alone: an agency credit in the footer, a font
the client approved, a screen that is still a draft. Anyone on the team can write one, anywhere
the agent can read (a ClickUp task or doc, a Google Doc, a local file, a chat message).

## The format

One exception per line:

```
ignore <kind>: <pattern> [for <rule>, <rule>] [because <reason>]
```

`allow` and `skip` work in place of `ignore`. List markers (`-`, `*`, `1.`), checkboxes (`[ ]`),
headings and blank lines are skipped, so the list can sit inside a normal task or doc.

| Kind | Matches | Applies to |
| --- | --- | --- |
| *(none)*, e.g. `ignore: chykalophia` | the text, any layer name on the path, the component name, or a text style or collection name | every rule |
| `text` | what a text layer says, hidden text layers included | every rule |
| `layer` | any layer name on the path below the screen, so a frame takes everything inside it | every rule |
| `screen` | the screen name | every rule |
| `component` | the component a layer belongs to | every rule |
| `font` | the whole font family name: `Inter` does not cover "Inter Tight" | off-brand font |
| `color` | the hex value, e.g. `#A2A2A2` | hardcoded color |
| `style` | a text style name | unused text style |
| `collection` | a variable collection name | unused collection |
| `rule` | a rule id, or several separated by commas | that rule everywhere |

Patterns match anywhere in the name, ignoring case, and need at least three characters: one or
two match nearly every layer. In text, a pattern of eight letters or more also ignores spacing, so
`Website by Chykalophia` matches "Website by C H Y K A L O P H I A", where a designer spaced the
letters by hand. The screen name is not part of a `layer` path; use `screen` for that.

Put a pattern in slashes for a regular expression: `ignore screen: /^Navigation/`. To match text
that really has slashes in it, such as `/blog/`, quote it: `ignore text: "/blog/"`. A regular
expression may not repeat a group, as in `(a+)+` or `(a|b)*`, or use more than three repeats
(`*`, `+`, `{n}`), because those can hang Figma. Plain and optional groups like `^(nav|menu)$` or
`^(Home|About)? Mobile` are fine. Rule ids are in
[rules.md](rules.md).

`for small-text, raw-color` limits a line to those rules. `because ...` is kept as the reason and
shown in the report. When the pattern itself contains " for " or " because ", quote it (straight
or curly quotes): `ignore text: "We exist because you matter" because tagline`.

A `color` line matches the hardcoded paint that was flagged, not other paints on the same layer.

When two lines match the same layer, the first one gets it. The report then says the second line
left nothing out because a line above covers it, rather than calling it a typo.

## Example

```
## A Safe Place: known exceptions
- ignore text: Website by Chykalophia because agency credit, set by us
- ignore font: Geist Mono for off-brand-font because image placeholder labels only
- ignore screen: Navigation — Mobile — Open because state frame, not a page
- ignore layer: hero-image-placeholder because swapped for photos in the build
- ignore rule: fractional-size because dev rounds on build
```

## When a person writes prose instead

"Don't worry about the footer credit, and the open-menu frame is just a state" is fine. The
`exceptions` command lists the lines it could not parse; the agent rewrites each as `ignore` lines,
keeps the person's words as the reason, and shows the final list before scanning:

```
ignore text: Website by Chykalophia because don't worry about the footer credit
ignore screen: Navigation — Mobile — Open because the open-menu frame is just a state
```

## What the report shows

An "Ignored on purpose" section lists every line with how many problems it hid, by rule. A line
that matched nothing is flagged, since that is usually a typo, and a line that hides ten or more
problems and over a quarter of everything is flagged as possibly too broad. Exceptions are part of a scan's settings:
`script --like` carries them into a recheck, and a recheck with different exceptions is refused.
When fewer problems show in a place because an exception now hides some there (a layer renamed
into a pattern, say), the recheck says "Now covered by an exception" instead of "Fixed", so
someone checks in Figma.
