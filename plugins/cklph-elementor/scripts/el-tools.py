#!/usr/bin/env python3
"""
el-tools.py — local toolkit for Elementor `_elementor_data` JSON.

Pairs with cklph-wp's `cwp` for transport. Typical flow:
    cwp meta-read 218 _elementor_data raw.txt
    el-tools.py tree    raw.txt          # learn the structure / conventions
    el-tools.py widgets raw.txt          # widget-type census
    # ...edit raw.txt -> new.json...
    el-tools.py validate new.json
    el-tools.py add-style new.json v2.json '@root' '.elementor-element-XXXX{gap:12px!important}'
    cwp meta-write 218 _elementor_data v2.json
    cwp wp elementor flush-css           # regen CSS so changes render

Commands:
    validate <file>                       valid JSON + Elementor shape? (exit 0/1)
    tree <file>                           container/widget tree with key settings
    widgets <file>                        count widget types
    add-style <in> <out> <target> <css>   inject/replace a hidden html-widget <style> (the reliable CSS channel)
                                          <target> = '@root' (first top-level element) or '@id:<elementId>'
                                          idempotent: an earlier style widget is replaced wherever it was
                                          (only the html widget with id elcss01; refuses if another element uses that id)
"""
import sys, json, collections

def _load(p):
    d = json.load(open(p, encoding="utf-8"))
    if not isinstance(d, list):
        raise ValueError("_elementor_data must be a JSON array of elements")
    return d

def _walk(nodes):
    for n in nodes:
        yield n
        yield from _walk(n.get("elements", []))

def validate(p):
    try:
        d = _load(p)
    except Exception as e:
        print(f"INVALID: {e}"); return 1
    bad = 0
    for n in _walk(d):
        et = n.get("elType")
        if et not in ("container", "section", "column", "widget"):
            print(f"  ? unexpected elType={et!r} id={n.get('id')}"); bad += 1
        if et == "widget" and not n.get("widgetType"):
            print(f"  ? widget without widgetType id={n.get('id')}"); bad += 1
    n_el = sum(1 for _ in _walk(d))
    print(f"{'OK' if not bad else 'WARN'}: {n_el} elements, {bad} issues")
    return 0 if not bad else 1

def tree(p):
    d = _load(p)
    def show(nodes, depth=0):
        for n in nodes:
            pad = "  " * depth; s = n.get("settings", {})
            if n.get("elType") == "widget":
                wt = n.get("widgetType"); hint = ""
                for k in ("title", "editor", "text"):
                    if k in s:
                        v = s[k]
                        hint = " " + repr((v if isinstance(v, str) else str(v))[:42]); break
                gl = s.get("__globals__")
                if gl: hint += f"  globals={list(gl)}"
                print(f"{pad}* {wt} (id={n.get('id')}){hint}")
            else:
                tags = [f"{k}={s[k]}" for k in ("flex_direction", "content_width", "width")
                        if k in s and not isinstance(s[k], dict)]
                print(f"{pad}[{n.get('elType')}] (id={n.get('id')}) {' '.join(tags)}")
            show(n.get("elements", []), depth + 1)
    show(d)
    return 0

def widgets(p):
    c = collections.Counter(n.get("widgetType") for n in _walk(_load(p)) if n.get("elType") == "widget")
    for wt, n in c.most_common():
        print(f"  {n:3}  {wt}")
    return 0

def add_style(inp, outp, target_id, css):
    """Inject a hidden html widget carrying a <style>. The html-widget <style> is the RELIABLE
    CSS channel — per-element custom_css works for WIDGETS but NOT containers; an html-widget
    <style> applies regardless. target_id picks the element to append into (use '@root' for the
    top-level container, or '@id:<elementId>'). Idempotent: every existing copy of the style
    widget (id elcss01, elType widget, widgetType html) is removed from the whole tree first, so
    re-runs and target moves never duplicate it. Other elements are never removed; if one already
    uses the id, nothing is written (the style's display:none would hide it)."""
    d = _load(inp)
    wid = "elcss01"
    html = (f"<style>.elementor-element-{wid}{{display:none !important}}{css}</style>")
    widget = {"id": wid, "elType": "widget", "widgetType": "html",
              "settings": {"html": html}, "elements": []}
    if target_id != "@root" and not target_id.startswith("@id:"):
        print(f"bad target {target_id!r}: use '@root' or '@id:<elementId>'"); return 1
    def is_style(n):
        # only OUR generated widget: same id AND an html widget. Any other element that happens to
        # use this id (a container, a heading) is left alone.
        return n.get("id") == wid and n.get("elType") == "widget" and n.get("widgetType") == "html"
    def strip(nodes):
        kept = [n for n in nodes if not is_style(n)]
        for n in kept:
            if "elements" in n: n["elements"] = strip(n["elements"])
        return kept
    d = strip(d)
    clash = [n for n in _walk(d) if n.get("id") == wid]
    if clash:
        # the style hides .elementor-element-elcss01, so sharing the id would hide that element too
        print(f"id {wid} is already used by a non-style element "
              f"(elType={clash[0].get('elType')!r}, widgetType={clash[0].get('widgetType')!r}); "
              f"left it untouched and wrote nothing. Rename that element's id first."); return 1
    if not d:
        print("no top-level element to attach to"); return 1
    if target_id == "@root":
        target = d[0]
    else:
        target = next((n for n in _walk(d) if n.get("id") == target_id[4:]), None)
        if target is None:
            print(f"target {target_id} not found"); return 1
    target.setdefault("elements", []).append(widget)
    json.dump(d, open(outp, "w"))
    print(f"wrote {outp} (html-widget {wid} with scoped <style>)")
    return 0

def main(argv):
    if len(argv) < 2:
        print(__doc__); return 2
    cmd = argv[1]
    try:
        if cmd == "validate": return validate(argv[2])
        if cmd == "tree":     return tree(argv[2])
        if cmd == "widgets":  return widgets(argv[2])
        if cmd == "add-style": return add_style(argv[2], argv[3], argv[4], argv[5])
    except IndexError:
        print(__doc__); return 2
    print(f"unknown command: {cmd}"); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv))
