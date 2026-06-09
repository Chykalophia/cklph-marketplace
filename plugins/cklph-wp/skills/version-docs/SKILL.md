---
name: version-docs
description: Write code that matches the exact installed versions of WordPress, the host, and the plugins you're editing — by reading the installed source and pulling version-pinned docs, not coding from memory. Use before writing any PHP/JS/hook/widget code against a live site, or when an API, control name, or function signature might differ by version.
---

# version-docs — code for the version that's actually installed

Your training is stale and the site may run an older or newer release. **Never code a WordPress /
Elementor / WooCommerce / ACF API from memory.** Pin to the versions in the site profile, then confirm
against the most authoritative source available — which, on a live site, is usually **the installed
source itself**.

## 1. Know the versions
From `cwp profile` / the site profile (`cwp wp plugin list --status=active --fields=name,version`).
Record them; every API decision is relative to these.

## 2. The installed source is the ground truth
The code on the server **is** the version. For exact control names, hook names, function signatures,
markup, and CSS selectors, **read it** — no doc is more accurate:

```bash
cwp wp eval 'echo WP_PLUGIN_DIR;'      # -> /www/wp-content/plugins
cwp shell                              # then grep/sed the actual file:
#   grep -nE "add_control\(|'name' =>" .../elementor-pro/modules/woocommerce/widgets/<widget>.php
#   grep -rn "function the_thing"      .../<plugin>/includes/
```
This is how you get `button_bg_color` (not `button_background_color`), the real `dropdown` enum, the
exact filter name a plugin exposes. Do this for anything you'd otherwise guess.

## 3. Pull version-pinned docs for usage/concepts
For how an API is *meant* to be used (not just its signature), fetch current docs rather than recalling:
- **Context7** (`resolve-library-id` → docs) for WordPress, WooCommerce, ACF, Elementor, and the like —
  prefer the entry matching the installed major version; note the version in the query.
- **WebFetch / WebSearch** for the host's docs (Flywheel/WP Engine SSH, cron, caching limits) and a
  plugin's **changelog** when behavior changed between releases.
- Anthropic/Claude APIs → the `claude-api` skill; framework house-style → the relevant `cklph-*` /
  `vercel:*` skill.

## 4. When in doubt, verify on the install
If a function/hook may not exist in this version, probe it before relying on it:
```bash
cwp wp eval 'var_dump(function_exists("acf_get_field_groups"), class_exists("WooCommerce"));'
```

## The rule
Versions from the profile → exact API from the installed source → usage from version-pinned docs →
verified on the install. Code written this way runs; code written from memory breaks on the one site
whose versions don't match your training.
