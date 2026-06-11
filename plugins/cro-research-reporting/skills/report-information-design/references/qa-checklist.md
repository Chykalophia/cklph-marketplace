# Pre-Delivery QA Checklist

Never present a report or HTML deliverable without running these. A single rendering bug erodes trust in the whole document.

## Structure & syntax
- **Tag balance:** counts match for the major containers.
  ```bash
  f=report.html
  echo "section $(grep -o '<section' "$f"|wc -l)/$(grep -o '</section>' "$f"|wc -l)"
  echo "div $(grep -o '<div' "$f"|wc -l)/$(grep -o '</div>' "$f"|wc -l)"
  echo "script $(grep -o '<script' "$f"|wc -l)/$(grep -o '</script>' "$f"|wc -l)"
  ```
- **No leftover scaffolding:** `grep -c 'INSERT-POINT\|TODO\|PLACEHOLDER' "$f"` should be 0 (if you built with sentinels).
- **Document closes properly:** `tail -c 40 "$f"` ends with `</html>`.
- **JS syntax (if any):** extract the script and check it.
  ```bash
  awk '/<script>/{f=1;next}/<\/script>/{f=0}f' "$f" > /tmp/r.js && node --check /tmp/r.js && echo "JS OK"
  ```

## Rendering (catch the visual bugs)
- **Render it.** If a headless browser is available, screenshot it. If not, render the suspect components in an inline preview/widget (note: previews may block non-allowlisted image hosts — that's a false "broken image", not a real bug).
- **Funnel/bar check:** confirm no chart puts text inside a data-width bar (RULE 1). Search for the anti-pattern: bars with text children.
- **Matrix/label check:** confirm no absolute-positioned label clouds (RULE 2); use quadrant grids.
- **Responsive:** shrink to ~375px; every multi-column grid collapses; nothing clips or overflows; sticky/mobile bars appear.
- **Dark/light:** if it may be viewed on a dark background, confirm text isn't invisible (don't rely on a transparent container with dark-only text).

## Content integrity
- **Footnote integrity:** every `href="#s-..."` has a matching `id="s-..."`.
  ```bash
  comm -23 <(grep -o 'href="#s-[a-z0-9-]*"' "$f"|sed 's/.*#//;s/"//'|sort -u) \
           <(grep -o 'id="s-[a-z0-9-]*"' "$f"|sed 's/id="//;s/"//'|sort -u)
  ```
  (Output should be empty — refs with no definition.)
- **Links resolve:** spot-check the 2–3 load-bearing source links actually load (and confirm the cited figure against the primary source).
- **Numbers consistent:** the same metric reads the same everywhere (exec summary vs body vs charts).
- **Brand match:** colors/fonts/logo match the subject's real brand, not a generic default.

## Final pass
- Read the executive summary alone — does it deliver 80% of the value?
- Does every recommendation have a "why" + evidence?
- Is the highest-impact action obvious and first?
- Then present the file (and offer a browser screenshot if you couldn't render locally).
