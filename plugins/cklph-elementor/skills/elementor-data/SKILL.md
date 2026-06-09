---
name: elementor-data
description: Read and write an Elementor page or template's layout programmatically — the _elementor_data JSON model, the container/widget tree, and the slash-safe write path. Use when editing Elementor pages from outside the editor, generating layouts, or debugging why a written layout did not render.
---

# elementor-data — the `_elementor_data` model

An Elementor page's entire layout is **one JSON blob in the protected post meta `_elementor_data`**.
It's a nested tree of **containers** and **widgets**. Read it to learn a site's conventions before you
generate anything; write it through the slash-safe path; always regenerate CSS after.

## The shape

```jsonc
[
  { "id": "abc1234", "elType": "container", "settings": { "flex_direction": "column" },
    "elements": [
      { "id": "def5678", "elType": "widget", "widgetType": "heading",
        "settings": { "title": "Hi", "title_color": "#00205c" }, "elements": [] }
    ]
  }
]
```

- `id` = 7-char alnum, unique within the doc. `elType` ∈ container / widget (older docs: section/column).
- Widgets carry `widgetType` + a flat `settings` object. Containers carry layout `settings` + `elements`.
- Global references live under `settings.__globals__`, e.g.
  `"__globals__": { "title_color": "globals/colors?id=56d158b" }` (see `elementor-templates` for the Kit).

## Read → understand → write (with cklph-wp's `cwp`)

```bash
cwp meta-read 218 _elementor_data raw.txt
el-tools.py tree    raw.txt     # the container/widget tree + key settings
el-tools.py widgets raw.txt     # widget census — what this site actually uses
# ...generate/patch into new.json...
el-tools.py validate new.json
cwp meta-write 218 _elementor_data new.json
cwp wp elementor flush-css      # REQUIRED — regenerate CSS or changes won't render (try flush_css if that errors)
```

## The write path is slash-sensitive

`_elementor_data` is stored **`wp_slash()`-ed** (Elementor does `update_post_meta($id,'_elementor_data', wp_slash($json))`).
`cwp meta-write` already wp_slashes, so pass **clean JSON** and it lands correct. Skipping the slash
mangles every backslash/quote in the blob. **Validate by round-trip:** write to a throwaway page, read
back, compare the *parsed* tree (pretty-printing changes whitespace; Elementor re-minifies on next save).

## Learn the site's conventions first
Before generating a new section, `tree` two or three existing pages: which widgets they use (Pro
WooCommerce widgets? a custom theme's?), their container/flex structure, and which `__globals__` they
reference. Mirror those — generic markup reads as AI-generated; native widgets + Kit globals read as
designed. Reuse over invention.

## When a written layout doesn't render
1. Did you `flush-css`? Most common cause.
2. Is the JSON valid + slash-clean? `el-tools.py validate`, then re-read and diff.
3. Is it a theme-builder **template** with no display conditions? See `elementor-templates`.
4. CDN cache — fetch with `?v=…`.
