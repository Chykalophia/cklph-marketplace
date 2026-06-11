// FIXTURE — architecture lens · should-not-flag (PRECISION)
// Clean look-alike: COINCIDENTAL SIMILARITY. These two functions have nearly identical
// SHAPE (validate input → map → return), so a naive clone detector / pure-LLM pass will be
// tempted to flag them. They encode UNRELATED knowledge, though, and merging them would be
// wrong (a false abstraction that couples two domains that change for different reasons).
// Expected verdict: DO NOT FLAG. The verifier should refute any "extract this" finding here.

// Knowledge A: formatting a person's display name. Changes when NAME presentation rules change.
export function formatDisplayName(first: string, last: string): string {
  const f = first.trim();
  const l = last.trim();
  if (!f && !l) return "Unknown";
  return [f, l].filter(Boolean).join(" ");
}

// Knowledge B: building a label slug. Same shape (trim → filter → join) but governed by an
// ENTIRELY different rule set (URL/label constraints), and it will diverge the moment slug
// rules change (lowercasing, dashes, max length) — none of which apply to display names.
export function buildLabelSlug(category: string, name: string): string {
  const c = category.trim();
  const n = name.trim();
  if (!c && !n) return "untitled";
  return [c, n].filter(Boolean).join("-");
}

// "Extract a shared join helper" here would couple name-formatting to label-slugging:
// two concerns that change independently. The similarity is incidental, not knowledge.
// → NOT a DRY violation.
