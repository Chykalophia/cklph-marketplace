---
name: wp-data
description: Read and write WordPress content with wp-cli — posts, pages, custom post types, post meta (including protected _* keys), options, terms, users, and media. Use when inspecting or modifying live WordPress data, seeding content, or wiring data for a template.
---

# wp-data — reading and writing WP with wp-cli

Inspect first, mutate deliberately, verify the write. Everything goes through `cwp wp <args>` (raw
wp-cli) plus `cwp meta-read` / `cwp meta-write` for meta. See `wp-connect` for the connection.

## Inspect

```bash
cwp wp post list --post_type=page  --fields=ID,post_title,post_status --format=csv
cwp wp post list --post_type=product --field=ID --format=ids
cwp wp post get 218 --fields=ID,post_title,post_status,post_type,post_name
cwp wp post meta list 218 --fields=meta_key --format=csv      # which meta exist
cwp wp option get siteurl
```

## Create / update

```bash
# create a draft post/page/template, capture its ID with --porcelain
ID=$(cwp wp post create --post_type=page --post_status=draft --post_title='My Page' --porcelain)

# titles with spaces/parens break the gateway shell if unquoted — single-quote the value remotely:
cwp wp post update 218 --post_status=publish --post_title='Single Product'

# simple meta:
cwp wp post meta update 218 _wp_page_template default
```

## Protected / large / serialized meta

For `_*` keys, big JSON blobs, or anything with quotes/backslashes, **do not** pass the value on the
command line — use the streamed write so it is `wp_slash()`-ed correctly:

```bash
cwp meta-read  218 _elementor_data layout.json      # save
cwp meta-write 218 _elementor_data layout.json      # write back (protected-safe)
```

Why: `_*` keys are REST-hidden, and WP's `update_metadata()` unslashes — passing a raw blob mangles
backslashes/quotes. `cwp meta-write` base64-streams over stdin and `wp_slash`es server-side. See the
gotchas in `wp-connect` (@../wp-connect/references/hosting-gotchas.md).

## Seed data (reviews, terms, etc.)

Write a PHP file, host it in the **shared webroot**, and `eval-file` it — robust across the gateway:

```php
// /www/wp-content/uploads/seed.php  (cwp put it, then: cwp wp eval-file /www/wp-content/uploads/seed.php)
foreach ($reviews as $r) {
  $cid = wp_insert_comment(['comment_post_ID'=>223,'comment_author'=>$r[0],
    'comment_content'=>$r[2],'comment_approved'=>1,'comment_type'=>'review']);
  add_comment_meta($cid,'rating',$r[1]);
}
// then sync WooCommerce caches the UI reads:
update_post_meta(223,'_wc_average_rating',$avg);
update_post_meta(223,'_wc_review_count',$n);
update_post_meta(223,'_wc_rating_count',$counts);
WC_Comments::clear_transients(223);
```

Delete the helper php from the webroot afterward (executable php under uploads is a small risk):
`cwp wp eval 'unlink("/www/wp-content/uploads/seed.php");'`.

## Verify every write
Read it back. For meta, compare the **parsed** value, not bytes (pretty-printing changes whitespace).
Cache-bust front-end checks (`?v=…`) — the CDN lags writes.
