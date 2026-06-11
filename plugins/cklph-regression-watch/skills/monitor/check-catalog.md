# Regression Watch check catalog

Severity-weighted. ✅ = implemented in v1 engine. ◑ = scaffolded, needs the staging URL/journeys or extra wiring.

## 🟦 Availability & integrity
| ID | Check | Severity | Regressed when | Status |
|---|---|---|---|---|
| AV1 | HTTP status per URL | Critical | Was 200, now 4xx/5xx or load error | ✅ |
| AV2 | Redirect / final-URL integrity | High | Final URL differs from baseline | ✅ (flagged as change) |
| AV3 | Broken internal links | High | A link that was 200 now 4xx/5xx | ◑ v1.1 |
| AV4 | Console errors | Low | New console errors vs baseline | ◑ captured, not yet scored |

## 🟧 SEO integrity
| ID | Check | Severity | Regressed when | Status |
|---|---|---|---|---|
| SE1 | Title present/stable | High | Title emptied (regressed) or changed (FYI) | ✅ |
| SE2 | Canonical present + correct | High | Canonical removed or retargeted | ✅ |
| SE3 | Single H1 / structure | Medium | H1 lost or count changed | ✅ |
| SE4 | Indexability (robots meta) | Critical | New `noindex` on a page that was indexable | ✅ |
| SE5 | Sitemap reachable + non-empty | Medium | Sitemap 404s or empties | ◑ v1.1 |
| SE6 | JSON-LD structured data | High | Schema block disappears | ✅ |
| SE7 | Semrush site-audit delta | Medium | New crawl errors vs last run | ◑ Semrush MCP |

## ⬜ Tracking integrity
| ID | Check | Severity | Regressed when | Status |
|---|---|---|---|---|
| TR1 | GA4 / gtag fires | Critical | No g/collect or gtag/js request on load (baseline had it) | ✅ (network + DOM) |
| TR2 | GTM container loads | High | No gtm.js request/script (baseline had it) | ✅ |
| TR3 | Conversion event on journey | Critical | Expected event not seen during a journey | ◑ needs journeys |
| TR4 | Consent Mode v2 (EU) | High | Consent params missing where required | ◑ v1.1 |
| TR6 | GA4 volume sanity | Medium | Event volume ~0 vs trailing baseline | ◑ needs a GA4 connector (not wired); Shopify via ShopifyQL |

## Visual regression
| ID | Check | Severity | Regressed when | Status |
|---|---|---|---|---|
| VR1 | Full-page visual diff vs baseline | High | Diff % over tolerance after masking dynamic regions | ✅ (pixelmatch + masks) |
| VR2 | Key element presence (logo/nav/hero/footer) | High | A required element's box vanishes | ◑ v1.1 |

## 🟪 Journeys (staging pilot — full journeys)
| ID | Check | Severity | Regressed when | Status |
|---|---|---|---|---|
| JN1 | Primary CTA reachable + clickable | Critical | CTA missing or click doesn't reach expected state | ◑ needs URL + flow |
| JN2 | Contact / lead form submits | Critical | Form errors or success state not reached | ◑ staging: full submit |
| JN3 | Search / nav works | Medium | Key nav path broken | ◑ |
| JN4 | Checkout reaches/passes payment (staging) | Critical | Cart→checkout flow breaks | ◑ staging only |

Catalog grows like a CHECKS.md: add a row + the comparison logic in `lib/evaluate.mjs`.
