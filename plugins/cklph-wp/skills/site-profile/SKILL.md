---
name: site-profile
description: Build and maintain a per-project knowledge base of a WordPress install so the agent knows its data, structure, custom fields, what's installed, and its quirks without re-discovering each session. Use at the start of work on a site, when you learn a new fact or quirk about it, or before generating code that depends on its structure.
---

# site-profile — learn the site once, remember it

Don't re-learn a site every session. Probe it once into a **profile file checked into the project**,
read that file at the start of any task, and **append to it** whenever you discover something new
(a data structure, a custom-field key, a quirk, a "this isn't possible here"). The profile is what lets
you write *correct* code for *this* install instead of generic code.

## Where it lives
`./.cklph-wp/site-profile.md` (next to the `./.cklph-wp` connection config). Project-scoped, committed,
loaded at task start. One per site.

## Generate the baseline
```bash
cwp profile > .cklph-wp/site-profile.md
```
That snapshots versions, active plugins (with versions), the active theme, post types, taxonomies, and
Elementor/WooCommerce facts. Then fill in the by-hand sections — these are the high-value parts:

- **Webroot path** (`/www` on Flywheel, etc.) — needed for `cwp put` / `eval-file`.
- **Custom fields** — the part most likely to be wrong if guessed (see below).
- **Data structures** — which post types hold what, key relationships, the meta keys that matter.
- **Quirks / what's NOT possible** — host limits, missing plugins, theme constraints.

## Probe custom fields (the bit people guess wrong)
Custom fields live in meta, but *which* keys and *how to fill them* depends on the manager. Use the
webroot eval-file pattern (PHP with `$vars` can't go on the `cwp eval` command line):

```php
// .cklph-wp/probe.php  →  cwp put .cklph-wp/probe.php /www/wp-content/uploads/probe.php
//                          cwp wp eval-file /www/wp-content/uploads/probe.php   (then delete it)
if (function_exists('acf_get_field_groups')) {
  foreach (acf_get_field_groups() as $g) {
    echo "GROUP {$g['title']} ({$g['key']})\n";
    foreach (acf_get_fields($g['key']) as $f) echo "  - {$f['label']} [{$f['name']}] {$f['type']}\n";
  }
}
// Pods / Meta Box / raw registered meta have their own APIs — adapt. For a single post's actual meta:
//   wp post meta list <id> --format=table
```
Record the group → field `name`s → types in the profile, plus **how a field is populated** (ACF stores
under the field `name`; some need the field `key` via `update_field()`). Now you can fill them correctly.

## Keep it current
Treat the profile as living. Every time you learn a fact the hard way — a gateway quirk, a widget the
theme uses, a plugin that's deactivated, a template id that actually renders — **write it down there**.
The next session (or the next page) starts from knowledge, not rediscovery. Pair with `version-docs`
so the *code* you write matches the *versions* recorded here.
