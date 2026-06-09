---
name: wp-connect
description: Connect Claude Code to a remote WordPress site via wp-cli over SSH, on managed hosts like Flywheel/WP Engine or a generic box. Use when first wiring up a WP site, when SSH/wp-cli calls fail or time out, or before any read/write against a live WordPress install.
---

# wp-connect — wp-cli over SSH, the reliable way

Reach WordPress through **wp-cli over an SSH host alias**. By default `cwp` opens a **fresh connection
per command and closes it** — secure (no shared socket to ride), at some speed cost. Opt into bounded
multiplexing with `CKLPH_WP_MUX=1` when you need throughput on a trusted machine. Never hardcode the
host in scripts — drive it from `CKLPH_WP_HOST`. Verify the key is authorized and `wp-cli` is present
**before** reading or writing.

## 1. One-time SSH alias (multiplexed)

Add to `~/.ssh/config` (the alias name is yours; the User is the host's SSH/SFTP slug). `cwp` adds the
`ControlMaster` options itself, so the alias only needs identity:

```sshconfig
Host my-wp
    HostName ssh.getflywheel.com          # Flywheel gateway; WPE = <install>.ssh.wpengine.net
    User team+account+site                # the exact slug from the host dashboard
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

The slug is **not** the public subdomain — get it from the host dashboard (Flywheel:
`team+account+site`; WP Engine: the install name).

## Connection mode — secure by default (no shared socket)

By **default `cwp` shares no socket**: every command opens its own SSH connection and closes it, so
nothing persistent exists for another same-user process to ride. Secure by default; the trade-off is
speed (a fresh connection per call) and possible **rate limiting on managed hosts** during bursts (a
`profile` or a screenshot loop makes many calls).

### Opt into multiplexing for speed — on a machine you trust
`CKLPH_WP_MUX=1` reuses one connection per host — but **security-bounded**, because an open
authenticated socket is a standing risk (same-user processes can ride it with no re-auth, and a
compromised machine has a live pipe to the host):

- **Idle close** — `CKLPH_WP_PERSIST` (90s): closes shortly after the last call.
- **Hard cap** — `CKLPH_WP_MAXLIFE` (600s): rotates the connection (close + fresh-auth reopen) past the cap.
- **Watchdog** — force-closes the master at the cap even if `cwp` is never run again.

Set it per-project in `./.cklph-wp` when you need the speed. Then:
```bash
cwp up        # open the master now
cwp status    # ALIVE/closed + age + time until it rotates/closes
cwp down      # close it — DO THIS when you finish a session
```
Don't raise the limits to hours — short-lived is the point.

### Why there's no per-process lock — UID is the boundary
A Unix-domain socket is access-controlled only by **filesystem permissions (UID-scoped)** — there's no
way to bind a `ControlMaster` socket to one process and exclude your others. A same-user attacker
doesn't even need it: they can use your **ssh-agent** to auth fresh connections. So the real boundary
is the user account; not sharing a socket (the default) is what removes the shared-socket vector. For
the most sensitive hosts add `ssh-add -c` (agent confirmation on every key use, so a rogue process
can't silently connect) + `ssh-add -t <secs>` (key expiry), and don't run untrusted code as your user.

## 2. Prove the connection before trusting it

```bash
ssh my-wp "wp --version"        # key authorized + wp-cli present?
ssh my-wp "wp option get siteurl"
```

If `Permission denied (publickey)` but `debug1: Server accepts key`, the key is authorized — it's just
not in the agent. Have the user run `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` (interactive;
you can't type the passphrase). If `Invalid request, you must specify a site`, the User slug is wrong.

## 3. Use the `cwp` wrapper

`export CKLPH_WP_HOST=my-wp` (or put it in `./.cklph-wp`), then:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/cwp env                      # site / core / theme
${CLAUDE_PLUGIN_ROOT}/scripts/cwp wp post list --post_type=page --fields=ID,post_title --format=csv
${CLAUDE_PLUGIN_ROOT}/scripts/cwp meta-write 218 _some_key payload.json   # protected-safe write
```

The wrapper filters the host's harmless PHP notices and uses the protected-meta write path that
sidesteps every gateway quirk. **Read those quirks before you fight one** — @references/hosting-gotchas.md.

## When NOT to use this
- A local dev site (LocalWP / wp-env / DDEV) where `wp` runs natively — skip SSH, call `wp` directly.
- REST-only access (no shell) — wp-cli is unavailable; expose what you need via a small mu-plugin REST route instead.
