# Routing Map — intent → component

Match what the user wants to the right skill, command, or agent. Skills auto-trigger; commands are explicit `/` entry points; agents are delegated workers.

## Intent → component
| If the user wants to… | Use |
|---|---|
| Get started / is unsure / vague ask | **getting-started** skill · **/kickoff** |
| Audit a page/funnel; "why isn't this converting"; low ATC; cart abandonment | **/cro-audit** · `ecommerce-cro-audit` skill · `cro-auditor` agent |
| Understand customers: mine reviews/tickets, code survey answers, plan polls or user tests, build a language bank | `voc-research` skill · `voc-coder` agent |
| Plan, size, or read out an A/B test; "how long should this run"; "did it win"; low traffic; test log | **/experiment** · `experiment-design` skill |
| Research a topic deeply, with sources; market/competitive research; fact-check | **/deep-research** · `deep-research-synthesis` skill · `deep-researcher` agent |
| Turn findings into a report/brief/one-pager; "write this up"; an HTML report | **/build-report** · `report-information-design` skill · `report-builder` agent |
| Write/rewrite copy: PDP, landing, headline, CTA, email, ad | `conversion-copywriting` skill |
| Cold outreach, follow-up cadence, qualify a deal, positioning, value prop | `outbound-and-positioning` skill |
| Sanity-check a deliverable before it ships | `cro-verifier` agent |
| Build/clean a Shopify product template in Liquid | `ecommerce-cro-audit` → `references/liquid-product-template-checklist.md` |

## Skills vs commands vs agents
- **Skills** load knowledge automatically when the request matches. Best for "just ask."
- **Commands** (`/cro-audit`, `/experiment`, `/deep-research`, `/build-report`, `/kickoff`) are explicit, accept flags, and can orchestrate.
- **Agents** are delegated workers for heavy or parallel work (parallel research streams, a focused audit pass, the writer, the verifier). Commands and skills delegate to them.

## The end-to-end engagement playbook
1. **Brief** — `getting-started` / `/kickoff`: capture or load `./cro-engagement.md` (include traffic per template, testing tool, research assets).
2. **Audit** — `/cro-audit`: check measurement, baseline the funnel, run `cro-auditor` (rendered capture + binary checklist) and `voc-coder` / `voc-research` (customer evidence) in parallel, then merge into evidence-tagged hypotheses sorted Instrument / Just do it / Test / Investigate.
3. **Plan tests** — `/experiment plan`: pre-register, size with real traffic, or route to the low-traffic options.
4. **Report** — `/build-report` (or `report-builder`): BLUF report + annotated blueprint, cite with the gapless spec, run the citation checker.
5. **Verify** — `cro-verifier`: every URL and load-bearing figure, evidence discipline, logic.
6. **Language** — `conversion-copywriting` writes test variants from the customer language bank; `outbound-and-positioning` as needed.
7. **Read out and learn** — `/experiment readout` after each test; log it; use per-lever win rates to rank the next round.
8. **Build** — for Shopify, use the Liquid product-template checklist; for redesigns, the report's annotated blueprint is the spec.

## Routing principles
- If the user already knows what they want, skip orientation and go straight to the tool.
- Prefer the smallest tool that does the job; escalate to agents only for heavy/parallel work.
- Always read the engagement brief first so routing and output are tailored.
