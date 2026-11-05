# Codebook and Language Bank Templates

## Codebook (one row per code)
| id | label | lever | definition | include if | exclude if | example 1 | example 2 |
|---|---|---|---|---|---|---|---|
| cost_shipping | Shipping cost surprise | Cost | Mentions shipping, tax or duty cost as a reason to hesitate | Cost appears late or is higher than expected | General "too expensive" (use cost_price) | "Shipping doubled the price" | "Didn't know about duties until checkout" |
| fit_uncertainty | Unsure about size/fit | Usability | Doubt about which size or whether it fits | Asks about sizing, compares to other brands | Complaints after receiving (use fit_actual) | "Do these run small?" | "I'm between sizes" |
| none | Explicitly no reason | — | The customer says nothing held them back | "Nothing", "no concerns" | Blank or off-topic answers (use skip) | "nope, all good" | "nothing really" |
| skip | Not codable | — | Blank, unreadable or off-topic | — | — | "" | "what time is it?" |

Levers: Cost, Trust, Usability, Comprehension, Motivation (Conversion.com framework) so themes line up with the test log. Leave `skip` items out of theme shares (report how many there were); `none` stays in the denominator.

## Theme summary (for the report)
| theme (code) | share of responses | n | sources | segment differences | page element | hypothesis |
|---|---|---|---|---|---|---|

## Language bank
| theme | verbatim phrase | source (review / survey / ticket / test) | date | use in copy? |
|---|---|---|---|---|
| <theme code> | "<exact customer words, copied from the source>" | <source type> | <YYYY-MM> | <copy use?> |

Copy written from these phrases goes to `conversion-copywriting`; keep the source so claims stay honest.
