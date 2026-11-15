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
| *(none)*, e.g. `ignore: chykalophia` | the text, any layer name on the path, or the component name | every rule |
| `text` | what a text layer says | every rule |
| `layer` | any layer name on the path, so a frame takes everything inside it | every rule |
| `screen` | the screen name | every rule |
| `component` | the component a layer belongs to | every rule |
| `font` | the font family | off-brand font |
| `color` | the hex value, e.g. `#A2A2A2` | hardcoded color |
| `style` | a text style name | unused text style |
| `collection` | a variable collection name | unused collection |
| `rule` | a rule id, or several separated by commas | that rule everywhere |

Patterns match anywhere in the name, ignoring case and spacing: `Website by Chykalophia` also
matches "Website by C H Y K A L O P H I A", where a designer spaced the letters by hand. Put a
pattern in slashes for a regular expression: `ignore screen: /^Navigation/`. Rule ids are in
[rules.md](rules.md).

`for small-text, raw-color` limits a line to those rules. `because ...` is kept as the reason and
shown in the report.

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

An "Ignored on purpose" section lists every line with how many problems it hid. A line that hid
nothing is flagged, since that is usually a typo. Exceptions are part of a scan's settings:
`script --like` carries them into a recheck, and a recheck with different exceptions is refused.
