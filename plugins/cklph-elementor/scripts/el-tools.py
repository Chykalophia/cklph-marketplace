#!/usr/bin/env python3
"""
el-tools.py — local toolkit for Elementor `_elementor_data` JSON.

Pairs with cklph-wp's `cwp` for transport. Typical flow:
    cwp meta-read 218 _elementor_data raw.txt
    el-tools.py tree    raw.txt          # learn the structure / conventions
    el-tools.py widgets raw.txt          # widget-type census
    # ...edit raw.txt -> new.json...
    el-tools.py validate new.json
    el-tools.py add-style new.json v2.json '@id' '.elementor-element-XXXX{gap:12px!important}'
    cwp meta-write 218 _elementor_data v2.json
    cwp wp elementor flush-css           # regen CSS so changes render

Commands:
    validate <file>                       valid JSON + Elementor shape? (exit 0/1)
    tree <file>                           container/widget tree with key settings
    widgets <file>                        count widget types
    add-style <in> <out> <id> <css>       inject/replace a hidden html-widget <style> (the reliable CSS channel)
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
    top-level container, or '@id:<elementId>')."""
    d = _load(inp)
    wid = "elcss01"
    html = (f"<style>.elementor-element-{wid}{{display:none !important}}{css}</style>")
    widget = {"id": wid, "elType": "widget", "widgetType": "html",
              "settings": {"html": html}, "elements": []}
    def attach(nodes, is_root=False):
        for n in nodes:
            hit = (target_id == "@root" and is_root) or \
                  (target_id.startswith("@id:") and n.get("id") == target_id[4:])
            if hit:
                n.setdefault("elements", [])
                n["elements"] = [e for e in n["elements"] if e.get("id") != wid]
                n["elements"].append(widget); return True
            if attach(n.get("elements", [])): return True
        return False
    if target_id == "@root":
        d[0].setdefault("elements", []).append(widget)
    elif not attach(d, True):
        print(f"target {target_id} not found"); return 1
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
