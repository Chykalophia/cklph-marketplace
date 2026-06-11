# Routing Map — intent → component

Match what the user wants to the right skill, command, or agent. Skills auto-trigger; commands are explicit `/` entry points; agents are delegated workers.

## Intent → component
| If the user wants to… | Use |
|---|---|
| Get started / is unsure / vague ask | **getting-started** skill · **/kickoff** |
| Audit a page/funnel; "why isn't this converting"; low ATC; cart abandonment | **/cro-audit** · `ecommerce-cro-audit` skill · `cro-auditor` agent |
| Research a topic deeply, with sources; market/competitive research; fact-check | **/deep-research** · `deep-research-synthesis` skill · `deep-researcher` agent |
| Turn findings into a report/brief/one-pager; "write this up"; an HTML report | **/build-report** · `report-information-design` skill · `report-builder` agent |
| Write/rewrite copy: PDP, landing, headline, CTA, email, ad | `conversion-copywriting` skill |
| Cold outreach, follow-up cadence, qualify a deal, positioning, value prop | `outbound-and-positioning` skill |
| Sanity-check a deliverable before it ships | `cro-verifier` agent |
| Build/clean a Shopify product template in Liquid | `ecommerce-cro-audit` → `references/liquid-product-template-checklist.md` |

## Skills vs commands vs agents
- **Skills** load knowledge automatically when the request matches. Best for "just ask."
- **Commands** (`/cro-audit`, `/deep-research`, `/build-report`, `/kickoff`) are explicit, accept flags, and can orchestrate.
- **Agents** are delegated workers for heavy or parallel work (parallel research streams, a focused audit pass, the writer, the verifier). Commands and skills delegate to them.

## The end-to-end engagement playbook
1. **Brief** — `getting-started` / `/kickoff`: capture or load `./cro-engagement.md`.
2. **Audit** — `/cro-audit`: ground in first-party data, fan out `deep-researcher` (evidence) + `cro-auditor` (page diagnostic), locate the leak, benchmark by tier, prioritize impact/effort, plan the experiment.
3. **Report** — `/build-report` (or `report-builder`): assemble a BLUF report + annotated blueprint, cite with the gapless spec, QA.
4. **Verify** — `cro-verifier`: check load-bearing claims, citation integrity, and that recommendations follow from evidence.
5. **Language** — `conversion-copywriting` (on-page copy) and `outbound-and-positioning` (outreach + positioning) as needed.
6. **Build** — for Shopify, use the Liquid product-template checklist; for redesigns, the report's annotated blueprint is the spec.

## Routing principles
- If the user already knows what they want, skip orientation and go straight to the tool.
- Prefer the smallest tool that does the job; escalate to agents only for heavy/parallel work.
- Always read the engagement brief first so routing and output are tailored.
