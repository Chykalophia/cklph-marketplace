#!/usr/bin/env python3
"""Fail when a git-tracked file names a client from the hashed denylist.

Usage:
  python3 scripts/scan_identifiers.py                  scan every tracked file in the working tree
  python3 scripts/scan_identifiers.py --staged         scan the staged blobs (what the next commit holds)
  python3 scripts/scan_identifiers.py --root DIR       scan another checkout
  python3 scripts/scan_identifiers.py --add "Name"     append the hash of a name to the denylist
  python3 scripts/scan_identifiers.py --add -          same, reading the name from stdin
  python3 scripts/scan_identifiers.py --add ... --local   write to the gitignored local denylist instead

Exit 0 clean, 1 a hit, 2 no denylist could be loaded (fail closed: a missing list must never pass).

Text is lowercased and split into [a-z0-9]+ words. Every run of 1 to 4 consecutive words is joined with
no separator and hashed with sha256, so "Acme Corp", "acme-corp", "AcmeCorp" and "acmecorp.com" all hash
the entry "acmecorp". The denylist holds only those hex digests, one per line; '#' starts a comment.

Denylists, in order (all that exist are loaded):
  --denylist PATH (repeatable), else $CKLPH_IDENTIFIER_DENYLIST, else
  scripts/.identifier-denylist.sha256 next to this script, else
  ../cklph-marketplace-private/scripts/.identifier-denylist.sha256 beside the scanned checkout (or beside
  its main checkout, for a linked worktree).
  Plus the local list: $CKLPH_IDENTIFIER_DENYLIST_LOCAL, else scripts/.identifier-denylist.local here.

Files where naming clients is the point (an internal ops reference, say) are listed in the scanned
checkout's scripts/.identifier-allow: one path per line, a trailing / for a whole folder, globs allowed.
That file holds paths only, never a name.

Hits print path:line and the matched text. With $CI set only path:line is printed, so a CI log never
copies the name. Idea from elementalsouls/Claude-BugHunter (MIT), scripts/scan_identifiers.py.
"""
import fnmatch
import hashlib
import os
import re
import subprocess
import sys

MAX_WORDS = 4
WORD = re.compile(r"[a-z0-9]+")
HEX = re.compile(r"^[0-9a-f]{64}$")
HERE = os.path.dirname(os.path.abspath(__file__))
TRACKED_LIST = ".identifier-denylist.sha256"
LOCAL_LIST = ".identifier-denylist.local"
ALLOW = os.path.join("scripts", ".identifier-allow")
SIBLING = os.path.join("cklph-marketplace-private", "scripts", TRACKED_LIST)


def digest(s):
    return hashlib.sha256(s.encode()).hexdigest()


def normalize(name):
    return "".join(WORD.findall(name.lower()))


def git(root, *args, data=None):
    return subprocess.run(["git", "-C", root, *args], input=data, capture_output=True, check=True).stdout


def sibling_candidates(root):
    """The private checkout beside the scanned one, and beside its main checkout when root is a linked worktree."""
    out = [os.path.join(os.path.dirname(root), SIBLING)]
    try:
        common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir").decode().strip()
        main = os.path.dirname(common)
        if main != root:
            out.append(os.path.join(os.path.dirname(main), SIBLING))
    except (subprocess.CalledProcessError, OSError):
        pass
    return out


def primary_lists(explicit, root):
    if explicit:
        return explicit
    env = os.environ.get("CKLPH_IDENTIFIER_DENYLIST")
    if env:
        return [env]
    here = os.path.join(HERE, TRACKED_LIST)
    if os.path.isfile(here):
        return [here]
    return [p for p in sibling_candidates(root) if os.path.isfile(p)][:1]


def local_list():
    return os.environ.get("CKLPH_IDENTIFIER_DENYLIST_LOCAL") or os.path.join(HERE, LOCAL_LIST)


def load(paths):
    hashes, used = set(), []
    for p in paths:
        if not os.path.isfile(p):
            continue
        used.append(p)
        with open(p) as f:
            for n, line in enumerate(f, 1):
                line = line.split("#", 1)[0].strip().lower()
                if not line:
                    continue
                if not HEX.match(line):
                    print(f"FAIL: {p}:{n} is not a sha256 hex digest", file=sys.stderr)
                    sys.exit(2)
                hashes.add(line)
    return hashes, used


def hits_in_line(line, hashes):
    low = line.lower()
    words = [(m.group(), m.start(), m.end()) for m in WORD.finditer(low)]
    found = []
    for i in range(len(words)):
        joined = ""
        for j in range(i, min(i + MAX_WORDS, len(words))):
            joined += words[j][0]
            if digest(joined) in hashes:
                found.append(line[words[i][1]:words[j][2]])
    return found


def scan_text(path, data, hashes, out):
    if b"\0" in data[:8192]:
        return
    for n, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
        for match in hits_in_line(line, hashes):
            out.append((path, n, match))


def load_allow(root):
    try:
        with open(os.path.join(root, ALLOW)) as f:
            return [p for p in (line.split("#", 1)[0].strip() for line in f) if p]
    except FileNotFoundError:
        return []


def skipper(root):
    allow = load_allow(root)

    def skip(path):
        if os.path.basename(path) in (TRACKED_LIST, LOCAL_LIST):
            return True
        return any(path.startswith(p) if p.endswith("/") else fnmatch.fnmatchcase(path, p) for p in allow)
    return skip


def scan_worktree(root, hashes):
    out, skip = [], skipper(root)
    for path in git(root, "ls-files", "-z").decode().split("\0"):
        if not path or skip(path):
            continue
        full = os.path.join(root, path)
        if os.path.islink(full) or not os.path.isfile(full):
            continue
        with open(full, "rb") as f:
            scan_text(path, f.read(), hashes, out)
    return out


def scan_staged(root, hashes):
    entries, skip = [], skipper(root)
    for rec in git(root, "ls-files", "-s", "-z").decode().split("\0"):
        if not rec:
            continue
        meta, path = rec.split("\t", 1)
        mode, sha, _ = meta.split()
        if mode in ("100644", "100755") and not skip(path):
            entries.append((path, sha))
    if not entries:
        return []
    blob = git(root, "cat-file", "--batch", data="".join(s + "\n" for _, s in entries).encode())
    out, pos = [], 0
    for path, _ in entries:
        nl = blob.index(b"\n", pos)
        size = int(blob[pos:nl].split()[2])
        scan_text(path, blob[nl + 1:nl + 1 + size], hashes, out)
        pos = nl + 1 + size + 1
    return out


def add(name, local, explicit, root):
    if name == "-":
        name = sys.stdin.read()
    key = normalize(name)
    if not key:
        sys.exit("FAIL: the name has no letters or digits")
    if len(WORD.findall(name.lower())) > MAX_WORDS:
        print(f"note: only runs of up to {MAX_WORDS} words are hashed; the spaced form of this name will not match")
    if local:
        target = local_list()
    else:
        targets = primary_lists(explicit, root)
        if not targets:
            print("FAIL: no denylist to add to. Run this from cklph-marketplace-private, set "
                  "$CKLPH_IDENTIFIER_DENYLIST, or pass --local.", file=sys.stderr)
            return 2
        target = targets[0]
    h = digest(key)
    existing, _ = load([target])
    if h in existing:
        print(f"already listed in {target}")
        return 0
    with open(target, "a") as f:
        f.write(h + "\n")
    print(f"added 1 hash to {target}")
    return 0


def main(argv):
    staged = local = False
    explicit, name, root = [], None, None
    it = iter(argv)
    for a in it:
        if a == "--staged":
            staged = True
        elif a == "--local":
            local = True
        elif a == "--denylist":
            explicit.append(next(it))
        elif a == "--root":
            root = next(it)
        elif a == "--add":
            name = next(it)
        elif a in ("-h", "--help"):
            print(__doc__.strip())
            return 0
        else:
            print(f"unknown argument: {a}", file=sys.stderr)
            return 2
    try:
        root = git(root or os.getcwd(), "rev-parse", "--show-toplevel").decode().strip()
    except (subprocess.CalledProcessError, OSError):
        print(f"FAIL: {root or os.getcwd()} is not a git checkout", file=sys.stderr)
        return 2
    if name is not None:
        return add(name, local, explicit, root)

    hashes, used = load(primary_lists(explicit, root) + [local_list()])
    if not hashes:
        print("FAIL CLOSED: no identifier denylist loaded. Set $CKLPH_IDENTIFIER_DENYLIST or check out "
              "cklph-marketplace-private beside this repo.", file=sys.stderr)
        return 2
    hits = scan_staged(root, hashes) if staged else scan_worktree(root, hashes)
    quiet = bool(os.environ.get("CI"))
    for path, n, match in hits:
        print(f"{path}:{n}" if quiet else f"{path}:{n}: {match}")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
