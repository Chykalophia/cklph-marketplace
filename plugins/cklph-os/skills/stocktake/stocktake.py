#!/usr/bin/env python3
"""Skill stocktake: usage counts, prune list, trigger collisions (STANDARD.md §10).

Reads the usage log written by hooks/skill-usage-log.sh and the inventory of installed,
enabled skills (`claude plugin list --json` + ~/.claude/skills). Stdlib only, read-only.

Usage: python3 stocktake.py [--log PATH] [--prune-days 60] [--top 15] [--threshold 0.30] [--full]
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOME = Path.home()
DEFAULT_LOG = Path(os.environ.get("CKLPH_USAGE_DIR", HOME / ".claude/cklph-usage")) / "skills.jsonl"

# Known duplicates that compete to fire. Always reported, whatever their overlap score.
SEEDED_COLLISIONS = [
    ("brand-voice:enforce-voice", "brand-voice:brand-voice-enforcement"),
    ("searchfit-seo:keyword-cluster", "searchfit-seo:keyword-clustering"),
    ("searchfit-seo:seo-audit", "marketing:seo-audit", "brightdata-plugin:seo-audit"),
]

COMMANDS = set()  # qualified names that are commands/*.md rather than skills/*/SKILL.md

STOP = set("""a an and are as at be before by can do does for from has have if in into is it its
of on or so that the their them then this to use used uses using when where which while who will
with without you your skill skills any all also e g eg i ie not no more than via what how""".split())


def frontmatter_description(path):
    """Pull `description` out of a SKILL.md / command .md frontmatter (single or folded)."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return ""
    lines = m.group(1).splitlines()
    for i, line in enumerate(lines):
        if line.startswith("description:"):
            val = line[len("description:"):].strip()
            if val in ("", ">", "|", ">-", "|-"):
                cont = []
                for nxt in lines[i + 1:]:
                    if nxt.startswith((" ", "\t")):
                        cont.append(nxt.strip())
                    else:
                        break
                val = " ".join(cont)
            return val.strip().strip('"').strip("'")
    return ""


def inventory():
    """{qualified_name: description} for every enabled plugin skill/command and user skill."""
    skills = {}
    try:
        out = subprocess.run(["claude", "plugin", "list", "--json"], capture_output=True,
                             text=True, timeout=60).stdout
        plugins = json.loads(out or "[]")
    except (OSError, ValueError, subprocess.SubprocessError):
        plugins = []
        print("warning: `claude plugin list --json` failed; plugin skills not inventoried",
              file=sys.stderr)
    for p in plugins:
        if not p.get("enabled"):
            continue
        name = p.get("id", "").split("@")[0]
        root = Path(p.get("installPath", ""))
        for md in sorted(root.glob("skills/*/SKILL.md")):
            skills[f"{name}:{md.parent.name}"] = frontmatter_description(md)
        for md in sorted(root.glob("commands/*.md")):
            if f"{name}:{md.stem}" not in skills:
                skills[f"{name}:{md.stem}"] = frontmatter_description(md)
                COMMANDS.add(f"{name}:{md.stem}")
    for md in sorted((HOME / ".claude/skills").glob("*/SKILL.md")):
        skills.setdefault(md.parent.name, frontmatter_description(md))
    return skills


def read_log(path):
    events = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                try:
                    e = json.loads(line)
                    e["_ts"] = datetime.strptime(e["ts"], "%Y-%m-%dT%H:%M:%SZ").replace(
                        tzinfo=timezone.utc)
                    events.append(e)
                except (ValueError, KeyError):
                    continue
    except OSError:
        pass
    return events


def words(desc):
    return {w for w in re.findall(r"[a-z][a-z0-9-]{2,}", desc.lower()) if w not in STOP}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=str(DEFAULT_LOG))
    ap.add_argument("--prune-days", type=int, default=60)
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--threshold", type=float, default=0.30,
                    help="description word-overlap (Jaccard) that counts as a collision")
    ap.add_argument("--full", action="store_true", help="name every unused skill")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    events = read_log(args.log)
    skills = inventory()

    # --- Usage ---------------------------------------------------------------------------
    windows = (7, 30, args.prune_days)
    counts = {}
    for e in events:
        c = counts.setdefault(e.get("skill", "?"), [0, 0, 0])
        for i, d in enumerate(windows):
            if e["_ts"] >= now - timedelta(days=d):
                c[i] += 1
    known = {k: v for k, v in counts.items() if k in skills and v[2] > 0}
    span = (now - min(e["_ts"] for e in events)).days if events else 0

    print(f"# Skill stocktake — {now:%Y-%m-%d}\n")
    print(f"Log: {len(events)} invocations over {span} day(s). "
          f"Inventory: {len(skills)} enabled skills/commands.\n")
    print(f"## Most used\n\n| Skill | 7d | 30d | {windows[2]}d |\n|---|---|---|---|")
    for name, c in sorted(known.items(), key=lambda kv: (-kv[1][2], kv[0]))[:args.top]:
        print(f"| `{name}` | {c[0]} | {c[1]} | {c[2]} |")
    if not known:
        print("| _(no logged invocations yet)_ | | | |")

    # --- Prune list ----------------------------------------------------------------------
    zero = sorted(s for s in skills if counts.get(s, [0, 0, 0])[2] == 0)
    provisional = span < args.prune_days
    print(f"\n## Zero invocations in {args.prune_days} days: {len(zero)} of {len(skills)}\n")
    if provisional:
        print(f"**Provisional:** the log only covers {span} day(s). A skill joins the prune list "
              f"only once the log covers {args.prune_days} days.\n")
    def owner(s):
        return s.split(":")[0] if ":" in s else "(user skills)"
    total, unused = {}, {}
    for s in skills:
        total[owner(s)] = total.get(owner(s), 0) + 1
    for s in zero:
        unused.setdefault(owner(s), []).append(s.split(":")[-1])
    # A plugin with no used skill at all is a "disable the plugin?" question, not N prune rows.
    # Name individual skills only where the plugin is partly used: those are the real candidates.
    dead = sorted((p for p in unused if len(unused[p]) == total[p]), key=lambda p: -total[p])
    partial = sorted((p for p in unused if len(unused[p]) < total[p]), key=lambda p: -len(unused[p]))
    print("| Plugin | Unused / total | Unused skills |\n|---|---|---|")
    for p in partial:
        print(f"| {p} | {len(unused[p])} / {total[p]} | {', '.join(unused[p])} |")
    for p in dead:
        detail = ", ".join(unused[p]) if args.full else "whole plugin unused (`--full` lists names)"
        print(f"| {p} | {total[p]} / {total[p]} | {detail} |")

    # --- Collisions ----------------------------------------------------------------------
    print("\n## Trigger collisions\n\n| Skills | Why | Overlap |\n|---|---|---|")
    seen = set()
    for group in SEEDED_COLLISIONS:
        present = [g for g in group if g in skills]
        if len(present) > 1:
            seen.add(frozenset(present))
            print(f"| {' / '.join(f'`{g}`' for g in present)} | known duplicate | n/a |")
    toks = {s: words(d) for s, d in skills.items() if d}
    names = sorted(toks)
    found = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if any(frozenset({a, b}) <= g for g in seen):
                continue
            # A plugin's command that fronts its own skill (e.g. `init` -> `audit-init`) is by
            # design, not a duplicate.
            if a.split(":")[0] == b.split(":")[0] and (a in COMMANDS) != (b in COMMANDS):
                continue
            same_leaf = a.split(":")[-1] == b.split(":")[-1]
            inter = len(toks[a] & toks[b])
            union = len(toks[a] | toks[b]) or 1
            score = inter / union
            if score >= args.threshold or (same_leaf and score >= args.threshold / 2):
                found.append((score, a, b, "same name" if same_leaf else "similar description"))
    for score, a, b, why in sorted(found, reverse=True)[:args.top]:
        print(f"| `{a}` / `{b}` | {why} | {score:.2f} |")
    if not found and not seen:
        print("| _(none above threshold)_ | | |")
    unknown = sorted(set(counts) - set(skills))
    if unknown:
        print(f"\n_Logged names not in the current inventory (built-ins, removed or renamed "
              f"skills): {', '.join(unknown)}_")


if __name__ == "__main__":
    main()
