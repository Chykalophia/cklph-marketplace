# Managed-host SSH gateway gotchas

Hard-won on Flywheel; most apply to WP Engine and other managed gateways that put a **restricted
forced-command shell** in front of wp-cli. Each one cost real debugging time — trust them.

## The shell is restricted
- **No `&&` / compound statements.** `ssh host "cmd1 && cmd2"` silently returns nothing. Run one
  command per SSH call, or chain with `;` only after testing that the gateway allows it.
- **No `scp` / SFTP subsystem.** `scp` fails (exit 255). Move files by streaming over an exec channel:
  `cat local | ssh host "cat > /remote/path"`. (`cwp put` does this.)
- `grep`, `sed`, `ls`, `cat` usually work (they're real commands the gateway forwards); `find` may not.

## `/tmp` is NOT shared; `/www` (the webroot) IS
- Managed gateways **load-balance each SSH connection to a different backend**. A file written to
  `/tmp` on connection A is **gone** on connection B. Symptom: you `cat > /tmp/x` then a later
  `wp eval-file /tmp/x` says *File doesn't exist*.
- The **webroot (`/www` on Flywheel) is shared storage** across backends. Write helper files there:
  `/www/wp-content/uploads/…`. ControlMaster multiplexing also pins calls to one backend, which is why
  consecutive `cwp` calls work — but don't rely on it across long gaps (the master expires).
- **Best:** avoid temp files entirely. Stream the payload over **stdin** into `wp eval` and read
  `php://stdin` server-side (what `cwp meta-write` does). No temp file, no sharing problem.

## Protected meta + slashing
- Meta keys starting with `_` are **hidden from the REST API** and from `register_meta` defaults.
  wp-cli reads/writes them fine; REST does not (without a custom route).
- WordPress's `update_metadata()` runs the value through `wp_unslash()`. So to store clean data you
  must pass it **`wp_slash()`-ed**: `update_post_meta($id,$key, wp_slash($json))`. This matches how
  plugins (e.g. Elementor) save. Skip the slash and quotes/backslashes get mangled.
- Validate round-trips: write, read back, compare the *parsed* value (whitespace will differ if you
  pretty-print). Test on a throwaway post first.

## Hosting a real file (icons, assets, mu-plugins)
- WordPress's `esc_url()` **strips `data:` URIs** — you cannot use a base64 data-URI as an image
  widget `src`. Host a real file and reference its URL.
- Write the file into the shared webroot, then reference the public URL:
  - Generate a PHP file locally with the bytes base64-embedded, `cwp put` it to
    `/www/wp-content/uploads/x.php`, then `cwp wp eval-file /www/wp-content/uploads/x.php` to
    `file_put_contents()` the decoded bytes next to it. Reference `https://site/wp-content/uploads/icon.png`.
  - `wp media import` from a **separate** SSH connection often fails because the source temp file
    landed on a different backend — do upload+import in one connection, or write straight to the webroot.
- A tiny **mu-plugin** (`/www/wp-content/mu-plugins/x.php`) is the clean way to add global filters
  (e.g. a WooCommerce breadcrumb delimiter). mu-plugins load with no activation step.

## CDN cache
- Managed hosts front the site with a CDN (Flywheel = Fastly). Your screenshots/curls can lag a
  deploy. **Cache-bust with a unique query param** (`?v=123`) on every verification fetch. The
  CSS file path (`post-<id>.css`) is also cached — append `?cb=…` when inspecting it.
