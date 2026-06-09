# Site profile template

Start from `cwp profile` output, then flesh out the by-hand sections. Keep it terse and factual —
this is reference, not prose. Example shape (a WooCommerce + Elementor site):

```markdown
# Site profile — https://example.com

## Platform
- WordPress: 6.x  · PHP: 8.x  · Home: https://example.com
- Host: Flywheel (gateway slug team+acct+site)  · Webroot: /www  · CDN: Fastly (cache-bust ?v=)

## Active theme
- example-theme 2.1.0  (custom; controls product gallery layout + header/footer markup)

## Active plugins (name,version)  — what's possible is bounded by this list
- elementor 4.1.1 · elementor-pro 4.0.8 · woocommerce 9.x · advanced-custom-fields-pro 6.x · ...

## Post types
- post, page, product (woo), elementor_library (templates), <custom: video-testimonial>, ...

## Taxonomies
- category, post_tag, product_cat, product_tag, ...

## Custom fields
- ACF group "Product Extras" (group_abc): author [book_author] text, format [book_format] select
  - Fill via update_field('book_author', $val, $post_id)  (ACF reads by field name)
- Raw meta that matters: _wc_average_rating, _elementor_data (protected), ...

## Data structures / relationships
- Products use the single-product Elementor template (post 4545). Reviews = comments type=review + 'rating' meta.
- Newsletter form posts to <plugin/endpoint>.

## Templates that ACTUALLY render (theme builder)
- header → post 469 (Primary Header)   [471 has the condition but 469 renders — verify via page HTML]
- footer → post 476 (Primary Footer)
- single product → post 4545

## Quirks / NOT possible
- SSH gateway: no && / no scp; /tmp not shared across backends; /www is shared.
- Elementor container custom_css doesn't emit — use an html-widget <style>.
- Header is transparent/overlapping → pages carry a large top padding to clear it.
```
